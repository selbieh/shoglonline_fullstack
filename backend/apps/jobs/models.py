"""Jobs, proposals, invitations, watchlist — SRS ERD §10.2, state machines §9.10."""
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils.text import slugify


class Job(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft"
        PENDING_REVIEW = "pending_review"
        PUBLISHED = "published"
        IN_PROGRESS = "in_progress"
        COMPLETED = "completed"
        CLOSED = "closed"
        REJECTED = "rejected"
        ARCHIVED = "archived"
        SUSPENDED = "suspended"  # owner frozen (BR-23) — hidden until unfreeze restores it

    class LocationType(models.TextChoices):
        REMOTE = "remote", "Remote"
        ONSITE = "onsite", "On-site"
        HYBRID = "hybrid", "Hybrid"

    employer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="jobs")
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True, allow_unicode=True, blank=True)
    description = models.TextField()
    category = models.ForeignKey("catalog.Category", on_delete=models.PROTECT, related_name="jobs")
    subcategory = models.ForeignKey(
        "catalog.Category", null=True, blank=True, on_delete=models.PROTECT, related_name="sub_jobs"
    )
    skills = models.ManyToManyField("catalog.Skill", blank=True, related_name="jobs")
    budget_min = models.DecimalField(max_digits=10, decimal_places=2)
    budget_max = models.DecimalField(max_digits=10, decimal_places=2)
    deadline = models.DateField(null=True, blank=True)
    expected_days = models.PositiveSmallIntegerField(null=True, blank=True)  # expected delivery window in days
    location_type = models.CharField(max_length=8, choices=LocationType.choices, default=LocationType.REMOTE)
    country = models.CharField(max_length=64, blank=True)
    city = models.CharField(max_length=64, blank=True)
    # Optional SEO overrides — when blank the frontend falls back to title / a description excerpt.
    meta_title = models.CharField(max_length=70, blank=True, help_text="عنوان SEO (≤70 حرفًا) — يُستخدم عنوان الوظيفة عند تركه فارغًا")
    meta_description = models.CharField(max_length=160, blank=True, help_text="وصف SEO (≤160 حرفًا) — يُشتق من الوصف عند تركه فارغًا")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    frozen_prev_status = models.CharField(max_length=16, blank=True, default="")  # restore target on unfreeze (BR-23)
    reject_reason = models.TextField(blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)  # FR-JOB-17
    proposals_count = models.PositiveIntegerField(default=0)  # denorm
    is_private = models.BooleanField(default=False)
    invited_worker = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="private_jobs"
    )
    source_job = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="reposts")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress projects post ID (data migration).",
    )

    class Meta:
        ordering = ["-published_at", "-created_at"]
        indexes = [models.Index(fields=["status", "category", "-published_at"])]

    def __str__(self) -> str:
        return self.title

    @property
    def is_locked(self) -> bool:
        """BR-4: title/description locked once any proposal exists."""
        return self.proposals_count > 0

    def _build_unique_slug(self) -> str:
        """A collision-free unicode slug derived from the title (mirrors services._unique_slug)."""
        base = slugify(self.title, allow_unicode=True)[:150] or "job"
        slug, i = base, 1
        siblings = Job.objects.exclude(pk=self.pk)
        while siblings.filter(slug=slug).exists():
            i += 1
            slug = f"{base}-{i}"
        return slug

    def save(self, *args, **kwargs):
        # Safety net so a Job is NEVER persisted with an empty slug. `slug` is unique=True, so a
        # single blank-slug row (e.g. created via the Django admin, a management command, or the
        # tiny race window between the API insert and submit_for_publication's slug assignment)
        # would otherwise collide and 500 *every* subsequent job insert site-wide. Generating the
        # slug before the INSERT closes that hole for all code paths.
        if not self.slug:
            self.slug = self._build_unique_slug()
            if "update_fields" in kwargs and kwargs["update_fields"] is not None:
                kwargs["update_fields"] = {*kwargs["update_fields"], "slug"}
        super().save(*args, **kwargs)


class ScreeningQuestion(models.Model):
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="screening_questions")
    question = models.CharField(max_length=300)
    is_required = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]


class Proposal(models.Model):
    class Status(models.TextChoices):
        PENDING_APPROVAL = "pending_approval"  # proposals.auto_publish OFF
        SUBMITTED = "submitted"
        VIEWED = "viewed"
        ACCEPTED = "accepted"
        REJECTED = "rejected"
        CANCELLED = "cancelled"  # by worker — no bid refund (BR-7)
        WITHDRAWN = "withdrawn"  # job closed/expired — bid refunded (FR-BID-6)
        SUSPENDED = "suspended"  # worker frozen (BR-23) — restored on unfreeze, bid untouched

    OPEN_STATUSES = (Status.PENDING_APPROVAL, Status.SUBMITTED, Status.VIEWED)

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="proposals")
    worker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="proposals")
    budget = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_days = models.PositiveSmallIntegerField()
    description = models.TextField()
    status = models.CharField(max_length=18, choices=Status.choices, default=Status.SUBMITTED)
    frozen_prev_status = models.CharField(max_length=18, blank=True, default="")  # restore target on unfreeze (BR-23)
    reject_reason = models.TextField(blank=True)
    employer_private_rating = models.PositiveSmallIntegerField(null=True, blank=True)  # FR-JOB-8 / BR-8
    bid_consumed = models.BooleanField(default=False)
    bid_refunded = models.BooleanField(default=False)
    viewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress proposals post ID (data migration).",
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["job", "worker"], name="uniq_proposal_per_job_worker"),
        ]

    def __str__(self) -> str:
        return f"proposal #{self.pk} on job #{self.job_id}"


class ScreeningAnswer(models.Model):
    proposal = models.ForeignKey(Proposal, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(ScreeningQuestion, on_delete=models.CASCADE, related_name="answers")
    answer = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["proposal", "question"], name="uniq_answer_per_question"),
        ]


class Invitation(models.Model):
    class Status(models.TextChoices):
        SENT = "sent"
        ACCEPTED = "accepted"
        REJECTED = "rejected"
        EXPIRED = "expired"  # job awarded/closed (BR-6a)
        SUSPENDED = "suspended"  # a party frozen (BR-23) — restored on unfreeze

    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="invitations")
    employer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_invitations")
    worker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="invitations")
    private_message = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.SENT)
    frozen_prev_status = models.CharField(max_length=12, blank=True, default="")  # restore target on unfreeze (BR-23)
    reject_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["job", "worker"], name="uniq_invitation_per_job_worker"),
            models.CheckConstraint(  # BR-21
                condition=~Q(worker=models.F("employer")), name="no_self_invitation"
            ),
        ]


class WatchlistItem(models.Model):
    worker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="watchlist")
    job = models.ForeignKey(Job, on_delete=models.CASCADE, related_name="watchers")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["worker", "job"], name="uniq_watchlist_item"),
        ]
