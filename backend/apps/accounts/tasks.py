"""Account sweepers (FR-AUTH)."""
from celery import shared_task
from django.utils import timezone


@shared_task
def purge_login_codes() -> int:
    """Delete email login codes older than 48h (covers consumed + expired). Bounds the standing
    plaintext-code window well past the short TTL while leaving a short admin-read fallback."""
    from datetime import timedelta

    from .models import EmailLoginCode

    cutoff = timezone.now() - timedelta(hours=48)
    deleted, _ = EmailLoginCode.objects.filter(created_at__lt=cutoff).delete()
    return deleted
