"""In-app notifications (FR-NOT-1). The single notify() service also dispatches
email (per settings) and push (FCM stub) so every channel shares one record."""
from django.conf import settings
from django.db import models


class Notification(models.Model):
    class Kind(models.TextChoices):
        # SRS FR-NOT-2 push channels, reused for in-app
        CHAT_MESSAGE = "chat_message"
        PROPOSAL = "proposal"
        INVITATION = "invitation"
        CONTRACT = "contract"
        SUBMISSION = "submission"
        PAYMENT = "payment"
        TICKET = "ticket"
        ADMIN = "admin_broadcast"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=160)       # Arabic
    body = models.CharField(max_length=300, blank=True)
    deep_link = models.CharField(max_length=200, blank=True)  # e.g. /contracts/12
    read_at = models.DateTimeField(null=True, blank=True)
    emailed = models.BooleanField(default=False)
    pushed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "read_at", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.kind} → {self.user_id}"


class NotificationPreference(models.Model):
    """Per-user opt-out for the admin-allowed categories (FR-PROF-9). Transactional events
    (contract/payment/submission/invitation/ticket) are always delivered and are NOT listed here."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preference"
    )
    chat_unread = models.BooleanField(default=True)        # chat-message notifications + unread emails
    job_alerts = models.BooleanField(default=True)         # new-job-in-subscribed-category emails
    proposal_updates = models.BooleanField(default=True)   # proposal lifecycle events
    marketing = models.BooleanField(default=True)          # admin broadcasts
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"prefs:{self.user_id}"


class ScheduledNotification(models.Model):
    """An admin broadcast queued for future delivery (FR-NOT-4). A beat sweeper dispatches due
    rows via notifications.services.broadcast — restart-safe and cancellable, unlike a raw Celery ETA."""

    class Audience(models.TextChoices):
        EVERYONE = "everyone", "Everyone"
        WORKERS = "workers", "Workers"
        EMPLOYERS = "employers", "Employers"
        SPECIFIC = "specific", "Specific users"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        CANCELLED = "cancelled", "Cancelled"

    title = models.CharField(max_length=160)
    body = models.CharField(max_length=300, blank=True)
    deep_link = models.CharField(max_length=200, blank=True)
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.EVERYONE)
    audience_user_ids = models.JSONField(default=list, blank=True)  # used when audience=specific
    scheduled_at = models.DateTimeField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    recipients_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-scheduled_at"]
        indexes = [models.Index(fields=["status", "scheduled_at"])]

    def __str__(self) -> str:
        return f"scheduled «{self.title}» @ {self.scheduled_at:%Y-%m-%d %H:%M}"
