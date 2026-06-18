"""Chat abuse reports (FR-CHAT-10): a member files a report → admin review queue → action
(dismiss/warn/freeze/archive); the chat-send scope rate-limits flooding."""
import pytest
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.models import User
from apps.chat.models import ChatReport, Conversation
from apps.chat.services import resolve_report
from tests.factories import StaffUserFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _conversation(reporter, other):
    a, b = (reporter, other) if reporter.id < other.id else (other, reporter)
    return Conversation.objects.create(user_a=a, user_b=b, status=Conversation.Status.ACTIVE)


def test_member_can_report_and_it_reaches_the_queue():
    reporter, other = UserFactory(), UserFactory()
    conv = _conversation(reporter, other)
    resp = auth(reporter).post(f"/api/v1/conversations/{conv.pk}/report",
                               {"reason": "محتوى مسيء"}, format="json")
    assert resp.status_code == 201
    report = ChatReport.objects.get(conversation=conv)
    assert report.status == ChatReport.Status.OPEN
    assert report.reporter == reporter


def test_non_member_cannot_report():
    reporter, other = UserFactory(), UserFactory()
    conv = _conversation(reporter, other)
    stranger = UserFactory()
    resp = auth(stranger).post(f"/api/v1/conversations/{conv.pk}/report",
                               {"reason": "x"}, format="json")
    assert resp.status_code == 404  # existence hidden from non-members


def test_reason_is_required():
    reporter, other = UserFactory(), UserFactory()
    conv = _conversation(reporter, other)
    resp = auth(reporter).post(f"/api/v1/conversations/{conv.pk}/report", {"reason": ""}, format="json")
    assert resp.status_code == 400
    assert resp.json()["code"] == "reason_required"


def test_admin_freeze_action_freezes_offender():
    reporter, offender = UserFactory(), UserFactory()
    conv = _conversation(reporter, offender)
    report = ChatReport.objects.create(conversation=conv, reporter=reporter, reason="إساءة")

    resolve_report(report, action="freeze", reviewer=StaffUserFactory())
    report.refresh_from_db()
    offender.refresh_from_db()
    assert report.status == ChatReport.Status.ACTIONED and report.resolution == "frozen"
    assert offender.status == User.Status.FROZEN  # BR-23 ripple via Part 04


def test_admin_archive_action_locks_conversation():
    reporter, offender = UserFactory(), UserFactory()
    conv = _conversation(reporter, offender)
    report = ChatReport.objects.create(conversation=conv, reporter=reporter, reason="x")
    resolve_report(report, action="archive", reviewer=StaffUserFactory())
    conv.refresh_from_db()
    assert conv.status == Conversation.Status.READ_ONLY


def test_admin_warn_notifies_offender():
    from apps.notifications.models import Notification
    reporter, offender = UserFactory(), UserFactory()
    conv = _conversation(reporter, offender)
    report = ChatReport.objects.create(conversation=conv, reporter=reporter, reason="x")
    resolve_report(report, action="warn", reviewer=StaffUserFactory())
    assert Notification.objects.filter(user=offender, kind="admin_broadcast").exists()


def test_warning_reaches_offender_even_with_marketing_opt_out():
    """A moderation warning must always be delivered (it is not a marketing broadcast)."""
    from apps.notifications.models import Notification
    from apps.notifications.services import get_or_create_preference
    reporter, offender = UserFactory(), UserFactory()
    pref = get_or_create_preference(offender)
    pref.marketing = False
    pref.save()
    conv = _conversation(reporter, offender)
    report = ChatReport.objects.create(conversation=conv, reporter=reporter, reason="x")
    resolve_report(report, action="warn", reviewer=StaffUserFactory())
    assert Notification.objects.filter(user=offender, kind="admin_broadcast").exists()


def test_dismiss_action():
    reporter, offender = UserFactory(), UserFactory()
    conv = _conversation(reporter, offender)
    report = ChatReport.objects.create(conversation=conv, reporter=reporter, reason="x")
    resolve_report(report, action="dismiss", reviewer=StaffUserFactory())
    report.refresh_from_db()
    assert report.status == ChatReport.Status.DISMISSED


def test_chat_send_scope_rate_limits(monkeypatch):
    # Drive the live rate to 1/min (DRF binds THROTTLE_RATES at import, so mutate the dict in place).
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "chat_send", "1/min")
    reporter, other = UserFactory(), UserFactory()
    conv = _conversation(reporter, other)
    client = auth(reporter)
    first = client.post(f"/api/v1/conversations/{conv.pk}/report", {"reason": "1"}, format="json")
    second = client.post(f"/api/v1/conversations/{conv.pk}/report", {"reason": "2"}, format="json")
    assert first.status_code == 201
    assert second.status_code == 429  # chat_send rate-limit triggers
