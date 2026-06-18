"""Attachment housekeeping (Part 03)."""
from datetime import timedelta

from celery import shared_task
from django.utils import timezone


@shared_task
def sweep_orphan_attachments(max_age_hours: int = 24) -> int:
    """Reclaim uploads that were never linked to a host within the window (abandoned uploads).

    Soft-deletes the row and removes the underlying file from storage. Idempotent — already
    soft-deleted / linked attachments are excluded.
    """
    from .models import Attachment

    cutoff = timezone.now() - timedelta(hours=max_age_hours)
    orphans = Attachment.objects.filter(
        host_type__isnull=True, is_deleted=False, created_at__lt=cutoff,
    )
    count = 0
    for attachment in orphans:
        attachment.file.delete(save=False)  # drop the bytes from storage
        attachment.is_deleted = True
        attachment.save(update_fields=["is_deleted"])
        count += 1
    return count
