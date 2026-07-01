"""Admin Chat Inbox (ADM-6): the two-pane Firestore-backed reader + inline moderation.

Firestore is stubbed in tests (FIRESTORE_STUB), so the thread reader exercises the faithful
Postgres-mirror fallback path (source == "postgres").
"""
import json

import pytest
from django.test import Client
from django.urls import reverse

from apps.accounts.models import User
from apps.chat.models import Conversation, ConversationMember, Message

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _stub_firestore(settings):
    """Force the Firestore stub so the thread reader exercises the Postgres-mirror fallback
    deterministically — independent of whether a Firestore emulator is up in the container/CI."""
    settings.FIRESTORE_STUB = True


def _users():
    a = User.objects.create_user(email="alice@example.com", first_name="أليس")
    b = User.objects.create_user(email="bob@example.com", first_name="بوب")
    return (a, b) if a.id < b.id else (b, a)


def _conversation(a, b, *, status=Conversation.Status.ACTIVE):
    conv = Conversation.objects.create(user_a=a, user_b=b, status=status,
                                       context_type=Conversation.Context.DIRECT,
                                       last_message_snippet="آخر رسالة")
    ConversationMember.objects.bulk_create([
        ConversationMember(conversation=conv, user=a),
        ConversationMember(conversation=conv, user=b),
    ])
    Message.objects.create(conversation=conv, sender=a, body="السلام عليكم")
    Message.objects.create(conversation=conv, sender=b, body="وعليكم السلام")
    return conv


@pytest.fixture
def super_client(db):
    c = Client()
    c.force_login(User.objects.create_user(email="root@example.com", is_staff=True, is_superuser=True))
    return c


def test_inbox_renders_and_lists_conversations(super_client):
    a, b = _users()
    _conversation(a, b)
    res = super_client.get(reverse("admin:chat_inbox"))
    assert res.status_code == 200
    body = res.content.decode()
    assert "Chat Inbox" in body
    assert "أليس" in body and "بوب" in body


def test_search_filters_by_email(super_client):
    a, b = _users()
    _conversation(a, b)
    c, d = User.objects.create_user(email="carol@example.com"), User.objects.create_user(email="dave@example.com")
    c, d = (c, d) if c.id < d.id else (d, c)
    _conversation(c, d)

    res = super_client.get(reverse("admin:chat_inbox"), {"q": "carol"})
    body = res.content.decode()
    assert "carol@example.com" in body or "1 محادثة" in body
    assert "alice@example.com" not in body


def test_thread_json_returns_messages_from_postgres(super_client):
    a, b = _users()
    conv = _conversation(a, b)
    res = super_client.get(reverse("admin:chat_inbox_thread", args=[conv.id]))
    assert res.status_code == 200
    data = json.loads(res.content)
    assert data["source"] == "postgres"          # Firestore stubbed → mirror fallback
    assert len(data["messages"]) == 2
    assert data["messages"][0]["body"] == "السلام عليكم"
    assert {p["id"] for p in data["conversation"]["participants"]} == {a.id, b.id}


def test_thread_missing_conversation_404(super_client):
    assert super_client.get(reverse("admin:chat_inbox_thread", args=[999999])).status_code == 404


def test_thread_falls_back_when_firestore_empty(super_client, monkeypatch):
    """The reported bug: a conversation whose messages live only in Postgres (e.g. legacy import)
    must still render even when Firestore returns an empty (but successful) thread."""
    from apps.chat import oversight
    a, b = _users()
    conv = _conversation(a, b)  # 2 Postgres messages, 0 in Firestore
    monkeypatch.setattr(oversight, "_messages_from_firestore", lambda c, u: [])
    data = json.loads(super_client.get(reverse("admin:chat_inbox_thread", args=[conv.id])).content)
    assert data["source"] == "postgres"
    assert len(data["messages"]) == 2


def test_thread_merges_unsynced_firestore_message(super_client, monkeypatch):
    """A live Firestore message not yet synced to Postgres is merged on top of the mirror."""
    from apps.chat import oversight
    a, b = _users()
    conv = _conversation(a, b)
    monkeypatch.setattr(oversight, "_messages_from_firestore", lambda c, u: [
        {"id": "live1", "_pgid": None, "_docid": "live1", "sender_id": a.id,
         "sender_name": a.first_name, "body": "رسالة لحظية", "files": [],
         "created_at": "2099-01-01T00:00:00+00:00"},
    ])
    data = json.loads(super_client.get(reverse("admin:chat_inbox_thread", args=[conv.id])).content)
    assert data["source"] == "firestore"
    assert len(data["messages"]) == 3
    assert data["messages"][-1]["body"] == "رسالة لحظية"
    assert "_pgid" not in data["messages"][-1]  # internal dedupe keys stripped


