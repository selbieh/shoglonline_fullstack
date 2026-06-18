"""Scheduled broadcasts (FR-NOT-4): the beat sweeper delivers due pending rows exactly once;
future and cancelled rows are left alone."""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.notifications.models import Notification, ScheduledNotification
from apps.notifications.tasks import dispatch_scheduled_notifications
from tests.factories import UserFactory

pytestmark = [pytest.mark.tasks, pytest.mark.django_db]


def test_due_scheduled_fires_once_and_is_idempotent():
    user = UserFactory()
    scheduled = ScheduledNotification.objects.create(
        title="مجدول", body="نص", audience=ScheduledNotification.Audience.EVERYONE,
        scheduled_at=timezone.now() - timedelta(minutes=1),
    )
    assert dispatch_scheduled_notifications() == 1
    scheduled.refresh_from_db()
    assert scheduled.status == ScheduledNotification.Status.SENT
    assert scheduled.sent_at is not None
    assert scheduled.recipients_count >= 1
    assert Notification.objects.filter(user=user, kind="admin_broadcast").count() == 1
    # idempotent — a sent row is never re-dispatched
    assert dispatch_scheduled_notifications() == 0


def test_future_scheduled_is_not_sent_yet():
    UserFactory()
    ScheduledNotification.objects.create(
        title="مستقبل", audience=ScheduledNotification.Audience.EVERYONE,
        scheduled_at=timezone.now() + timedelta(hours=2),
    )
    assert dispatch_scheduled_notifications() == 0


def test_cancelled_scheduled_never_sends():
    UserFactory()
    scheduled = ScheduledNotification.objects.create(
        title="ملغى", audience=ScheduledNotification.Audience.EVERYONE,
        scheduled_at=timezone.now() - timedelta(minutes=5),
        status=ScheduledNotification.Status.CANCELLED,
    )
    assert dispatch_scheduled_notifications() == 0
    scheduled.refresh_from_db()
    assert scheduled.status == ScheduledNotification.Status.CANCELLED


def test_specific_audience_scheduled():
    a, b = UserFactory(), UserFactory()
    ScheduledNotification.objects.create(
        title="خاص", audience=ScheduledNotification.Audience.SPECIFIC, audience_user_ids=[a.id],
        scheduled_at=timezone.now() - timedelta(minutes=1),
    )
    dispatch_scheduled_notifications()
    assert Notification.objects.filter(user=a, kind="admin_broadcast").count() == 1
    assert Notification.objects.filter(user=b, kind="admin_broadcast").count() == 0
