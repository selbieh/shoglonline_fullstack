"""Chat domain services — conversation creation rules (BR-11), messaging, read
cursors, and the read-only lifecycle (FR-CHAT-7, BR-10).

Authorization is relationship-based (party to the conversation), never mode-based.
"""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.services import get_setting

from . import firestore
from .models import Conversation, ConversationMember, Message

ERR = {
    "self": {"code": "no_self_chat", "message_ar": "لا يمكنك محادثة نفسك"},
    "disabled": {"code": "chat_disabled", "message_ar": "المحادثات معطّلة حاليًا على المنصة"},
    "read_only": {"code": "conversation_read_only", "message_ar": "هذه المحادثة للقراءة فقط"},
    "not_member": {"code": "not_a_member", "message_ar": "لست طرفًا في هذه المحادثة"},
    "cold": {"code": "cold_message_blocked", "message_ar": "لا يمكن للمستقل بدء المحادثة قبل وجود عرض أو عقد"},
    "empty": {"code": "empty_message", "message_ar": "الرسالة فارغة"},
    "report_reason": {"code": "reason_required", "message_ar": "سبب الإبلاغ إلزامي"},
    # rule D-2: chat opens only once a funded/active contract exists between the two parties.
    "no_active_contract": {
        "code": "no_active_contract",
        "message_ar": "تُفتح المحادثة فقط بعد وجود عقد نشِط بين الطرفين",
    },
}


def chat_enabled() -> bool:
    return bool(get_setting("chat.enabled", True))


def _ordered(u1, u2):
    """Stable (a, b) with a.id < b.id so a pair maps to one row per context."""
    return (u1, u2) if u1.id < u2.id else (u2, u1)


@transaction.atomic
def _get_or_create(user1, user2, *, context_type, contract=None, job=None) -> Conversation:
    if user1.id == user2.id:
        raise PermissionDenied(ERR["self"])  # BR-21
    a, b = _ordered(user1, user2)
    conv, created = Conversation.objects.get_or_create(
        user_a=a, user_b=b, context_type=context_type, contract=contract, job=job,
    )
    if created:
        ConversationMember.objects.bulk_create([
            ConversationMember(conversation=conv, user=a),
            ConversationMember(conversation=conv, user=b),
        ])
        firestore.mirror_conversation(conv)
    return conv


def _contract_chat_allowed(contract) -> bool:
    """A contract is 'live' enough to OPEN a chat once it's funded — Active/Delivered/Disputed.
    Pending-Funding (unfunded) and Cancelled never open one (rule D-2)."""
    from apps.contracts.models import Contract  # noqa: PLC0415 (avoid import cycle)
    return contract.status in (
        Contract.Status.ACTIVE, Contract.Status.DELIVERED, Contract.Status.DISPUTED,
    )


def get_or_create_for_contract(contract) -> Conversation:
    """Both parties of a contract chat freely, but only once it's a funded/active contract
    (rule D-2). An existing conversation is always returned so it survives into Completed/
    warranty, where the read-only lifecycle takes over."""
    existing = Conversation.objects.filter(
        context_type=Conversation.Context.CONTRACT, contract=contract,
    ).first()
    if existing:
        return existing
    if not _contract_chat_allowed(contract):
        raise ValidationError(ERR["no_active_contract"])
    return _get_or_create(contract.employer, contract.worker,
                          context_type=Conversation.Context.CONTRACT, contract=contract)


def start_from_proposal(employer, proposal) -> Conversation:
    """Disabled by rule D-2: chat no longer opens at the proposal stage. A conversation is
    opened automatically when the contract is funded (becomes Active)."""
    raise PermissionDenied(ERR["no_active_contract"])


@transaction.atomic
def send_message(conversation: Conversation, sender, *, body: str = "", files=None,
                 attachment_ids=None) -> Message:
    if not chat_enabled():
        raise ValidationError(ERR["disabled"])  # kill-switch (E1, AC-6)
    conversation = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if not conversation.has_member(sender):
        raise PermissionDenied(ERR["not_member"])
    if conversation.status == Conversation.Status.READ_ONLY:
        raise ValidationError(ERR["read_only"])  # FR-CHAT-7
    body = _filter_banned(body or "")
    if not body.strip() and not files and not attachment_ids:
        raise ValidationError(ERR["empty"])

    message = Message.objects.create(conversation=conversation, sender=sender, body=body, files=files or [])
    if attachment_ids:
        from apps.attachments.services import attach  # noqa: PLC0415 (avoid import cycle)
        attach(attachment_ids, message, sender)  # FR-CHAT-4
    conversation.last_message_snippet = body[:160]
    conversation.last_message_at = message.created_at
    conversation.save(update_fields=["last_message_snippet", "last_message_at"])
    # sender has implicitly read up to their own message
    ConversationMember.objects.filter(conversation=conversation, user=sender).update(
        last_read_at=message.created_at
    )
    firestore.mirror_message(message)

    recipient = conversation.other(sender)
    from apps.notifications.services import notify  # noqa: PLC0415 (avoid cycle)
    notify(recipient, kind="chat_message", title=f"رسالة جديدة من {sender.first_name or sender.email}",
           body=body[:120], deep_link=f"/messages/{conversation.pk}", email=False)  # email handled by 10-min checker
    return message


