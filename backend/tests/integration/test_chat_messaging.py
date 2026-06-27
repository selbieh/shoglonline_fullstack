"""Chat messaging over the REST API surface (status codes + error envelopes).

`tests/test_chat.py` covers the messaging rules at the *service* layer (send_message/unread/
read-only); this file pins the *HTTP* contract the frontend actually talks to under
`FIRESTORE_STUB` (the REST fallback path in app/messages): the 201/400/404 branches, the flattened
error `code` envelope, unread surfacing through `/me/conversations`, and the read-only block. Kept
separate from the full-lifecycle test so a chat-API regression points here directly.

Run: docker compose exec backend python -m pytest tests/integration/test_chat_messaging.py -v --no-cov
"""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.attachments.services import create_attachment
from apps.chat.models import Conversation, ConversationMember, Message
from apps.core.services import set_setting
from tests.factories import ConversationFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32

MESSAGES = "/api/v1/conversations/{pk}/messages"
CONVERSATIONS = "/api/v1/me/conversations"


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def conv(db):
    """An ACTIVE conversation between two members (member rows present, as the real
    get_or_create_for_contract path creates them — needed for unread tracking)."""
    c = ConversationFactory(status=Conversation.Status.ACTIVE)
    ConversationMember.objects.bulk_create([
        ConversationMember(conversation=c, user=c.user_a),
        ConversationMember(conversation=c, user=c.user_b),
    ])
    return c


# ----------------------------------------------------------------------------- send (happy path)
def test_send_returns_201_and_persists(conv):
    res = auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "مرحبًا"}, format="json")
    assert res.status_code == 201, res.content
    assert res.json()["body"] == "مرحبًا"
    assert Message.objects.filter(conversation=conv, sender=conv.user_a).count() == 1


def test_messages_round_trip_both_directions(conv):
    auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "من الطرف الأول"}, format="json")
    auth(conv.user_b).post(MESSAGES.format(pk=conv.pk), {"body": "من الطرف الثاني"}, format="json")
    # either party sees both messages, oldest-first
    listing = auth(conv.user_b).get(MESSAGES.format(pk=conv.pk))
    assert listing.status_code == 200
    bodies = [m["body"] for m in listing.json()["messages"]]
    assert bodies == ["من الطرف الأول", "من الطرف الثاني"]


# ----------------------------------------------------------------------------- read / unread cursor
def test_unread_surfaces_then_clears_on_get(conv):
    auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "1"}, format="json")
    auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "2"}, format="json")
    # before reading, user_b's conversation row shows the two unread
    row = auth(conv.user_b).get(CONVERSATIONS).json()["results"][0]
    assert row["unread"] == 2
    # GET the thread marks it read
    auth(conv.user_b).get(MESSAGES.format(pk=conv.pk))
    assert auth(conv.user_b).get(CONVERSATIONS).json()["results"][0]["unread"] == 0
    # the sender never has unread for their own messages
    assert auth(conv.user_a).get(CONVERSATIONS).json()["results"][0]["unread"] == 0


def test_explicit_read_endpoint_clears_unread(conv):
    auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "hi"}, format="json")
    res = auth(conv.user_b).post(f"/api/v1/conversations/{conv.pk}/read", format="json")
    assert res.status_code == 200 and res.json()["unread"] == 0


# ----------------------------------------------------------------------------- validation envelopes
def test_empty_body_is_rejected(conv):
    res = auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "   "}, format="json")
    assert res.status_code == 400
    assert res.json()["code"] == "empty_message"


def test_banned_word_is_masked_over_api(conv):
    set_setting("chat.banned_words", ["سيء"])
    res = auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "كلام سيء"}, format="json")
    assert res.status_code == 201
    assert "سيء" not in res.json()["body"]


# ----------------------------------------------------------------------------- access control
def test_non_member_cannot_read_or_send(conv):
    stranger = UserFactory()
    assert auth(stranger).get(MESSAGES.format(pk=conv.pk)).status_code == 404
    assert auth(stranger).post(
        MESSAGES.format(pk=conv.pk), {"body": "تطفّل"}, format="json").status_code == 404


def test_send_requires_authentication(conv):
    assert APIClient().post(MESSAGES.format(pk=conv.pk), {"body": "x"}, format="json").status_code == 401


# ----------------------------------------------------------------------------- read-only enforcement
def test_read_only_conversation_blocks_send_but_allows_read(conv):
    auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "قبل الإغلاق"}, format="json")
    Conversation.objects.filter(pk=conv.pk).update(status=Conversation.Status.READ_ONLY)

    blocked = auth(conv.user_a).post(MESSAGES.format(pk=conv.pk), {"body": "متأخر"}, format="json")
    assert blocked.status_code == 400
    assert blocked.json()["code"] == "conversation_read_only"
    # reading the history still works (read-only, not invisible)
    read = auth(conv.user_b).get(MESSAGES.format(pk=conv.pk))
    assert read.status_code == 200 and len(read.json()["messages"]) == 1


# ----------------------------------------------------------------------------- attachments (FR-CHAT-4)
def test_send_with_attachment_ids(conv):
    set_setting("uploads.allowed_mime", ["image/png"])
    att = create_attachment(conv.user_a, SimpleUploadedFile("pic.png", PNG, content_type="image/png"))
    res = auth(conv.user_a).post(
        MESSAGES.format(pk=conv.pk), {"body": "انظر للصورة", "attachment_ids": [att.id]}, format="json")
    assert res.status_code == 201, res.content
    msg = Message.objects.get(pk=res.json()["id"])
    assert msg.attachments.filter(pk=att.id).exists()
