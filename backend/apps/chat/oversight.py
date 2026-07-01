"""Read-only chat oversight adapter (ADM-6) — powers the admin Chat Inbox.

A *hybrid* reader, by design:
  * The conversation **list** is served from PostgreSQL — the source of truth. It's cheap,
    paginated and searchable by participant email/name (Firestore stores only display names,
    so it can't answer "find every chat involving x@y.com").
  * Each conversation's **message thread** is read LIVE from Firestore when it's available —
    exactly what the two parties see in real time, before the Cloud Function sync lands — and
    falls back to the PostgreSQL mirror when Firestore is stubbed/unavailable (dev, tests, or an
    outage). Both stores hold the same messages (every Firestore write is synced back to Postgres
    via /chat/sync), so the fallback is faithful; `source` tells the UI which one answered.

Nothing here writes. Moderation goes through apps.chat.services / apps.accounts.services.
"""
import logging

from django.contrib.auth import get_user_model
from django.db.models import Count, Q

from . import firebase
from .models import Conversation, ConversationMember, Message

logger = logging.getLogger(__name__)
User = get_user_model()


# --------------------------------------------------------------------------- helpers
def _user_label(user) -> str:
    if user is None:
        return ""
    name = " ".join(p for p in (user.first_name, user.last_name) if p).strip()
    return name or user.email or f"user-{user.id}"


def _participant(user, uid) -> dict:
    return {
        "id": uid,
        "name": _user_label(user) or f"user-{uid}",
        "email": (user.email if user else ""),
        "avatar": (user.avatar_url if user else ""),
        "status": (user.status if user else ""),
    }


def _participants(conv, users_by_id) -> list:
    return [
        _participant(users_by_id.get(conv.user_a_id), conv.user_a_id),
        _participant(users_by_id.get(conv.user_b_id), conv.user_b_id),
    ]


def _to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _iso(value):
    if value is None:
        return None
    fn = getattr(value, "isoformat", None)
    return fn() if callable(fn) else str(value)


def _name_for(uid, users_by_id, fallback="") -> str:
    user = users_by_id.get(uid)
    if user is not None:
        return _user_label(user)
    return fallback or (f"user-{uid}" if uid else "—")


# --------------------------------------------------------------------------- conversation list
def list_conversations(*, search="", status="", context="", has_messages=False, limit=40, offset=0):
    """Return (items, total) for the inbox left pane — newest activity first.

    Filters (all optional): `search` matches participant email/name or the last-message snippet;
    `status` narrows to active|read_only; `context` narrows to contract|proposal|service|direct;
    `has_messages` keeps only conversations with at least one persisted message. Always from
    Postgres so search + pagination stay cheap and exact.
    """
    qs = Conversation.objects.select_related("user_a", "user_b")
    if status in (Conversation.Status.ACTIVE, Conversation.Status.READ_ONLY):
        qs = qs.filter(status=status)
    if context in Conversation.Context.values:
        qs = qs.filter(context_type=context)
    if has_messages:
        qs = qs.annotate(_mc=Count("messages")).filter(_mc__gt=0)
    search = (search or "").strip()
    if search:
        qs = qs.filter(
            Q(user_a__email__icontains=search)
            | Q(user_b__email__icontains=search)
            | Q(user_a__first_name__icontains=search)
            | Q(user_b__first_name__icontains=search)
            | Q(last_message_snippet__icontains=search)
        )
    total = qs.count()
    rows = list(qs.order_by("-last_message_at", "-created_at")[offset:offset + limit])
    items = []
    for conv in rows:
        users_by_id = {conv.user_a_id: conv.user_a, conv.user_b_id: conv.user_b}
        items.append({
            "id": conv.pk,
            "status": conv.status,
            "context": conv.context_type,
            "participants": _participants(conv, users_by_id),
            "snippet": conv.last_message_snippet,
            "last_message_at": conv.last_message_at,
        })
    return items, total


