"""Ticket state machine (FR-TKT-2 / BR-14): the full Open→Pending→On-Hold→Solved→Closed table
incl. mandatory On-Hold reason, illegal moves, and On-Hold's exclusion from idle auto-solve."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.tickets import services as tk
from apps.tickets.models import Ticket
from apps.tickets.tasks import auto_solve_tickets
from tests.factories import TicketTypeFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def _ticket():
    return tk.create_ticket(UserFactory(), ticket_type=TicketTypeFactory(), title="t", message="m")


def test_on_hold_requires_reason():
    ticket = _ticket()
    with pytest.raises(ValidationError):
        tk.hold(ticket, reason="")
    tk.hold(ticket, reason="بانتظار جهة خارجية")
    ticket.refresh_from_db()
    assert ticket.status == Ticket.Status.ON_HOLD
    assert ticket.on_hold_reason == "بانتظار جهة خارجية"
    assert ticket.on_hold_at is not None


def test_pending_hold_resume_flow():
    ticket = _ticket()
    tk.set_pending(ticket)
    ticket.refresh_from_db()
    assert ticket.status == Ticket.Status.PENDING

    tk.hold(ticket, reason="معلّق")
    ticket.refresh_from_db()
    assert ticket.status == Ticket.Status.ON_HOLD

    tk.resume(ticket)
    ticket.refresh_from_db()
    assert ticket.status == Ticket.Status.OPEN
    assert ticket.on_hold_reason == "" and ticket.on_hold_at is None


def test_reply_lifts_hold_and_clears_reason():
    ticket = _ticket()
    tk.hold(ticket, reason="بانتظار العميل")
    tk.reply(ticket, ticket.user, "وصلت المعلومة المطلوبة")
    ticket.refresh_from_db()
    assert ticket.status == Ticket.Status.OPEN
    assert ticket.on_hold_reason == "" and ticket.on_hold_at is None  # no stale hold state


def test_full_path_to_closed():
    ticket = _ticket()
    tk.set_pending(ticket)
    tk.hold(ticket, reason="x")
    tk.resume(ticket)
    tk.solve(ticket)
    ticket.refresh_from_db()
    assert ticket.status == Ticket.Status.SOLVED
    tk.close(ticket)
    ticket.refresh_from_db()
    assert ticket.status == Ticket.Status.CLOSED


def test_illegal_transitions():
    solved = _ticket()
    tk.solve(solved)
    with pytest.raises(ValidationError):
        tk.hold(solved, reason="x")     # can't hold a solved ticket
    with pytest.raises(ValidationError):
        tk.set_pending(solved)          # can't pend a solved ticket

    open_ticket = _ticket()
    with pytest.raises(ValidationError):
        tk.resume(open_ticket)          # resume only from On-Hold

    closed = _ticket()
    tk.close(closed)
    with pytest.raises(ValidationError):
        tk.reply(closed, closed.user, "بعد الإغلاق")  # closed is read-only


def test_on_hold_excluded_from_auto_solve_but_pending_included():
    held = _ticket()
    tk.hold(held, reason="x")
    Ticket.objects.filter(pk=held.pk).update(last_activity_at=timezone.now() - timedelta(days=30))

    pending = _ticket()
    tk.set_pending(pending)
    Ticket.objects.filter(pk=pending.pk).update(last_activity_at=timezone.now() - timedelta(days=30))

    assert auto_solve_tickets() == 1  # only the pending one
    held.refresh_from_db()
    pending.refresh_from_db()
    assert held.status == Ticket.Status.ON_HOLD   # untouched
    assert pending.status == Ticket.Status.SOLVED
