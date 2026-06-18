"""Profile sweepers (SRS §23). BR-16 / FR-PROF-5: nudge workers who have been Offline for longer
than profiles.offline_reminder_days to come back online — once per offline window."""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.core.services import get_setting

logger = logging.getLogger(__name__)


@shared_task
def send_offline_reminders() -> int:
    """Workers Offline past the threshold (anchored on visibility_changed_at) get one reminder.
    The `offline_reminder_sent` flag makes it idempotent; it resets when they go back online."""
    from apps.notifications.services import notify

    from .models import WorkerProfile

    days = int(get_setting("profiles.offline_reminder_days", 10))
    cutoff = timezone.now() - timedelta(days=days)
    due = WorkerProfile.objects.filter(
        visibility=WorkerProfile.Visibility.OFFLINE,
        visibility_changed_at__lt=cutoff,
        offline_reminder_sent=False,
    ).select_related("user")

    count = 0
    for profile in due:
        if profile.user.status != profile.user.Status.ACTIVE:
            continue  # don't nudge frozen/deleted accounts
        notify(
            profile.user, kind="admin_broadcast",
            title="عُد إلى الظهور على المنصة",
            body="حسابك مخفي منذ فترة — فعّل ظهورك لتصلك دعوات وفرص العمل الجديدة.",
            deep_link="/me/profile",
        )
        profile.offline_reminder_sent = True
        profile.save(update_fields=["offline_reminder_sent"])
        count += 1
    logger.info("offline-reminder sweep: %s sent", count)
    return count
