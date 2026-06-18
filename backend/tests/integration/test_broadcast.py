"""Admin broadcast (FR-NOT-3): audience resolution (worker/employer/dual-once), email kill-switch
(AC-8), and that broadcasting is an admin/service-only capability (no public endpoint)."""
import pytest

from apps.core.services import set_setting
from apps.notifications.models import Notification
from apps.notifications.services import broadcast, resolve_audience
from tests.factories import JobFactory, UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def _worker():
    u = UserFactory()
    WorkerProfileFactory(user=u)  # bio_title set → counts as a worker
    return u


def _employer():
    u = UserFactory()
    JobFactory(employer=u)  # posted a job → counts as an employer
    return u


def _dual():
    u = UserFactory()
    WorkerProfileFactory(user=u)
    JobFactory(employer=u)
    return u


def test_audience_resolution_workers_vs_employers():
    worker, employer, dual = _worker(), _employer(), _dual()

    worker_ids = set(resolve_audience("workers").values_list("id", flat=True))
    employer_ids = set(resolve_audience("employers").values_list("id", flat=True))

    assert worker.id in worker_ids and dual.id in worker_ids and employer.id not in worker_ids
    assert employer.id in employer_ids and dual.id in employer_ids and worker.id not in employer_ids


def test_dual_role_user_receives_each_broadcast_once():
    dual = _dual()
    sent = broadcast(title="إعلان", body="للجميع", audience="everyone")
    assert sent >= 1
    assert Notification.objects.filter(user=dual, kind="admin_broadcast").count() == 1


def test_specific_audience_targets_only_listed_users():
    a, b, c = UserFactory(), UserFactory(), UserFactory()
    sent = broadcast(title="خاص", audience="specific", user_ids=[a.id, b.id])
    assert sent == 2
    assert Notification.objects.filter(user=c, kind="admin_broadcast").count() == 0
    assert Notification.objects.filter(user__in=[a, b], kind="admin_broadcast").count() == 2


def test_frozen_users_excluded_from_audience():
    from apps.accounts.services import freeze_user
    worker = _worker()
    freeze_user(worker)
    assert worker.id not in set(resolve_audience("workers").values_list("id", flat=True))


def test_email_kill_switch_stops_email_leg(mailoutbox):
    user = UserFactory(email="bc@example.com")
    set_setting("emails.enabled", False)  # AC-8: instant kill-switch
    broadcast(title="إعلان", audience="specific", user_ids=[user.id])
    note = Notification.objects.get(user=user, kind="admin_broadcast")
    assert note.emailed is False  # in-app created, but no email sent
    assert not any("bc@example.com" in m.to for m in mailoutbox)


def test_broadcast_flag_off_sends_nothing():
    user = UserFactory()
    set_setting("notifications.broadcast_enabled", False)
    assert broadcast(title="x", audience="everyone") == 0
    assert Notification.objects.filter(user=user).count() == 0


def test_no_public_broadcast_endpoint():
    """Broadcasting is staff/admin-only — there is no end-user API that calls broadcast()."""
    from django.urls import NoReverseMatch, reverse
    with pytest.raises(NoReverseMatch):
        reverse("broadcast")


def _admin_request(staff):
    from django.contrib.messages.storage.fallback import FallbackStorage
    from django.test import RequestFactory
    req = RequestFactory().post("/admin/")
    req.user = staff
    req.session = {}
    req._messages = FallbackStorage(req)
    return req


def test_admin_send_now_dispatches_immediately():
    from django.contrib.admin.sites import AdminSite
    from django.utils import timezone

    from apps.notifications.admin import ScheduledNotificationAdmin
    from apps.notifications.models import ScheduledNotification
    from tests.factories import StaffUserFactory

    target = UserFactory()
    scheduled = ScheduledNotification.objects.create(
        title="فوري", audience=ScheduledNotification.Audience.EVERYONE, scheduled_at=timezone.now(),
    )
    admin = ScheduledNotificationAdmin(ScheduledNotification, AdminSite())
    admin.send_now(_admin_request(StaffUserFactory()), ScheduledNotification.objects.filter(pk=scheduled.pk))

    scheduled.refresh_from_db()
    assert scheduled.status == ScheduledNotification.Status.SENT
    assert Notification.objects.filter(user=target, kind="admin_broadcast").exists()


def test_admin_cancel_pending():
    from datetime import timedelta

    from django.contrib.admin.sites import AdminSite
    from django.utils import timezone

    from apps.notifications.admin import ScheduledNotificationAdmin
    from apps.notifications.models import ScheduledNotification
    from tests.factories import StaffUserFactory

    scheduled = ScheduledNotification.objects.create(
        title="مجدول", audience=ScheduledNotification.Audience.EVERYONE,
        scheduled_at=timezone.now() + timedelta(hours=1),
    )
    admin = ScheduledNotificationAdmin(ScheduledNotification, AdminSite())
    admin.cancel_pending(_admin_request(StaffUserFactory()), ScheduledNotification.objects.filter(pk=scheduled.pk))
    scheduled.refresh_from_db()
    assert scheduled.status == ScheduledNotification.Status.CANCELLED
