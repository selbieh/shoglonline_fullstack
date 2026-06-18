"""Real-time chat control plane (SRS §14, AC-6/AC-13): the backend mints per-user Firebase
tokens, owns conversation status, and syncs client-written messages back to Postgres."""
import pytest
from rest_framework.test import APIClient

from apps.chat import firestore, services
from apps.chat.models import Conversation, Message
from tests.factories import ConversationFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db, pytest.mark.srs("AC-6")]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


# ----------------------------------------------------------------- custom token
def test_token_requires_authentication():
    assert APIClient().post("/api/v1/chat/token").status_code == 401


def test_token_is_scoped_to_the_requester(settings):
    settings.FIRESTORE_STUB = True
    user = UserFactory()
    res = auth(user).post("/api/v1/chat/token")
    assert res.status_code == 200
    body = res.json()
    assert body["token"] == f"stub-firebase-token:{user.id}"  # uid == django id
    assert body["stub"] is True


def test_real_mint_uses_firebase_auth(settings, mocker):
    settings.FIRESTORE_STUB = False
    mocked = mocker.patch("firebase_admin.auth.create_custom_token", return_value=b"real-token")
    from apps.chat import firebase
    assert firebase.mint_custom_token(UserFactory(email="x@example.com")) == "real-token"
    assert mocked.called


# ------------------------------------------------------------- Firestore→PG sync
def test_sync_rejects_without_the_shared_secret(settings):
    settings.CHAT_SYNC_SECRET = "s3cret"
    conv = ConversationFactory()
    res = APIClient().post("/api/v1/chat/sync", {
        "conversation_id": conv.pk, "sender_id": conv.user_a_id,
        "body": "hi", "firestore_id": "fs-1",
    }, format="json")
    assert res.status_code == 403


def test_sync_persists_message_idempotently(settings):
    settings.CHAT_SYNC_SECRET = "s3cret"
    conv = ConversationFactory()
    client = APIClient()
    client.credentials(HTTP_X_CHAT_SYNC_SECRET="s3cret")
    payload = {"conversation_id": conv.pk, "sender_id": conv.user_a_id,
               "body": "مرحبا", "firestore_id": "fs-1"}
    for _ in range(3):  # Cloud Function retry must not double-persist
        res = client.post("/api/v1/chat/sync", payload, format="json")
        assert res.status_code == 201
    assert Message.objects.filter(conversation=conv).count() == 1
    conv.refresh_from_db()
    assert conv.last_message_snippet == "مرحبا"
    assert conv.last_message_at is not None


def test_sync_unknown_conversation_is_404(settings):
    settings.CHAT_SYNC_SECRET = "s3cret"
    client = APIClient()
    client.credentials(HTTP_X_CHAT_SYNC_SECRET="s3cret")
    res = client.post("/api/v1/chat/sync", {
        "conversation_id": 999999, "sender_id": UserFactory().pk,
        "body": "x", "firestore_id": "fs-z",
    }, format="json")
    assert res.status_code == 404


# ----------------------------------------------- read-only lifecycle (PG + Firestore)
def test_warranty_end_flips_read_only_in_both_stores(mocker):
    """set_read_only must update PG status AND push the flip to Firestore (rules then block sends)."""
    spy = mocker.spy(firestore, "mirror_status")
    conv = ConversationFactory(status=Conversation.Status.ACTIVE)
    services.set_read_only(conv)
    conv.refresh_from_db()
    assert conv.status == Conversation.Status.READ_ONLY
    assert spy.call_count == 1


def test_real_mirror_message_writes_to_firestore(settings, mocker):
    """With the stub off, sending mirrors through the Firestore Admin client."""
    settings.FIRESTORE_STUB = False
    db = mocker.patch("apps.chat.firebase.db")
    conv = ConversationFactory()
    msg = Message.objects.create(conversation=conv, sender=conv.user_a, body="hello")
    firestore.mirror_message(msg)
    assert db.called  # exercised the real adapter path, not the stub


def test_mirror_conversation_writes_string_participants(settings, mocker):
    """Security rules compare request.auth.uid (a string) to the participants array, so the
    participants/sender MUST be written as strings — assert it to catch a future int regression."""
    settings.FIRESTORE_STUB = False
    db = mocker.patch("apps.chat.firebase.db")
    conv = ConversationFactory()
    firestore.mirror_conversation(conv)
    payload = db.return_value.collection.return_value.document.return_value.set.call_args[0][0]
    assert payload["participants"] == [str(conv.user_a_id), str(conv.user_b_id)]
    assert all(isinstance(p, str) for p in payload["participants"])
