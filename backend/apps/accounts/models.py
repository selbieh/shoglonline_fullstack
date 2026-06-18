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

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    objects = UserManager()

    def __str__(self) -> str:
        return self.email

    @property
    def is_frozen(self) -> bool:
        return self.status == self.Status.FROZEN
