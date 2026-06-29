"""Worker/Employer profiles — both lazily created for every user (SRS §10.1)."""
from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models


class WorkerProfile(models.Model):
    class ExpertiseLevel(models.TextChoices):
        ENTRY = "entry", "Entry"
        INTERMEDIATE = "intermediate", "Intermediate"
        EXPERT = "expert", "Expert"

    class Visibility(models.TextChoices):
        ONLINE = "online", "Online"
        OFFLINE = "offline", "Offline"

    class Availability(models.TextChoices):  # ppt slide-07: التوفر للعمل
        AVAILABLE_NOW = "available_now", "Available now"
        AVAILABLE_SOON = "available_soon", "Available soon"
        UNAVAILABLE = "unavailable", "Unavailable"

    class PublishState(models.TextChoices):  # ppt slide-09 + rule D-1: draft → pending_review → published
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        PUBLISHED = "published", "Published"
        REJECTED = "rejected", "Rejected"

    class ContactChannel(models.TextChoices):  # ppt slide-02: وسيلة تواصل (private — never public)
        WHATSAPP = "whatsapp", "WhatsApp"
        PHONE = "phone", "Phone"
        EMAIL = "email", "Email"
        TELEGRAM = "telegram", "Telegram"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="worker_profile"
    )
    # ppt slide-02: name shown to clients (falls back to user names in the serializer).
    display_name = models.CharField(max_length=120, blank=True)
    bio_title = models.CharField(max_length=120, blank=True)  # also the المسمى الوظيفي (slide-03)
    overview = models.TextField(blank=True)
    cover_image = models.URLField(blank=True)
    intro_video = models.URLField(blank=True)  # ppt slide-02: فيديو تقديمي (optional)
    # ppt slide-02: a required external-contact method collected at onboarding for platform/admin use.
    # PRIVATE — deliberately excluded from every Public* serializer (slides 01/25: profile shows no
    # external contact) and NOT passed through validate_no_contact (this field is meant to hold it).
    private_contact_channel = models.CharField(
        max_length=12, choices=ContactChannel.choices, blank=True
    )
    private_contact_value = models.CharField(max_length=160, blank=True)
    expertise_level = models.CharField(max_length=14, choices=ExpertiseLevel.choices, blank=True)
    # ppt slide-03: main field + specialization (both catalog.Category; child = specialization).
    main_category = models.ForeignKey(
        "catalog.Category", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    specialization = models.ForeignKey(
        "catalog.Category", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    years_experience = models.PositiveSmallIntegerField(null=True, blank=True)  # slide-03
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    # ppt slide-07: التوفر للعمل / عدد ساعات العمل أسبوعيًا / ملاحظات للعملاء.
    availability = models.CharField(
        max_length=14, choices=Availability.choices, default=Availability.AVAILABLE_NOW
    )
    weekly_hours = models.PositiveSmallIntegerField(null=True, blank=True)
    client_notes = models.CharField(max_length=300, blank=True)
    visibility = models.CharField(max_length=8, choices=Visibility.choices, default=Visibility.ONLINE)
    # ppt slide-09 + rule D-1: a worker submits for review at ≥70% → PENDING_REVIEW; an admin
    # approves → PUBLISHED (or rejects → REJECTED + reason). Defaults to DRAFT: a lazily
    # auto-created profile (every signup gets one on first /me access) is NOT a freelancer until
    # the worker explicitly publishes it. The public directory / gallery / detail surfaces are all
    # gated on PUBLISHED, so a draft never appears as a freelancer to the public.
    publish_state = models.CharField(
        max_length=20, choices=PublishState.choices, default=PublishState.DRAFT
    )
    publish_reject_reason = models.CharField(max_length=300, blank=True, default="")
    publish_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )
    publish_reviewed_at = models.DateTimeField(null=True, blank=True)
    visibility_changed_at = models.DateTimeField(auto_now_add=True)  # BR-16 reminder anchor
    offline_reminder_sent = models.BooleanField(default=False)  # BR-16: fire once per offline window
    rating_avg = models.DecimalField(max_digits=3, decimal_places=2, default=0)  # denorm
    rating_count = models.PositiveIntegerField(default=0)
    total_earned = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # denorm
    is_verified = models.BooleanField(default=False)  # FR-PROF-6: national-ID verified badge
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"worker:{self.user_id}"

    @property
    def completeness_pct(self) -> int:
        """Profile completion indicator (FR-PROF-3).

        Counts only the fields the onboarding wizard actually collects, so the % it shows the
        user matches the publish gate exactly (educations/employments are not wizard steps and
        would make a "100%" wizard fail the gate — see P1-02)."""
        checks = [
            bool(self.bio_title),
            bool(self.overview),
            bool(self.expertise_level),
            self.hourly_rate is not None,
            self.skills.exists(),
            self.languages.exists(),
        ]
        return int(100 * sum(checks) / len(checks))


class EmployerProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="employer_profile"
    )
    company_name = models.CharField(max_length=120, blank=True)
    # ppt slide-26: create employer profile (field/location/timezone/logo).
    field = models.CharField(max_length=120, blank=True)   # المجال
    country = models.CharField(max_length=64, blank=True)
    city = models.CharField(max_length=64, blank=True)
    timezone = models.CharField(max_length=48, blank=True)
    logo_url = models.URLField(blank=True)                 # شعار الشركة (optional)
    rating_avg = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    rating_count = models.PositiveIntegerField(default=0)
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"employer:{self.user_id}"


