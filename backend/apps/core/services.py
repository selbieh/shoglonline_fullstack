"""Typed, cached accessor for Global Settings (SRS §22, BR-19: server-side checks)."""
from django.core.cache import cache

from .models import GlobalSetting, SettingChangeLog

CACHE_PREFIX = "gs:"
CACHE_TTL = 60  # seconds — changes take effect platform-wide within 60s (US-46)

# Launch catalog (SRS §22.1). Seeded by `manage.py seed_settings`.
DEFAULTS: dict[str, tuple[object, str, str, bool]] = {
    # key: (default, type, category, is_public)
    "jobs.auto_publish": (False, "bool", "moderation", False),
    "proposals.auto_publish": (True, "bool", "moderation", False),
    "services.auto_publish": (False, "bool", "moderation", False),
    "chat.enabled": (True, "bool", "chat", True),
    "chat.unread_email_delay_minutes": (10, "int", "chat", False),
    "chat.banned_words": ([], "json", "chat", False),
    "conversations.idle_lock_days": (30, "int", "chat", False),  # FR-CHAT-7
    "emails.enabled": (True, "bool", "notifications", False),
    "emails.chat_unread_enabled": (True, "bool", "notifications", False),
    "notifications.broadcast_enabled": (True, "bool", "notifications", False),  # FR-NOT-3 kill-switch
    "registration.enabled": (True, "bool", "platform", True),
    "platform.maintenance_mode": (False, "bool", "platform", True),
    "platform.maintenance_message_ar": (
        "الموقع تحت الصيانة حاليًا — نعود قريبًا بإذن الله. شكرًا لتفهّمك.",
        "str", "platform", True,
    ),
    "contracts.warranty_days": (60, "int", "contracts", True),
    "contracts.funding_timeout_hours": (48, "int", "contracts", False),
    "contracts.overdue_grace_days": (3, "int", "contracts", False),
    "tickets.auto_solve_days": (7, "int", "support", False),
    "tickets.auto_close_days": (7, "int", "support", False),
    "profiles.offline_reminder_days": (10, "int", "profiles", False),
    "subscriptions.enabled": (True, "bool", "notifications", False),
    "subscriptions.email_mode": ("instant", "str", "notifications", False),
    "bids.enabled": (True, "bool", "bids", True),  # master switch: off → free proposals, commission only
    "bids.signup_grant": (10, "int", "bids", True),
    "bids.monthly_grant": (0, "int", "bids", False),
    "invoices.period": ("month", "str", "payments", False),
    "uploads.enabled": (True, "bool", "platform", True),  # kill-switch for all uploads
    "uploads.max_file_mb": (25, "int", "platform", True),
    "uploads.max_per_host": (10, "int", "platform", True),  # cap files per message/submission/ticket
    "uploads.allowed_mime": ([
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "video/mp4", "video/webm", "video/quicktime",
        "audio/mpeg", "audio/ogg", "audio/webm", "audio/wav", "audio/mp4", "audio/x-m4a",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip", "application/x-zip-compressed",
        "application/x-rar-compressed", "application/vnd.rar",
        "text/plain",
    ], "json", "platform", True),  # FR-CHAT-4: image/video/PDF/Word/Excel/RAR-ZIP + audio
    "affiliate.cookie_days": (30, "int", "affiliate", False),
    "jobs.expiry_days": (30, "int", "jobs", True),
    "jobs.enable_auto_archive": (True, "bool", "jobs", True),  # ON → expire after jobs.expiry_days; OFF → stay published
    "platform.currency": ("USD", "str", "payments", True),  # PayPal-compatible (no KWD on PayPal)
    "payments.commission_pct": (10, "int", "payments", True),  # pending final rates (Q3)
}


def get_setting(key: str, default=None):
    cached = cache.get(CACHE_PREFIX + key)
    if cached is not None:
        return cached
    try:
        value = GlobalSetting.objects.get(key=key).value
    except GlobalSetting.DoesNotExist:
        value = DEFAULTS.get(key, (default, "", "", False))[0] if key in DEFAULTS else default
    cache.set(CACHE_PREFIX + key, value, CACHE_TTL)
    return value


def set_setting(key: str, value, user=None) -> None:
    meta = DEFAULTS.get(key)
    obj, _created = GlobalSetting.objects.get_or_create(
        key=key,
        defaults={
            "value": value,
            "updated_by": user,
            "value_type": meta[1] if meta else GlobalSetting.ValueType.JSON,
            "category": meta[2] if meta else "",
            "is_public": meta[3] if meta else False,
        },
    )
    old = None if _created else obj.value
    obj.value = value
    obj.updated_by = user
    obj.save()
    SettingChangeLog.objects.create(key=key, old_value=old, new_value=value, changed_by=user)
    cache.delete(CACHE_PREFIX + key)


def public_settings() -> dict:
    """Read-only flags exposed to the frontend (BR-19: UX gating only).

    The catalog (DEFAULTS) is the source of truth for WHICH keys are public;
    the database is the source of truth for their current values.
    """
    public_keys = [k for k, (_v, _t, _c, is_public) in DEFAULTS.items() if is_public]
    rows = {s.key: s.value for s in GlobalSetting.objects.filter(key__in=public_keys)}
    return {key: rows.get(key, DEFAULTS[key][0]) for key in public_keys}
