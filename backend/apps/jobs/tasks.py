"""Scheduled jobs sweeper (FR-JOB-17)."""
from celery import shared_task
from django.utils import timezone


@shared_task
def expire_jobs() -> int:
    """Auto-close published jobs past expires_at — proposals withdrawn + bids refunded."""
    from apps.core.services import get_setting

    from .models import Job
    from .services import close_job

    if not get_setting("jobs.enable_auto_archive", True):
        return 0  # auto-archive disabled — leave jobs published even if a stale expires_at exists

    expired = Job.objects.filter(status=Job.Status.PUBLISHED, expires_at__lt=timezone.now())
    count = 0
    for job in expired:
        close_job(job, expired=True)
        count += 1
    return count