class Address(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="addresses")
    country = models.CharField(max_length=64)
    city = models.CharField(max_length=64)
    state = models.CharField(max_length=64, blank=True)
    zip_code = models.CharField(max_length=16, blank=True)
    time_zone = models.CharField(max_length=48, blank=True)
    is_primary = models.BooleanField(default=True)


class WorkerSkill(models.Model):
    class Efficiency(models.TextChoices):
        BEGINNER = "beginner", "Beginner"
        INTERMEDIATE = "intermediate", "Intermediate"
        ADVANCED = "advanced", "Advanced"
        EXPERT = "expert", "Expert"  # ppt slide-04: 4th skill level (خبير)

    profile = models.ForeignKey(WorkerProfile, on_delete=models.CASCADE, related_name="skills")
    skill = models.ForeignKey("catalog.Skill", on_delete=models.CASCADE, related_name="worker_skills")
    efficiency = models.CharField(max_length=12, choices=Efficiency.choices, default=Efficiency.INTERMEDIATE)

    class Meta:
        unique_together = [("profile", "skill")]


class PortfolioItem(models.Model):
    """A piece of a worker's public work gallery (معرض الأعمال, FR-PROF-4). Each item is either
    an uploaded image (linked via the Part 03 attachment pipeline — this row is the host), or an
    external link / video URL (live project, YouTube, Vimeo …). Public by design — uploaded images
    are served inline through the dedicated public portfolio-media endpoint, NOT /uploads/<id>."""

    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        LINK = "link", "Link"

    class DurationUnit(models.TextChoices):  # ppt slide-05: مدة التنفيذ
        DAY = "day", "Day"
        MONTH = "month", "Month"

    profile = models.ForeignKey(WorkerProfile, on_delete=models.CASCADE, related_name="portfolio")
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    media_type = models.CharField(max_length=8, choices=MediaType.choices, default=MediaType.IMAGE)
    url = models.URLField(blank=True)  # external link / video URL / external image URL
    cover_url = models.URLField(blank=True)  # optional thumbnail for video/link items
    # ppt slides 05/23: model a project (type, link, duration, skills, completion, ownership).
    project_type = models.CharField(max_length=80, blank=True)        # نوع المشروع
    project_link = models.URLField(blank=True)                        # رابط المشروع (distinct from media url)
    duration_value = models.PositiveSmallIntegerField(null=True, blank=True)
    duration_unit = models.CharField(max_length=8, choices=DurationUnit.choices, blank=True)
    skills = models.JSONField(default=list, blank=True)               # المهارات المستخدمة (list[str])
    completed_at = models.DateField(null=True, blank=True)            # تاريخ الإنجاز
    ownership_confirmed = models.BooleanField(default=False)          # slide-23 تأكيد الشروط
    # ppt slide-22 (work showcase): budget, feature bullets, and a public view counter.
    budget = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)  # الميزانية
    features = models.JSONField(default=list, blank=True)             # مميزات المشروع (list[str])
    views_count = models.PositiveIntegerField(default=0)             # مشاهدات العمل
    attachments = GenericRelation(
        "attachments.Attachment", content_type_field="host_type", object_id_field="object_id"
    )
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]


