from rest_framework import serializers

from ..models import (
    Education,
    Employment,
    IDVerification,
    PortfolioItem,
    WorkerLanguage,
    WorkerProfile,
    WorkerSkill,
)


class PortfolioItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PortfolioItem
        fields = ["id", "title", "description", "created_at"]


class WorkerSkillSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="skill.name_ar", read_only=True)
    skill_id = serializers.IntegerField()

    class Meta:
        model = WorkerSkill
        fields = ["skill_id", "name", "efficiency"]


class EducationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Education
        exclude = ["profile"]


class EmploymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employment
        exclude = ["profile"]


class WorkerLanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkerLanguage
        exclude = ["profile"]


class WorkerProfileSerializer(serializers.ModelSerializer):
    skills = WorkerSkillSerializer(many=True, required=False)
    educations = EducationSerializer(many=True, read_only=True)
    employments = EmploymentSerializer(many=True, read_only=True)
    languages = WorkerLanguageSerializer(many=True, read_only=True)
    completeness_pct = serializers.IntegerField(read_only=True)

    class Meta:
        model = WorkerProfile
        fields = [
            "bio_title",
            "overview",
            "cover_image",
            "expertise_level",
            "hourly_rate",
            "visibility",
            "rating_avg",
            "rating_count",
            "total_earned",
            "is_verified",
            "completeness_pct",
            "skills",
            "educations",
            "employments",
            "languages",
        ]
        read_only_fields = ["rating_avg", "rating_count", "total_earned", "is_verified"]

    def update(self, instance, validated_data):
        skills = validated_data.pop("skills", None)
        # BR-16: re-anchor the offline timer whenever visibility actually flips, and re-arm the
        # once-per-window reminder. (visibility_changed_at is auto_now_add — only set on create —
        # so we bump it explicitly here, the single real toggle path.)
        new_visibility = validated_data.get("visibility")
        visibility_flipped = new_visibility is not None and new_visibility != instance.visibility
        instance = super().update(instance, validated_data)
        if visibility_flipped:
            from django.utils import timezone
            WorkerProfile.objects.filter(pk=instance.pk).update(
                visibility_changed_at=timezone.now(), offline_reminder_sent=False
            )
            instance.refresh_from_db(fields=["visibility_changed_at", "offline_reminder_sent"])
        if skills is not None:
            instance.skills.all().delete()
            for item in skills:
                WorkerSkill.objects.create(
                    profile=instance,
                    skill_id=item["skill_id"],
                    efficiency=item.get("efficiency", WorkerSkill.Efficiency.INTERMEDIATE),
                )
        return instance


class PublicWorkerCardSerializer(serializers.ModelSerializer):
    """Public-safe freelancer card for the /freelancers directory (no PII)."""

    id = serializers.IntegerField(source="user_id", read_only=True)
    name = serializers.SerializerMethodField()
    avatar_url = serializers.CharField(source="user.avatar_url", read_only=True)
    skills = serializers.SerializerMethodField()

    class Meta:
        model = WorkerProfile
        fields = [
            "id",
            "name",
            "avatar_url",
            "bio_title",
            "expertise_level",
            "hourly_rate",
            "rating_avg",
            "rating_count",
            "is_verified",
            "skills",
        ]

    def get_name(self, obj) -> str:
        u = obj.user
        # Never leak the full email publicly — fall back to the local-part only.
        return f"{u.first_name} {u.last_name}".strip() or u.email.split("@")[0]

    def get_skills(self, obj) -> list[str]:
        return [ws.skill.name_ar for ws in obj.skills.all()[:6]]


class PublicWorkerDetailSerializer(PublicWorkerCardSerializer):
    """Full public freelancer profile for /freelancers/<id> (FR-PROF-4) — feeds the SEO page +
    JSON-LD Person/aggregateRating in Part 08."""

    skills = WorkerSkillSerializer(many=True, read_only=True)
    languages = WorkerLanguageSerializer(many=True, read_only=True)
    educations = EducationSerializer(many=True, read_only=True)
    employments = EmploymentSerializer(many=True, read_only=True)
    portfolio = PortfolioItemSerializer(many=True, read_only=True)
    city = serializers.SerializerMethodField()
    reviews = serializers.SerializerMethodField()

    class Meta(PublicWorkerCardSerializer.Meta):
        fields = PublicWorkerCardSerializer.Meta.fields + [
            "overview",
            "cover_image",
            "total_earned",
            "city",
            "languages",
            "educations",
            "employments",
            "portfolio",
            "reviews",
        ]

    def get_city(self, obj) -> str:
        addr = (obj.user.addresses.filter(is_primary=True).first()
                or obj.user.addresses.first())
        return addr.city if addr else ""

    def get_reviews(self, obj) -> list:
        from apps.reviews.models import Review  # noqa: PLC0415 (avoid import cycle)
        rows = Review.objects.filter(subject_id=obj.user_id).select_related("author")[:10]
        return [{
            "id": r.id,
            "rating": r.rating,
            "comment": r.comment,
            "author_name": (f"{r.author.first_name} {r.author.last_name}".strip()
                            or r.author.email.split("@")[0]),
            "created_at": r.created_at,
        } for r in rows]


class IDVerificationSerializer(serializers.ModelSerializer):
    """Status view for the owner's national-ID verification (FR-PROF-6)."""

    class Meta:
        model = IDVerification
        fields = ["status", "reject_reason", "created_at", "reviewed_at"]
        read_only_fields = fields
