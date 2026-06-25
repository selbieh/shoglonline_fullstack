from django.db import transaction
from django.urls import reverse
from rest_framework import serializers

from apps.core.contact_guard import validate_no_contact

from ..models import (
    Certificate,
    Education,
    EmployerProfile,
    Employment,
    IDVerification,
    PortfolioItem,
    WorkerLanguage,
    WorkerProfile,
    WorkerSkill,
)


def _portfolio_media_url(attachment, request) -> str:
    """Absolute (public) URL that serves a portfolio image inline."""
    path = reverse("portfolio-media", args=[attachment.pk])
    return request.build_absolute_uri(path) if request else path


class PortfolioItemSerializer(serializers.ModelSerializer):
    """Read/write shape for a gallery item. Uploaded images are linked by passing the unlinked
    attachment id(s) via `attachment_ids` (write-only); `image_url` resolves to the public inline
    URL of the uploaded image when present."""

    attachment_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    skills = serializers.ListField(child=serializers.CharField(max_length=80), required=False)
    image_url = serializers.SerializerMethodField()
    gallery = serializers.SerializerMethodField()

    class Meta:
        model = PortfolioItem
        fields = [
            "id", "title", "description", "media_type", "url", "cover_url",
            "project_type", "project_link", "duration_value", "duration_unit",
            "skills", "completed_at", "ownership_confirmed",
            "budget", "features", "views_count",
            "image_url", "gallery", "attachment_ids", "order", "created_at",
        ]
        read_only_fields = ["id", "created_at", "views_count"]

    def get_image_url(self, obj) -> str:
        att = next((a for a in obj.attachments.all() if not a.is_deleted), None)
        return _portfolio_media_url(att, self.context.get("request")) if att else ""

    def get_gallery(self, obj) -> list[str]:
        """All inline image URLs for the work-showcase hero/thumbnail strip (ppt slide-22):
        every uploaded image, then any external image/cover URL — de-duped, order preserved."""
        request = self.context.get("request")
        urls = [_portfolio_media_url(a, request) for a in obj.attachments.all() if not a.is_deleted]
        if obj.media_type == PortfolioItem.MediaType.IMAGE and obj.url:
            urls.append(obj.url)
        if obj.cover_url:
            urls.append(obj.cover_url)
        seen: set[str] = set()
        return [u for u in urls if u and not (u in seen or seen.add(u))]

    def create(self, validated_data):
        validated_data.pop("attachment_ids", None)  # linked separately in the view
        return super().create(validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("attachment_ids", None)  # image edits handled separately
        return super().update(instance, validated_data)

    def validate_title(self, v):
        return validate_no_contact(v)

    def validate_description(self, v):
        return validate_no_contact(v)


class PublicPortfolioCardSerializer(serializers.ModelSerializer):
    """Public-safe tile for the global works gallery (معرض الأعمال). One entry per portfolio item —
    a thumbnail + title + the owning freelancer's identity — linking to the single-work showcase
    (slide-22). Mirrors the portfolio-media visibility gate (online, active workers)."""

    thumb = serializers.SerializerMethodField()
    category = serializers.SerializerMethodField()
    worker_id = serializers.IntegerField(source="profile.user_id", read_only=True)
    worker_name = serializers.SerializerMethodField()
    worker_avatar = serializers.CharField(source="profile.user.avatar_url", read_only=True)
    worker_rating = serializers.DecimalField(
        source="profile.rating_avg", max_digits=3, decimal_places=2, read_only=True
    )
    worker_rating_count = serializers.IntegerField(source="profile.rating_count", read_only=True)
    worker_verified = serializers.BooleanField(source="profile.is_verified", read_only=True)

    class Meta:
        model = PortfolioItem
        fields = [
            "id", "title", "media_type", "thumb", "project_type", "skills",
            "category", "views_count", "completed_at", "created_at",
            "worker_id", "worker_name", "worker_avatar",
            "worker_rating", "worker_rating_count", "worker_verified",
        ]

    def get_thumb(self, obj) -> str:
        att = next((a for a in obj.attachments.all() if not a.is_deleted), None)
        if att:
            return _portfolio_media_url(att, self.context.get("request"))
        if obj.media_type == PortfolioItem.MediaType.IMAGE and obj.url:
            return obj.url
        return obj.cover_url

    def get_category(self, obj):
        """The owning freelancer's discipline (المجال) — drives the gallery category facet/badge."""
        c = obj.profile.main_category
        return {"id": c.id, "name": c.name_ar, "slug": c.slug} if c else None

    def get_worker_name(self, obj) -> str:
        p = obj.profile
        u = p.user
        return p.display_name or f"{u.first_name} {u.last_name}".strip() or u.email.split("@")[0]


class CertificateSerializer(serializers.ModelSerializer):
    """Read/write shape for a training certificate (ppt slide-06). The optional file is linked
    by passing the unlinked attachment id(s) via `attachment_ids` (write-only); `file_id`/
    `file_name` expose the linked attachment for the owner (downloaded via the scoped /uploads)."""

    attachment_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    skills = serializers.ListField(child=serializers.CharField(max_length=80), required=False)
    file_name = serializers.SerializerMethodField()
    file_id = serializers.SerializerMethodField()

    class Meta:
        model = Certificate
        fields = [
            "id", "name", "issuer", "cert_type",
            "issued_month", "issued_year", "expiry_month", "expiry_year", "no_expiry",
            "credential_id", "verification_link", "skills",
            "file_name", "file_id", "attachment_ids", "order", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def _att(self, obj):
        return next((a for a in obj.attachments.all() if not a.is_deleted), None)

    def get_file_name(self, obj) -> str:
        att = self._att(obj)
        return att.original_name if att else ""

    def get_file_id(self, obj):
        att = self._att(obj)
        return att.id if att else None

    def create(self, validated_data):
        validated_data.pop("attachment_ids", None)  # linked separately in the view
        return super().create(validated_data)

    def validate_name(self, v):
        return validate_no_contact(v)


class WorkerSkillSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="skill.name_ar", read_only=True)
    skill_id = serializers.IntegerField()

    class Meta:
        model = WorkerSkill
        fields = ["skill_id", "name", "efficiency"]

    def validate_skill_id(self, v):
        # Reject unknown ids up front — otherwise a bad id raises an IntegrityError mid replace-all
        # (after the old skills were deleted), 500-ing the request and wiping the section.
        from apps.catalog.models import Skill  # noqa: PLC0415 (avoid import cycle)

        if not Skill.objects.filter(pk=v).exists():
            raise serializers.ValidationError("مهارة غير معروفة")
        return v


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
    educations = EducationSerializer(many=True, required=False)
    employments = EmploymentSerializer(many=True, required=False)
    languages = WorkerLanguageSerializer(many=True, required=False)
    portfolio = PortfolioItemSerializer(many=True, read_only=True)  # managed via /me/portfolio
    certificates = CertificateSerializer(many=True, read_only=True)  # managed via /me/certificates
    completeness_pct = serializers.IntegerField(read_only=True)

    class Meta:
        model = WorkerProfile
        fields = [
            "display_name",
            "bio_title",
            "overview",
            "cover_image",
            "intro_video",
            # ppt slide-02: private contact (owner-only; absent from every Public* serializer).
            "private_contact_channel",
            "private_contact_value",
            "expertise_level",
            "main_category",
            "specialization",
            "years_experience",
            "hourly_rate",
            "availability",
            "weekly_hours",
            "client_notes",
            "visibility",
            "publish_state",
            "publish_reject_reason",
            "rating_avg",
            "rating_count",
            "total_earned",
            "is_verified",
            "completeness_pct",
            "skills",
            "educations",
            "employments",
            "languages",
            "portfolio",
            "certificates",
        ]
        read_only_fields = ["rating_avg", "rating_count", "total_earned", "is_verified",
                            "publish_state", "publish_reject_reason"]

    def validate_overview(self, v):
        return validate_no_contact(v)

    def validate_bio_title(self, v):
        return validate_no_contact(v)

    def validate_client_notes(self, v):
        return validate_no_contact(v)

    @transaction.atomic  # replace-all sections must be all-or-nothing (no half-wiped profile)
    def update(self, instance, validated_data):
        skills = validated_data.pop("skills", None)
        educations = validated_data.pop("educations", None)
        employments = validated_data.pop("employments", None)
        languages = validated_data.pop("languages", None)
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
        # Repeatable sections use a replace-all write (mirrors `skills`): the client sends the full
        # list it wants to persist; we swap it in atomically per section.
        if educations is not None:
            instance.educations.all().delete()
            Education.objects.bulk_create([Education(profile=instance, **e) for e in educations])
        if employments is not None:
            instance.employments.all().delete()
            Employment.objects.bulk_create([Employment(profile=instance, **e) for e in employments])
        if languages is not None:
            instance.languages.all().delete()
            WorkerLanguage.objects.bulk_create(
                [WorkerLanguage(profile=instance, **lang) for lang in languages]
            )
        return instance


class PublicWorkerCardSerializer(serializers.ModelSerializer):
    """Public-safe freelancer card for the /freelancers directory (no PII)."""

    id = serializers.IntegerField(source="user_id", read_only=True)
    name = serializers.SerializerMethodField()
    avatar_url = serializers.CharField(source="user.avatar_url", read_only=True)
    skills = serializers.SerializerMethodField()
    portfolio_preview = serializers.SerializerMethodField()
    portfolio_count = serializers.SerializerMethodField()
    # Count of the worker's published (LIVE) services — annotated on the directory queryset so the
    # card can show «الخدمات» like the profile hero (no per-row query).
    services_count = serializers.IntegerField(read_only=True)
    city = serializers.SerializerMethodField()
    country = serializers.SerializerMethodField()

    class Meta:
        model = WorkerProfile
        fields = [
            "id",
            "name",
            "avatar_url",
            "bio_title",
            "overview",
            "expertise_level",
            "hourly_rate",
            "availability",
            "years_experience",
            "rating_avg",
            "rating_count",
            "is_verified",
            "skills",
            "portfolio_preview",
            "portfolio_count",
            "services_count",
            "city",
            "country",
        ]

    def get_name(self, obj) -> str:
        u = obj.user
        # Prefer the client-facing display name (slide-02); never leak the full email — fall
        # back to the user's names, then the email local-part.
        return obj.display_name or f"{u.first_name} {u.last_name}".strip() or u.email.split("@")[0]

    @staticmethod
    def _primary_address(obj):
        # Uses the prefetched `user.addresses` (no extra query in the list view).
        addrs = list(obj.user.addresses.all())
        return next((a for a in addrs if a.is_primary), addrs[0] if addrs else None)

    def get_city(self, obj) -> str:
        addr = self._primary_address(obj)
        return addr.city if addr else ""

    def get_country(self, obj) -> str:
        addr = self._primary_address(obj)
        return addr.country if addr else ""

    def get_skills(self, obj) -> list[str]:
        return [ws.skill.name_ar for ws in obj.skills.all()[:6]]

    def get_portfolio_preview(self, obj) -> list[dict]:
        """Up to 3 visual thumbnails (image upload, image url, or cover) for the directory card."""
        request = self.context.get("request")
        out: list[dict] = []
        for p in obj.portfolio.all():
            att = next((a for a in p.attachments.all() if not a.is_deleted), None)
            if att:
                thumb = _portfolio_media_url(att, request)
            elif p.media_type == PortfolioItem.MediaType.IMAGE and p.url:
                thumb = p.url
            else:
                thumb = p.cover_url
            if thumb:
                out.append({"media_type": p.media_type, "thumb": thumb, "title": p.title})
            if len(out) == 3:
                break
        return out

    def get_portfolio_count(self, obj) -> int:
        return len(obj.portfolio.all())  # reuse the prefetch (no extra query)


class PublicCertificateSerializer(serializers.ModelSerializer):
    """Public-safe certificate for the profile (no file/attachment exposed)."""

    class Meta:
        model = Certificate
        fields = [
            "id", "name", "issuer", "cert_type",
            "issued_year", "expiry_year", "no_expiry", "verification_link", "skills",
        ]


class PublicWorkerDetailSerializer(PublicWorkerCardSerializer):
    """Full public freelancer profile for /freelancers/<id> (FR-PROF-4) — feeds the SEO page +
    JSON-LD Person/aggregateRating in Part 08."""

    skills = WorkerSkillSerializer(many=True, read_only=True)
    languages = WorkerLanguageSerializer(many=True, read_only=True)
    educations = EducationSerializer(many=True, read_only=True)
    employments = EmploymentSerializer(many=True, read_only=True)
    portfolio = PortfolioItemSerializer(many=True, read_only=True)
    certificates = PublicCertificateSerializer(many=True, read_only=True)
    reviews = serializers.SerializerMethodField()

    class Meta(PublicWorkerCardSerializer.Meta):
        # `overview`, `city`, `country` are already provided by the card serializer.
        fields = PublicWorkerCardSerializer.Meta.fields + [
            "intro_video",
            "years_experience",
            "cover_image",
            "total_earned",
            "languages",
            "educations",
            "employments",
            "portfolio",
            "certificates",
            "reviews",
        ]

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
        fields = ["status", "doc_type", "consent", "reject_reason", "created_at", "reviewed_at"]
        read_only_fields = fields


class EmployerProfileSerializer(serializers.ModelSerializer):
    """GET/PATCH /me/employer-profile (ppt slide-26)."""

    class Meta:
        model = EmployerProfile
        fields = [
            "company_name", "field", "country", "city", "timezone", "logo_url",
            "rating_avg", "rating_count", "total_spent", "created_at",
        ]
        read_only_fields = ["rating_avg", "rating_count", "total_spent", "created_at"]
