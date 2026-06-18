"""Scheduled-broadcast dispatcher (FR-NOT-4).

A beat sweeper sends due pending rows via broadcast() — restart-safe and cancellable, unlike a raw
Celery ETA (which is lost on broker restart and can't be listed/cancelled from the admin)."""
from celery import shared_task
from django.utils import timezone


@shared_task
def dispatch_scheduled_notifications() -> int:
    """Send every pending ScheduledNotification whose time has come. Idempotent: a sent row flips
    to SENT and is never picked up again."""
    from .models import ScheduledNotification
    from .services import broadcast

    due = ScheduledNotification.objects.filter(
        status=ScheduledNotification.Status.PENDING, scheduled_at__lte=timezone.now()
    )
    count = 0
    for scheduled in due:
        recipients = broadcast(
            title=scheduled.title, body=scheduled.body, audience=scheduled.audience,
            deep_link=scheduled.deep_link, user_ids=scheduled.audience_user_ids,
        )
        scheduled.status = ScheduledNotification.Status.SENT
        scheduled.sent_at = timezone.now()
        scheduled.recipients_count = recipients
        scheduled.save(update_fields=["status", "sent_at", "recipients_count"])
        count += 1
    return count