def test_thread_dedupes_already_synced_firestore_message(super_client, monkeypatch):
    """A Firestore message whose pgId matches a Postgres row is not shown twice."""
    from apps.chat import oversight
    a, b = _users()
    conv = _conversation(a, b)
    first = conv.messages.order_by("created_at").first()
    monkeypatch.setattr(oversight, "_messages_from_firestore", lambda c, u: [
        {"id": first.pk, "_pgid": first.pk, "_docid": "dup", "sender_id": a.id,
         "sender_name": "x", "body": "dup", "files": [], "created_at": None},
    ])
    data = json.loads(super_client.get(reverse("admin:chat_inbox_thread", args=[conv.id])).content)
    assert len(data["messages"]) == 2  # deduped, not 3


def _empty_conversation(email_a, email_b, *, context=Conversation.Context.DIRECT, snippet=""):
    a = User.objects.create_user(email=email_a)
    b = User.objects.create_user(email=email_b)
    a, b = (a, b) if a.id < b.id else (b, a)
    return Conversation.objects.create(user_a=a, user_b=b, context_type=context, last_message_snippet=snippet)


def test_filter_has_messages_excludes_empty_conversations(super_client):
    a, b = _users()
    _conversation(a, b)  # أليس / بوب, has messages
    _empty_conversation("empty1@example.com", "empty2@example.com")  # no messages

    everything = super_client.get(reverse("admin:chat_inbox")).content.decode()
    assert "empty1@example.com" in everything  # shown when unfiltered

    filtered = super_client.get(reverse("admin:chat_inbox"), {"has_messages": "1"}).content.decode()
    assert "أليس" in filtered
    assert "empty1@example.com" not in filtered and "empty2@example.com" not in filtered


def test_filter_by_context(super_client):
    a, b = _users()
    _conversation(a, b)  # direct
    _empty_conversation("con1@example.com", "con2@example.com",
                        context=Conversation.Context.CONTRACT, snippet="عقد")

    body = super_client.get(reverse("admin:chat_inbox"), {"context": "contract"}).content.decode()
    assert "con1@example.com" in body       # the contract conversation
    assert "أليس" not in body               # the direct conversation is filtered out


def test_action_archive_and_reactivate(super_client):
    a, b = _users()
    conv = _conversation(a, b)
    url = reverse("admin:chat_inbox_action", args=[conv.id])

    res = super_client.post(url, {"action": "archive"})
    assert res.status_code == 200 and json.loads(res.content)["status"] == "read_only"
    conv.refresh_from_db()
    assert conv.status == Conversation.Status.READ_ONLY

    res = super_client.post(url, {"action": "reactivate"})
    assert json.loads(res.content)["status"] == "active"
    conv.refresh_from_db()
    assert conv.status == Conversation.Status.ACTIVE


def test_action_freeze_participant(super_client):
    a, b = _users()
    conv = _conversation(a, b)
    res = super_client.post(reverse("admin:chat_inbox_action", args=[conv.id]),
                            {"action": "freeze", "user_id": a.id})
    assert res.status_code == 200
    a.refresh_from_db()
    assert a.status == User.Status.FROZEN


def test_action_freeze_rejects_non_participant(super_client):
    a, b = _users()
    conv = _conversation(a, b)
    outsider = User.objects.create_user(email="mallory@example.com")
    res = super_client.post(reverse("admin:chat_inbox_action", args=[conv.id]),
                            {"action": "freeze", "user_id": outsider.id})
    assert res.status_code == 400
    outsider.refresh_from_db()
    assert outsider.status == User.Status.ACTIVE


def test_action_unknown_is_rejected(super_client):
    a, b = _users()
    conv = _conversation(a, b)
    res = super_client.post(reverse("admin:chat_inbox_action", args=[conv.id]), {"action": "nope"})
    assert res.status_code == 400


def test_non_staff_is_redirected_to_login(db):
    a, b = _users()
    conv = _conversation(a, b)
    c = Client()
    c.force_login(User.objects.create_user(email="plain@example.com"))  # not staff
    assert c.get(reverse("admin:chat_inbox")).status_code == 302
    assert c.get(reverse("admin:chat_inbox_thread", args=[conv.id])).status_code == 302


def test_staff_without_permission_forbidden_on_thread(db):
    """A staff user lacking chat.view_conversation passes the admin gate but is refused the data."""
    a, b = _users()
    conv = _conversation(a, b)
    c = Client()
    c.force_login(User.objects.create_user(email="limited@example.com", is_staff=True))
    assert c.get(reverse("admin:chat_inbox_thread", args=[conv.id])).status_code == 403


def test_moderation_requires_change_permission(db):
    a, b = _users()
    conv = _conversation(a, b)
    c = Client()
    c.force_login(User.objects.create_user(email="viewer@example.com", is_staff=True))
    res = c.post(reverse("admin:chat_inbox_action", args=[conv.id]), {"action": "archive"})
    assert res.status_code == 403
    conv.refresh_from_db()
    assert conv.status == Conversation.Status.ACTIVE
