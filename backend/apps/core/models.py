"""Global Settings / Feature Flags (SRS §22) + Audit log (SEC-10)."""
from django.conf import settings as dj_settings
from django.db import models


class GlobalSetting(models.Model):
    """Runtime configuration editable from admin without deployment (FR-ADM-2)."""

    class ValueType(models.TextChoices):
        BOOL = "bool"
        INT = "int"
        STR = "str"
        JSON = "json"

    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()
    value_type = models.CharField(max_length=8, choices=ValueType.choices, default=ValueType.STR)
    category = models.CharField(max_length=50, blank=True)
    description = models.CharField(max_length=255, blank=True)
    is_public = models.BooleanField(
        default=False, help_text="Exposed read-only at /api/v1/settings/public for SSR/UI gating"
    )
    updated_by = models.ForeignKey(
        dj_settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "key"]

    def __str__(self) -> str:
        return f"{self.key}={self.value!r}"


class SettingChangeLog(models.Model):
    key = models.CharField(max_length=100)
    old_value = models.JSONField(null=True)
    new_value = models.JSONField()
    changed_by = models.ForeignKey(
        dj_settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]


class Report(models.Model):
    """User-filed abuse/violation report against any public entity — a service, job, freelancer
    profile, portfolio work, proposal, or buying request (mirrors the in-chat ChatReport flow).
    Stored as a generic (kind, object_id) reference like Favorite, so a single admin queue can
    surface every reported item; from the queue an admin opens the item and removes it on issue."""

    class Kind(models.TextChoices):
        SERVICE = "service", "Service"
        JOB = "job", "Job"
        FREELANCER = "freelancer", "Freelancer"
        PORTFOLIO = "portfolio", "Portfolio"
        PROPOSAL = "proposal", "Proposal"
        BUYING_REQUEST = "buying_request", "Buying request"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        DISMISSED = "dismissed", "Dismissed"
        ACTIONED = "actioned", "Actioned"

    kind = models.CharField(max_length=20, choices=Kind.choices)
    object_id = models.PositiveIntegerField()
    reporter = models.ForeignKey(
        dj_settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reports_filed"
    )
    reason = models.CharField(max_length=40)        # short code: spam | scam | inappropriate | …
    detail = models.CharField(max_length=1000, blank=True)  # optional free-text note
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    resolution = models.CharField(max_length=200, blank=True)  # removed | dismissed
    reviewed_by = models.ForeignKey(
        dj_settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["kind", "object_id"]),
            models.Index(fields=["status", "-created_at"]),
        ]
        constraints = [
            # one open report per user per item — re-reporting an item already flagged is a no-op
            models.UniqueConstraint(
                fields=["reporter", "kind", "object_id"],
                condition=models.Q(status="open"),
                name="uniq_open_report_per_user_item",
            ),
        ]

    def __str__(self) -> str:
        return f"report:{self.kind}:{self.object_id} ({self.status})"


class AuditLog(models.Model):
    """Append-only record of sensitive actions (SEC-10)."""

    actor = models.ForeignKey(
        dj_settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    action = models.CharField(max_length=80)
    model = models.CharField(max_length=80, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-at"]
        indexes = [models.Index(fields=["model", "object_id"])]
