from rest_framework import serializers

from apps.core.contact_guard import validate_no_contact

from ..models import Invitation, Job, Proposal, ScreeningQuestion


class ScreeningQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScreeningQuestion
        fields = ["id", "question", "is_required", "order"]


class JobListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name_ar", read_only=True)
    skill_names = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            "id", "title", "slug", "description", "category", "category_name", "skill_names",
            "budget_min", "budget_max", "location_type", "country", "city", "status",
            "published_at", "expires_at", "created_at", "proposals_count", "is_private",
        ]

    def get_skill_names(self, obj) -> list[str]:
        return [s.name_ar for s in obj.skills.all()]


class JobDetailSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name_ar", read_only=True)
    screening_questions = ScreeningQuestionSerializer(many=True, read_only=True)
    skill_ids = serializers.PrimaryKeyRelatedField(
        source="skills", many=True, read_only=True
    )
    employer_name = serializers.SerializerMethodField()
    is_locked = serializers.BooleanField(read_only=True)
    # True only for the signed-in worker who was invited to this (private) job — the client uses it
    # to show "no bid charged" on the proposal form, since invited proposals are free (BR-7).
    viewer_invited = serializers.SerializerMethodField()

    class Meta:
        model = Job
        fields = [
            "id", "title", "slug", "description", "category", "category_name", "subcategory",
            "skill_ids", "budget_min", "budget_max", "deadline", "expected_days", "location_type", "country",
            "city", "status", "reject_reason", "published_at", "expires_at", "proposals_count",
            "is_locked", "employer", "employer_name", "screening_questions", "created_at",
            "meta_title", "meta_description", "is_private", "viewer_invited",
        ]

    def get_employer_name(self, obj) -> str:
        return f"{obj.employer.first_name} {obj.employer.last_name}".strip() or "صاحب العمل"

    def get_viewer_invited(self, obj) -> bool:
        if not obj.is_private:
            return False
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return False
        from ..models import Invitation  # noqa: PLC0415 (avoid import cycle)
        return Invitation.objects.filter(
            job=obj, worker=user,
            status__in=[Invitation.Status.SENT, Invitation.Status.ACCEPTED],
        ).exists()


class JobCreateSerializer(serializers.ModelSerializer):
    screening_questions = ScreeningQuestionSerializer(many=True, required=False)
    skill_ids = serializers.ListField(child=serializers.IntegerField(), required=False)
    expected_days = serializers.IntegerField(min_value=1, max_value=365, required=False, allow_null=True)
    # Budgets are whole USD amounts — reject decimals/text at the API boundary (the model stores Decimal).
    budget_min = serializers.IntegerField(min_value=0)
    budget_max = serializers.IntegerField(min_value=0)
    # Hiring a specific freelancer (profile "توظيف المستقل" → /jobs/new?hire=ID): makes the job
    # PRIVATE + invite-only so it is never broadcast publicly and the chosen worker is notified.
    invited_worker_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = Job
        fields = [
            "title", "description", "category", "subcategory", "skill_ids", "budget_min",
            "budget_max", "deadline", "expected_days", "location_type", "country", "city",
            "screening_questions", "invited_worker_id",
        ]

    def validate_invited_worker_id(self, value):
        if value is None:
            return value
        from apps.accounts.models import User  # noqa: PLC0415 (avoid import cycle)
        if value == self.context["request"].user.id:
            raise serializers.ValidationError("لا يمكنك توظيف نفسك")  # BR-21
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("المستقل غير موجود")
        return value

    def validate(self, attrs):
        if attrs["budget_min"] > attrs["budget_max"]:
            raise serializers.ValidationError({"budget_max": "الحد الأدنى أكبر من الأعلى"})
        deadline = attrs.get("deadline")
        if deadline is not None:
            from django.utils import timezone  # noqa: PLC0415
            if deadline < timezone.now().date():
                raise serializers.ValidationError({"deadline": "الموعد النهائي في الماضي"})
        return attrs

    # No hard contact-info block here: a match must not fail submission (false positives would block
    # legitimate posts). The soft gate lives in services.submit_for_publication, which diverts a
    # flagged post to admin review instead of rejecting it.

    def create(self, validated_data):
        questions = validated_data.pop("screening_questions", [])
        skill_ids = validated_data.pop("skill_ids", [])
        invited_worker_id = validated_data.pop("invited_worker_id", None)
        job = Job.objects.create(
            employer=self.context["request"].user,
            is_private=bool(invited_worker_id),  # an invited hire is private (FR-JOB-12)
            invited_worker_id=invited_worker_id or None,
            **validated_data,
        )
        if skill_ids:
            job.skills.set(skill_ids)
        for index, q in enumerate(questions):
            ScreeningQuestion.objects.create(
                job=job, question=q["question"], is_required=q.get("is_required", True), order=index
            )
        return job


class ProposalSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source="job.title", read_only=True)
    job_slug = serializers.CharField(source="job.slug", read_only=True)
    worker_name = serializers.SerializerMethodField()

    class Meta:
        model = Proposal
        fields = [
            "id", "job", "job_title", "job_slug", "worker", "worker_name", "budget",
            "delivery_days", "description", "status", "reject_reason", "bid_consumed",
            "bid_refunded", "created_at",
        ]
        read_only_fields = ["job", "worker", "status", "reject_reason", "bid_consumed", "bid_refunded"]

    def get_worker_name(self, obj) -> str:
        return f"{obj.worker.first_name} {obj.worker.last_name}".strip() or "مستقل"


class EmployerProposalSerializer(ProposalSerializer):
    """Employer view adds the private rating (BR-8: visible only to the employer)."""

    class Meta(ProposalSerializer.Meta):
        fields = ProposalSerializer.Meta.fields + ["employer_private_rating"]


class ProposalCreateSerializer(serializers.Serializer):
    budget = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=1,
        error_messages={"min_value": "أدخل قيمة أكبر من صفر"},
    )
    delivery_days = serializers.IntegerField(min_value=1, max_value=365)
    description = serializers.CharField()
    answers = serializers.DictField(child=serializers.CharField(allow_blank=True), required=False, default=dict)

    def validate_description(self, v):
        return validate_no_contact(v)


class InvitationSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source="job.title", read_only=True)
    job_slug = serializers.CharField(source="job.slug", read_only=True)  # the job page is keyed by slug
    employer_name = serializers.SerializerMethodField()
    worker_name = serializers.SerializerMethodField()

    class Meta:
        model = Invitation
        fields = ["id", "job", "job_slug", "job_title", "employer_name", "worker_name",
                  "private_message", "status", "created_at"]

    def get_employer_name(self, obj) -> str:
        return f"{obj.employer.first_name} {obj.employer.last_name}".strip() or "صاحب العمل"

    def get_worker_name(self, obj) -> str:
        return f"{obj.worker.first_name} {obj.worker.last_name}".strip() or "المستقل"
