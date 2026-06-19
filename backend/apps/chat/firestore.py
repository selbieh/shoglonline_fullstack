"""Firestore mirror adapter (SRS §10.4, §14).

Division of responsibility:
  * The backend (Admin SDK, here) OWNS the `conversations/{id}` document — it writes the
    participants, status and display names. Clients can never create or mutate it (security
    rules forbid it), so "who may chat with whom" stays a backend decision (BR-11).
  * Clients write `conversations/{id}/messages/*` directly (heavy load → Firestore); a Cloud
    Function syncs each back to Postgres via /chat/sync for unread-email + oversight + search.
  * `mirror_message` here is only for backend-originated messages (e.g. system notices).

Stub-by-default (FIRESTORE_STUB) — logs and no-ops so dev/test need no credentials.
"""
import logging

from . import firebase

logger = logging.getLogger(__name__)


def _participant_names(conversation) -> dict:
    def label(u):
        return (u.first_name or u.email or f"user-{u.id}")
    return {
        str(conversation.user_a_id): label(conversation.user_a),
        str(conversation.user_b_id): label(conversation.user_b),
    }


def _doc(conversation):
    return firebase.db().collection("conversations").document(str(conversation.pk))


def _message_files(message) -> list:
    """Attachment metadata the recipient renders inline (id + kind + name + size). We deliberately
    do NOT include the scoped download URL — it's a per-request absolute path and each party fetches
    /uploads/{id} with their own JWT (see FR-CHAT-4, attachments access control)."""
    return [
        {"id": a.id, "kind": a.kind, "name": a.original_name, "size": a.size}
        for a in message.attachments.filter(is_deleted=False)
    ]


def mirror_conversation(conversation) -> None:
    """Upsert the conversation doc the clients read (participants gate access via rules)."""
    if firebase.is_stub():
        logger.info("[firestore-stub] upsert conversations/%s participants=[%s,%s] status=%s",
                    conversation.pk, conversation.user_a_id, conversation.user_b_id, conversation.status)
        return
    from firebase_admin import firestore as admin_firestore

    _doc(conversation).set({
        "participants": [str(conversation.user_a_id), str(conversation.user_b_id)],
        "names": _participant_names(conversation),
        "status": conversation.status,
        "context": conversation.context_type,
        "contractId": conversation.contract_id,
        "jobId": conversation.job_id,
        "lastMessageAt": conversation.last_message_at,
        "updatedAt": admin_firestore.SERVER_TIMESTAMP,
    }, merge=True)


def mirror_message(message) -> None:
    """Write a backend-originated message (client-sent messages go straight to Firestore)."""
    if firebase.is_stub():
        logger.info("[firestore-stub] add conversations/%s/messages sender=%s",
                    message.conversation_id, message.sender_id)
        return
    conv_ref = firebase.db().collection("conversations").document(str(message.conversation_id))
    conv_ref.collection("messages").document(str(message.pk)).set({
        "sender": str(message.sender_id),
        "body": message.body,
        "files": _message_files(message),  # linked attachments (voice/image/video/file), FR-CHAT-4
        "createdAt": message.created_at,
        "pgId": message.pk,
    })
    conv_ref.set({
        "lastMessageAt": message.created_at,
        "lastMessageSnippet": message.body[:160],
    }, merge=True)


def mirror_status(conversation) -> None:
    """Flip the conversation document status (active|read_only) — BR-10 / FR-CHAT-7.

    Rules read this field to reject sends to a read-only conversation, so this single write
    is how the backend enforces the lifecycle on clients talking directly to Firestore."""
    if firebase.is_stub():
        logger.info("[firestore-stub] conversations/%s → status=%s", conversation.pk, conversation.status)
        return
    _doc(conversation).set({"status": conversation.status}, merge=True)


def mirror_read(conversation, user, read_at) -> None:
    """Mirror a participant's read cursor into the conversation doc as `reads.<uid>` so the OTHER
    party's listener can render ✓✓ (read) in real time (read receipts, FR-CHAT-1).

    Admin-SDK write — clients never write the conversation doc (security rules forbid it). We pass a
    REAL timestamp (the same value written to ConversationMember.last_read_at), not the Firestore
    SERVER_TIMESTAMP sentinel, which is fragile inside a merged map. `merge=True` deep-merges the
    single `reads.<uid>` key without clobbering the other party's entry."""
    if firebase.is_stub():
        logger.info("[firestore-stub] conversations/%s reads[%s]=%s", conversation.pk, user.id, read_at)
        return
    _doc(conversation).set({"reads": {str(user.id): read_at}}, merge=True)