# --------------------------------------------------------------------------- one thread
def get_thread(conv_id) -> dict:
    """Full thread payload for the right pane. Raises Conversation.DoesNotExist if missing.

    Postgres is the COMPLETE source of truth (it holds legacy-imported threads and every synced
    message), so it's always the base. Any live Firestore message not yet synced back is merged
    in on top — this is what makes the reader show a thread even when Firestore has none of it
    (e.g. WordPress-imported conversations that were never written to Firestore).
    """
    conv = Conversation.objects.select_related("user_a", "user_b", "contract", "job").get(pk=conv_id)
    users_by_id = {conv.user_a_id: conv.user_a, conv.user_b_id: conv.user_b}

    pg_messages = _messages_from_postgres(conv, users_by_id)
    fs_messages = _messages_from_firestore(conv, users_by_id)  # None when stubbed/unavailable
    if fs_messages:
        messages, source = _merge_messages(pg_messages, fs_messages), "firestore"
    else:
        messages, source = pg_messages, "postgres"
    for m in messages:  # drop internal dedupe keys before serialization
        for k in ("_pgid", "_fsid", "_docid"):
            m.pop(k, None)

    return {
        "conversation": {
            "id": conv.pk,
            "status": conv.status,
            "context": conv.context_type,
            "contract_id": conv.contract_id,
            "job_id": conv.job_id,
            "participants": _participants(conv, users_by_id),
            "reads": _read_cursors(conv),
        },
        "messages": messages,
        "source": source,
    }


def _read_cursors(conv) -> dict:
    """Per-participant read cursor (drives ✓✓) — always from Postgres (ConversationMember)."""
    cursors = {}
    for member in ConversationMember.objects.filter(conversation=conv):
        cursors[str(member.user_id)] = _iso(member.last_read_at)
    return cursors


def _pg_files(message) -> list:
    """Attachment metadata in the same shape the Firestore doc carries (id/kind/name/size)."""
    files = [
        {"id": a.id, "kind": a.kind, "name": a.original_name, "size": a.size}
        for a in message.attachments.filter(is_deleted=False)
    ]
    if not files and isinstance(message.files, list):  # legacy JSON placeholder
        files = [f for f in message.files if isinstance(f, dict)]
    return files


def _messages_from_postgres(conv, users_by_id) -> list:
    msgs = (
        Message.objects.filter(conversation=conv)
        .select_related("sender")
        .prefetch_related("attachments")
        .order_by("created_at")
    )
    out = []
    for m in msgs:
        if m.sender_id not in users_by_id and m.sender is not None:
            users_by_id[m.sender_id] = m.sender  # third-party sender (shouldn't happen, but be safe)
        out.append({
            "id": m.pk,
            "_pgid": m.pk,
            "_fsid": m.firestore_id or None,
            "sender_id": m.sender_id,
            "sender_name": _name_for(m.sender_id, users_by_id),
            "body": m.body,
            "files": _pg_files(m),
            "created_at": _iso(m.created_at),
        })
    return out


def _messages_from_firestore(conv, users_by_id):
    """A list of live Firestore messages, or None when stubbed/unavailable.

    We deliberately do NOT `order_by("createdAt")` in the query — that would silently drop any
    document missing the field — we stream them all and sort during the merge instead.
    """
    if firebase.is_stub():
        return None
    try:
        col = (
            firebase.db()
            .collection("conversations").document(str(conv.pk))
            .collection("messages")
        )
        out = []
        for doc in col.stream():
            d = doc.to_dict() or {}
            sender_id = _to_int(d.get("sender"))
            pgid = _to_int(d.get("pgId"))
            out.append({
                "id": pgid or doc.id,
                "_pgid": pgid,
                "_docid": doc.id,
                "sender_id": sender_id,
                "sender_name": _name_for(sender_id, users_by_id, fallback=str(d.get("sender") or "")),
                "body": d.get("body") or "",
                "files": d.get("files") or [],
                "created_at": _iso(d.get("createdAt")),
            })
        return out
    except Exception:  # noqa: BLE001 — oversight must never 500 on a Firestore hiccup; mirror covers it
        logger.exception("chat oversight: Firestore read failed for conversation %s; using Postgres mirror", conv.pk)
        return None


def _merge_messages(pg_messages, fs_messages):
    """Postgres messages + any live Firestore message not yet synced back, sorted by time.

    A Firestore message is a duplicate of a Postgres row when their pg id matches (backend-sent
    messages carry pgId) OR when the Firestore doc id matches a Postgres `firestore_id`
    (client-sent messages are keyed that way by the /chat/sync webhook)."""
    seen_pks = {m["_pgid"] for m in pg_messages if m.get("_pgid")}
    seen_fsids = {m["_fsid"] for m in pg_messages if m.get("_fsid")}
    merged = list(pg_messages)
    for m in fs_messages:
        if m.get("_pgid") and m["_pgid"] in seen_pks:
            continue
        if m.get("_docid") and m["_docid"] in seen_fsids:
            continue
        merged.append(m)  # a genuinely unsynced live message
    merged.sort(key=lambda x: x.get("created_at") or "")
    return merged
