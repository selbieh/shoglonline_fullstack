"""Chat sweepers (SRS §23):
- unread-email checker: one email per unread message that stays unread past the
  configured delay (default 10 min) — exactly once (FR-CHAT-5, AC-6).
- idle-conversation locker: non-contract conversations go read-only after the idle
  window or when their context dies (FR-CHAT-7).
"""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.core.services import get_setting

logger = logging.getLogger(__name__)


@shared_task
def send_unread_chat_emails() -> int:
    """Email the recipient once for any message still unread after the delay window."""
    from .models import ConversationMember, Message

    if not (get_setting("emails.enabled", True) and get_setting("emails.chat_unread_enabled", True)):
        return 0
    delay = int(get_setting("chat.unread_email_delay_minutes", 10))
    cutoff = timezone.now() - timedelta(minutes=delay)

    from apps.notifications.services import preference_allows
    pending = (Message.objects.filter(unread_email_sent=False, created_at__lt=cutoff)
               .select_related("conversation", "sender"))
    sent = 0
    for msg in pending:
        conv = msg.conversation
        recipient = conv.other(msg.sender)
        member = ConversationMember.objects.filter(conversation=conv, user=recipient).first()
        already_read = member and member.last_read_at and member.last_read_at >= msg.created_at
        opted_out = not preference_allows(recipient, "chat_message")  # FR-PROF-9: chat-unread category
        if not already_read and not opted_out:
            from apps.notifications.services import send_branded_email
            send_branded_email(
                to=recipient.email,
                subject=f"رسالة جديدة من {msg.sender.first_name or msg.sender.email}",
                body=(msg.body or "")[:200],
                deep_link=f"/messages/{conv.pk}",
                cta_label="افتح المحادثة",
            )
            sent += 1
        msg.unread_email_sent = True  # fire once regardless (no repeat spam)
        msg.save(update_fields=["unread_email_sent"])
    logger.info("unread-chat-email sweep: %s sent", sent)
    return sent


@shared_task
def lock_idle_conversations() -> int:
    """FR-CHAT-7: non-contract conversations idle past conversations.idle_lock_days → read-only."""
    from .models import Conversation
    from .services import set_read_only

    days = int(get_setting("conversations.idle_lock_days", 30))
    cutoff = timezone.now() - timedelta(days=days)
    idle = Conversation.objects.filter(status=Conversation.Status.ACTIVE).exclude(
        context_type=Conversation.Context.CONTRACT
    ).filter(last_message_at__lt=cutoff)
    count = 0
    for conv in idle:
        set_read_only(conv)
        count += 1
    return count