@transaction.atomic
def persist_synced_message(conversation: Conversation, sender, *, body: str = "", files=None,
                          firestore_id: str, attachment_ids=None) -> Message:
    """Record a message a client wrote *directly to Firestore* into Postgres (the metadata
    mirror for unread-email + oversight). Called by the Firestore→PG sync (/chat/sync).

    Idempotent on `firestore_id` so a Cloud Function retry never double-persists — `get_or_create`
    makes the dedupe race-safe (two concurrent retries can't both insert past the unique key).
    Does NOT re-mirror to Firestore (the message already lives there — that's the source of this
    call). Read-only is enforced at WRITE time by the security rules; a message already accepted
    into Firestore is recorded here even if the conversation locked in the meantime (we never drop
    a legitimately-sent message). The trusted caller (Cloud Function) must pass the Firestore doc's
    rule-validated `sender`; we re-check membership here as defense in depth.
    """
    conversation = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if not conversation.has_member(sender):
        raise PermissionDenied(ERR["not_member"])

    message, created = Message.objects.get_or_create(
        firestore_id=firestore_id,
        defaults={"conversation": conversation, "sender": sender,
                  "body": body or "", "files": files or []},
    )
    if not created:
        return message  # a concurrent/retried sync already persisted this exact message

    if attachment_ids:
        from apps.attachments.services import attach  # noqa: PLC0415 (avoid import cycle)
        attach(attachment_ids, message, sender)
    conversation.last_message_snippet = (body or "")[:160]
    conversation.last_message_at = message.created_at
    conversation.save(update_fields=["last_message_snippet", "last_message_at"])
    ConversationMember.objects.filter(conversation=conversation, user=sender).update(
        last_read_at=message.created_at
    )
    recipient = conversation.other(sender)
    from apps.notifications.services import notify  # noqa: PLC0415 (avoid cycle)
    notify(recipient, kind="chat_message", title=f"رسالة جديدة من {sender.first_name or sender.email}",
           body=(body or "")[:120], deep_link=f"/messages/{conversation.pk}", email=False)
    return message


def _filter_banned(text: str) -> str:
    for word in get_setting("chat.banned_words", []) or []:
        if word:
            text = text.replace(word, "█" * len(word))
    return text


def mark_read(conversation: Conversation, user) -> None:
    if not conversation.has_member(user):
        raise PermissionDenied(ERR["not_member"])
    now = timezone.now()
    ConversationMember.objects.filter(conversation=conversation, user=user).update(last_read_at=now)
    # Mirror the cursor into the Firestore conversation doc so the other party sees ✓✓ live.
    firestore.mirror_read(conversation, user, now)


def unread_count(conversation: Conversation, user) -> int:
    member = conversation.members.filter(user=user).first()
    if not member:
        return 0
    qs = conversation.messages.exclude(sender=user)
    if member.last_read_at:
        qs = qs.filter(created_at__gt=member.last_read_at)
    return qs.count()


@transaction.atomic
def set_read_only(conversation: Conversation) -> None:
    """Flip the conversation read-only in Postgres AND the Firestore mirror (BR-10)."""
    if conversation.status == Conversation.Status.READ_ONLY:
        return
    conversation.status = Conversation.Status.READ_ONLY
    conversation.save(update_fields=["status"])
    firestore.mirror_status(conversation)


def lock_contract_conversations(contract) -> int:
    """Called at warranty end (BR-10): every conversation tied to the contract goes read-only."""
    locked = 0
    for conv in contract.conversations.filter(status=Conversation.Status.ACTIVE):
        set_read_only(conv)
        locked += 1
    return locked


# ====================================================================== abuse reports (FR-CHAT-10)
@transaction.atomic
def report_conversation(conversation: Conversation, reporter, *, reason: str, message_id=None):
    """A party reports a conversation/message for abuse → admin review queue."""
    from .models import ChatReport

    if not conversation.has_member(reporter):
        raise PermissionDenied(ERR["not_member"])
    if not (reason or "").strip():
        raise ValidationError(ERR["report_reason"])
    message = conversation.messages.filter(pk=message_id).first() if message_id else None
    return ChatReport.objects.create(
        conversation=conversation, reporter=reporter, reason=reason.strip()[:500], message=message
    )


@transaction.atomic
def resolve_report(report, *, action: str, reviewer=None):
    """Admin disposition of a report (FR-CHAT-10): dismiss | warn | freeze | archive.
    The offender is the other party of the conversation."""
    from .models import ChatReport

    offender = report.conversation.other(report.reporter)
    if action == "dismiss":
        report.resolution = "dismissed"
        report.status = ChatReport.Status.DISMISSED
    elif action == "warn":
        from apps.notifications.services import notify
        # a moderation warning must always reach the offender (bypass the marketing opt-out)
        notify(offender, kind="admin_broadcast", title="تنبيه بخصوص سلوك المحادثة",
               body="ورد بلاغ عن محتوى غير لائق في إحدى محادثاتك. يرجى الالتزام بقواعد المنصة.",
               force=True)
        report.resolution = "warned"
        report.status = ChatReport.Status.ACTIONED
    elif action == "freeze":
        from apps.accounts.services import freeze_user
        freeze_user(offender, reason=f"chat abuse report #{report.pk}", actor=reviewer)
        report.resolution = "frozen"
        report.status = ChatReport.Status.ACTIONED
    elif action == "archive":
        set_read_only(report.conversation)
        report.resolution = "archived"
        report.status = ChatReport.Status.ACTIONED
    else:
        raise ValidationError({"code": "bad_action", "message_ar": "إجراء غير معروف"})
    report.reviewed_by = reviewer
    report.reviewed_at = timezone.now()
    report.save(update_fields=["resolution", "status", "reviewed_by", "reviewed_at"])
    return report
