"""Jobs, proposals, invitations, watchlist — SRS ERD §10.2, state machines §9.10."""
from django.conf import settings
from django.db import models
from django.db.models import Q


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
    location_type = models.CharField(max_length=8, choices=LocationType.choices, default=LocationType.REMOTE)
    country = models.CharField(max_length=64, blank=True)
    city = models.CharField(max_length=64, blank=True)
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

    class Meta:
        ordering = ["-published_at", "-created_at"]
        indexes = [models.Index(fields=["status", "category", "-published_at"])]

    def __str__(self) -> str:
        return self.title

    @property
    def is_locked(self) -> bool:
        """BR-4: title/description locked once any proposal exists."""
        return self.proposals_count > 0


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
