"""Ticket sweepers (SRS §23): auto-solve idle open tickets, auto-close solved ones."""
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from apps.core.services import get_setting


@shared_task
def auto_solve_tickets() -> int:
    """Open/Answered tickets idle past tickets.auto_solve_days → Solved."""
    from .models import Ticket
    from .services import solve

    days = int(get_setting("tickets.auto_solve_days", 7))
    cutoff = timezone.now() - timedelta(days=days)
    stale = Ticket.objects.filter(status__in=Ticket.OPEN_STATUSES, last_activity_at__lt=cutoff)
    count = 0
    for ticket in stale:
        if ticket.contract_id is None or not _contract_disputed(ticket):
            solve(ticket, report="حُلّت تلقائيًا لعدم وجود نشاط")
            count += 1
    return count


@shared_task
def auto_close_tickets() -> int:
    """Solved tickets idle past tickets.auto_close_days → Closed (read-only)."""
    from .models import Ticket
    from .services import close

    days = int(get_setting("tickets.auto_close_days", 7))
    cutoff = timezone.now() - timedelta(days=days)
    stale = Ticket.objects.filter(status=Ticket.Status.SOLVED, last_activity_at__lt=cutoff)
    count = 0
    for ticket in stale:
        if ticket.contract_id is None or not _contract_disputed(ticket):
            close(ticket, report="أُغلقت تلقائيًا بعد الحل")
            count += 1
    return count


def _contract_disputed(ticket) -> bool:
    from apps.contracts.models import Contract
    return bool(ticket.contract and ticket.contract.status == Contract.Status.DISPUTED)