class Certificate(models.Model):
    """A training certificate / credential (الشهادات التدريبية, ppt slide-06). The optional
    certificate file is linked via the Part 03 attachment pipeline (this row is the host),
    mirroring PortfolioItem."""

    profile = models.ForeignKey(
        WorkerProfile, on_delete=models.CASCADE, related_name="certificates"
    )
    name = models.CharField(max_length=200)
    issuer = models.CharField(max_length=160, blank=True)          # الجهة المانحة
    cert_type = models.CharField(max_length=80, blank=True)        # نوع الشهادة
    issued_month = models.PositiveSmallIntegerField(null=True, blank=True)
    issued_year = models.PositiveSmallIntegerField(null=True, blank=True)
    expiry_month = models.PositiveSmallIntegerField(null=True, blank=True)
    expiry_year = models.PositiveSmallIntegerField(null=True, blank=True)
    no_expiry = models.BooleanField(default=False)                 # لا يوجد تاريخ انتهاء
    credential_id = models.CharField(max_length=120, blank=True)
    verification_link = models.URLField(blank=True)
    skills = models.JSONField(default=list, blank=True)            # المهارات المكتسبة (list[str])
    attachments = GenericRelation(
        "attachments.Attachment", content_type_field="host_type", object_id_field="object_id"
    )
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]


class Education(models.Model):
    profile = models.ForeignKey(WorkerProfile, on_delete=models.CASCADE, related_name="educations")
    school = models.CharField(max_length=120)
    area_of_study = models.CharField(max_length=120, blank=True)
    degree = models.CharField(max_length=80, blank=True)
    date_from = models.CharField(max_length=10, blank=True)
    date_to = models.CharField(max_length=20, blank=True)
    description = models.TextField(blank=True)


class Employment(models.Model):
    profile = models.ForeignKey(WorkerProfile, on_delete=models.CASCADE, related_name="employments")
    company = models.CharField(max_length=120)
    job_title = models.CharField(max_length=120)
    city = models.CharField(max_length=64, blank=True)
    country = models.CharField(max_length=64, blank=True)
    period_from = models.CharField(max_length=10, blank=True)
    period_to = models.CharField(max_length=20, blank=True)
    description = models.TextField(blank=True)


class WorkerLanguage(models.Model):
    class Proficiency(models.TextChoices):
        BASIC = "basic", "Basic"
        ADVANCED = "advanced", "Advanced"
        NATIVE = "native", "Native"

    profile = models.ForeignKey(WorkerProfile, on_delete=models.CASCADE, related_name="languages")
    name = models.CharField(max_length=48)
    proficiency = models.CharField(max_length=10, choices=Proficiency.choices)


class IDVerification(models.Model):
    """National-ID verification request (FR-PROF-6). The uploaded ID file links via the
    Part 03 attachment pipeline (host = this record); admin reviews → sets WorkerProfile.is_verified.
    One record per user; a rejected user may re-submit (resets to pending with a new file)."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending review"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="id_verification"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    doc_type = models.CharField(max_length=20, blank=True)  # national_id / passport / driver_license (slide-08)
    consent = models.BooleanField(default=False)  # user consented to identity verification (slide-08)
    attachments = GenericRelation(
        "attachments.Attachment", content_type_field="host_type", object_id_field="object_id"
    )
    reject_reason = models.CharField(max_length=300, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"id-verification:{self.user_id} ({self.status})"
