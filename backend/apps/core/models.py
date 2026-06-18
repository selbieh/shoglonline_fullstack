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
