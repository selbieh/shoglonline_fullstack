"""Ticket services — status machine + the dispute↔contract coupling (BR-22, AC-9)."""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from .models import Ticket, TicketReply

ERR = {
    "closed": {"code": "ticket_closed", "message_ar": "التذكرة مغلقة — لا يمكن التعديل"},
    "not_owner": {"code": "not_owner", "message_ar": "لا تملك صلاحية على هذه التذكرة"},
    "dispute_open": {"code": "dispute_unresolved",
                     "message_ar": "لا يمكن إغلاق التذكرة قبل حسم النزاع المرتبط بالعقد"},
    "empty": {"code": "empty_message", "message_ar": "الرسالة فارغة"},
    "hold_reason": {"code": "reason_required", "message_ar": "سبب التعليق إلزامي"},
    "bad_state": {"code": "bad_ticket_state",
                  "message_ar": "لا يمكن تنفيذ هذا الإجراء في حالة التذكرة الحالية"},
}


@transaction.atomic
def create_ticket(user, *, ticket_type, title: str, message: str, job=None, contract=None,
                  attachment_ids=None) -> Ticket:
    """FR-TKT-1. A dispute-type ticket against a contract flags it Disputed (BR-22)."""
    ticket = Ticket.objects.create(
        user=user, type=ticket_type, title=title, message=message, job=job, contract=contract
    )
    if attachment_ids:
        from apps.attachments.services import attach  # noqa: PLC0415 (avoid import cycle)
        attach(attachment_ids, ticket, user)
    if ticket_type.is_dispute and contract is not None:
        from apps.contracts.models import Contract
        from apps.contracts.services import open_dispute
        if contract.status in (Contract.Status.ACTIVE, Contract.Status.DELIVERED):
            open_dispute(contract, user, reason=title, ticket_ref=str(ticket.pk))
    return ticket


@transaction.atomic
def reply(ticket: Ticket, author, message: str, *, is_staff: bool = False) -> TicketReply:
    if ticket.status == Ticket.Status.CLOSED:
        raise ValidationError(ERR["closed"])  # closed = read-only (AC-9)
    if not message.strip():
        raise ValidationError(ERR["empty"])
    if not is_staff and ticket.user_id != author.id:
        raise PermissionDenied(ERR["not_owner"])
    entry = TicketReply.objects.create(ticket=ticket, author=author, message=message, is_staff=is_staff)
    # staff reply → Answered; user reply reopens (incl. lifting a Pending/On-Hold). A reply always
    # returns the ticket to an active, not-held state, so any prior hold reason is cleared.
    ticket.status = Ticket.Status.ANSWERED if is_staff else Ticket.Status.OPEN
    ticket.on_hold_reason = ""
    ticket.on_hold_at = None
    ticket.last_activity_at = timezone.now()
    ticket.save(update_fields=["status", "on_hold_reason", "on_hold_at", "last_activity_at"])
    return entry


@transaction.atomic
def set_pending(ticket: Ticket) -> Ticket:
    """FR-TKT-2: park a ticket awaiting external/3rd-party input. Not allowed once solved/closed."""
    if ticket.status in (Ticket.Status.SOLVED, Ticket.Status.CLOSED):
        raise ValidationError(ERR["bad_state"])
    ticket.status = Ticket.Status.PENDING
    ticket.last_activity_at = timezone.now()
    ticket.save(update_fields=["status", "last_activity_at"])
    return ticket


@transaction.atomic
def hold(ticket: Ticket, *, reason: str) -> Ticket:
    """BR-14: On-Hold requires a reason. Not allowed once solved/closed."""
    if ticket.status in (Ticket.Status.SOLVED, Ticket.Status.CLOSED):
        raise ValidationError(ERR["bad_state"])
    if not (reason or "").strip():
        raise ValidationError(ERR["hold_reason"])
    ticket.status = Ticket.Status.ON_HOLD
    ticket.on_hold_reason = reason
    ticket.on_hold_at = timezone.now()
    ticket.last_activity_at = ticket.on_hold_at
    ticket.save(update_fields=["status", "on_hold_reason", "on_hold_at", "last_activity_at"])
    return ticket


@transaction.atomic
def resume(ticket: Ticket) -> Ticket:
    """Lift an On-Hold ticket back to Open."""
    if ticket.status != Ticket.Status.ON_HOLD:
        raise ValidationError(ERR["bad_state"])
    ticket.status = Ticket.Status.OPEN
    ticket.on_hold_reason = ""
    ticket.on_hold_at = None
    ticket.last_activity_at = timezone.now()
    ticket.save(update_fields=["status", "on_hold_reason", "on_hold_at", "last_activity_at"])
    return ticket


@transaction.atomic
def solve(ticket: Ticket, *, report: str = "") -> Ticket:
    if ticket.status == Ticket.Status.CLOSED:
        raise ValidationError(ERR["closed"])
    ticket.status = Ticket.Status.SOLVED
    ticket.solved_at = timezone.now()
    ticket.last_activity_at = ticket.solved_at
    if report:
        ticket.resolution_report = report
    ticket.save(update_fields=["status", "solved_at", "last_activity_at", "resolution_report"])
    return ticket


@transaction.atomic
def close(ticket: Ticket, *, report: str = "") -> Ticket:
    """A dispute-coupled ticket can't close while its contract is still Disputed (BR-22)."""
    if ticket.contract_id is not None:
        from apps.contracts.models import Contract
        # read fresh — the linked contract's status may have changed since load
        status = Contract.objects.filter(pk=ticket.contract_id).values_list("status", flat=True).first()
        if status == Contract.Status.DISPUTED:
            raise ValidationError(ERR["dispute_open"])
    ticket.status = Ticket.Status.CLOSED
    ticket.closed_at = timezone.now()
    ticket.last_activity_at = ticket.closed_at
    if report:
        ticket.resolution_report = report
    ticket.save(update_fields=["status", "closed_at", "last_activity_at", "resolution_report"])
    return ticket
