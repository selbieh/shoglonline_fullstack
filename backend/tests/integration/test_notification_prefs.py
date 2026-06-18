"""Notification preferences (FR-PROF-9): opting out of a category suppresses it in notify() and in
the email dispatch; transactional categories are always delivered."""
import pytest
from rest_framework.test import APIClient

from apps.notifications.models import Notification
from apps.notifications.services import get_or_create_preference, notify
from tests.factories import UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_optout_suppresses_in_app_and_email_for_that_category():
    user = UserFactory()
    pref = get_or_create_preference(user)
    pref.proposal_updates = False
    pref.save()

    assert notify(user, kind="proposal", title="عرض جديد") is None
    assert Notification.objects.filter(user=user, kind="proposal").count() == 0


def test_transactional_categories_always_deliver():
    user = UserFactory()
    pref = get_or_create_preference(user)
    pref.marketing = False
    pref.proposal_updates = False
    pref.chat_unread = False
    pref.save()
    # contract/payment/etc. are not user-suppressible
    note = notify(user, kind="contract", title="تحديث عقد")
    assert note is not None


def test_force_bypasses_optout_for_critical_notices():
    user = UserFactory()
    pref = get_or_create_preference(user)
    pref.marketing = False
    pref.save()
    # critical account/moderation notices (force=True) always deliver despite the opt-out
    assert notify(user, kind="admin_broadcast", title="إشعار حرج", force=True) is not None
    # …while a normal (non-forced) admin notice stays suppressed
    assert notify(user, kind="admin_broadcast", title="تسويق") is None


def test_marketing_optout_skips_broadcast():
    from apps.notifications.services import broadcast
    user = UserFactory()
    get_or_create_preference(user)  # defaults all on
    assert broadcast(title="إعلان", audience="everyone") >= 1
    Notification.objects.filter(user=user).delete()

    pref = get_or_create_preference(user)
    pref.marketing = False
    pref.save()
    broadcast(title="إعلان آخر", audience="everyone")
    assert Notification.objects.filter(user=user, kind="admin_broadcast").count() == 0


def test_chat_unread_optout_skips_unread_email(mailoutbox):
    from datetime import timedelta

    from django.utils import timezone

    from apps.chat.models import Conversation, ConversationMember, Message
    from apps.chat.tasks import send_unread_chat_emails

    a, b = UserFactory(email="a@x.com"), UserFactory(email="b@x.com")
    lo, hi = (a, b) if a.id < b.id else (b, a)
    conv = Conversation.objects.create(user_a=lo, user_b=hi, status=Conversation.Status.ACTIVE)
    ConversationMember.objects.create(conversation=conv, user=lo)
    ConversationMember.objects.create(conversation=conv, user=hi)
    msg = Message.objects.create(conversation=conv, sender=a, body="مرحبا")
    Message.objects.filter(pk=msg.pk).update(created_at=timezone.now() - timedelta(minutes=30))

    pref = get_or_create_preference(b)  # recipient opts out of chat-unread
    pref.chat_unread = False
    pref.save()

    assert send_unread_chat_emails() == 0  # suppressed
    assert not any("b@x.com" in m.to for m in mailoutbox)


def test_preferences_api_get_and_put():
    user = UserFactory()
    client = auth(user)
    got = client.get("/api/v1/me/notification-preferences")
    assert got.status_code == 200
    assert got.json()["marketing"] is True

    put = client.put("/api/v1/me/notification-preferences", {"marketing": False}, format="json")
    assert put.status_code == 200
    assert put.json()["marketing"] is False
    assert get_or_create_preference(user).marketing is False
