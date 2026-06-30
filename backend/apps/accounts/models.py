"""User model — one account, dual roles, mode is a view toggle (SRS §3.1, BR-1)."""
from django.contrib.auth.models import AbstractUser
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    class Mode(models.TextChoices):
        FIND_JOB = "find_job", "Find a job"
        FIND_WORKER = "find_worker", "Hire now"

    class Status(models.TextChoices):
        ACTIVE = "active"
        FROZEN = "frozen"      # FR-ADM-5 / BR-23
        DELETED = "deleted"    # soft delete (BR-3)

    username = None  # Google SSO only — no usernames, no passwords for end users (FR-AUTH-1)
    email = models.EmailField(unique=True)
    google_sub = models.CharField(max_length=64, unique=True, null=True, blank=True)
    avatar_url = models.URLField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    phone_verified = models.BooleanField(default=False)
    active_mode = models.CharField(
        max_length=12,
        choices=Mode.choices,
        blank=True,
        help_text="Pure view preference — NEVER used for authorization (FR-MODE-4)",
    )
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress wp_users.ID (data migration); null for app-created users.",
    )

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()

    def __str__(self) -> str:
        return self.email

    @property
    def is_frozen(self) -> bool:
        return self.status == self.Status.FROZEN


class EmailLoginCode(models.Model):
    """A short-lived, single-use email OTP for passwordless login/signup (FR-AUTH).

    Persisted (not cache-only) so codes are visible in the Django admin as an operator fallback
    when email delivery is unavailable, and so single-use is enforced atomically via a row lock.
    The code is stored in plaintext deliberately (admin must see it); it is bounded by a short TTL,
    single use, an attempt lockout and a periodic purge (apps.accounts.tasks.purge_login_codes).
    """

    email = models.EmailField(db_index=True)  # always normalized lowercase on create
    code = models.CharField(max_length=16)  # complex alphanumeric+special, case-sensitive
    request_ip = models.GenericIPAddressField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["email", "created_at"])]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.email} @ {self.created_at:%Y-%m-%d %H:%M}"

    def is_redeemable(self, now, max_attempts: int) -> bool:
        return self.consumed_at is None and now < self.expires_at and self.attempts < max_attempts
