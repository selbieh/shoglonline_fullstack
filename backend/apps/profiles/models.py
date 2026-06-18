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

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="worker_profile"
    )
    bio_title = models.CharField(max_length=120, blank=True)
    overview = models.TextField(blank=True)
    cover_image = models.URLField(blank=True)
    expertise_level = models.CharField(max_length=14, choices=ExpertiseLevel.choices, blank=True)
    hourly_rate = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    visibility = models.CharField(max_length=8, choices=Visibility.choices, default=Visibility.ONLINE)
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
        """Profile completion indicator (FR-PROF-3)."""
        checks = [
            bool(self.bio_title),
            bool(self.overview),
            bool(self.expertise_level),
            self.hourly_rate is not None,
            self.skills.exists(),
            self.educations.exists(),
            self.employments.exists(),
            self.languages.exists(),
        ]
        return int(100 * sum(checks) / len(checks))


class EmployerProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="employer_profile"
    )
    company_name = models.CharField(max_length=120, blank=True)
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

    profile = models.ForeignKey(WorkerProfile, on_delete=models.CASCADE, related_name="skills")
    skill = models.ForeignKey("catalog.Skill", on_delete=models.CASCADE, related_name="worker_skills")
    efficiency = models.CharField(max_length=12, choices=Efficiency.choices, default=Efficiency.INTERMEDIATE)

    class Meta:
        unique_together = [("profile", "skill")]


class PortfolioItem(models.Model):
    profile = models.ForeignKey(WorkerProfile, on_delete=models.CASCADE, related_name="portfolio")
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


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
