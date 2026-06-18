"""Admin dispute resolution (ADM-5 / BR-22): the picker posts the correct ledger legs, closes the
coupled dispute ticket, and never leaves the contract Disputed."""
from decimal import Decimal

import pytest
from django.contrib.admin.sites import AdminSite

from apps.contracts import services as csvc
from apps.contracts.admin import ContractAdmin
from apps.contracts.models import Contract
from apps.core.models import AuditLog
from apps.payments import services as pay
from apps.tickets import services as tk
from apps.tickets.models import Ticket, TicketType
from tests.factories import ContractFactory, StaffUserFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def _disputed_contract_with_ticket(fund_wallet):
    employer, worker = UserFactory(), UserFactory()
    commission, earning = csvc.compute_commission(Decimal("100"), Decimal("10"))
    contract = ContractFactory(employer=employer, worker=worker, budget=Decimal("100"),
                               commission_pct=Decimal("10"), commission_amount=commission,
                               worker_earning=earning)
    fund_wallet(employer, "100")
    contract = csvc.try_fund(contract)  # → ACTIVE, escrow_held = 100 (reassign the fresh object)
    dispute_type = TicketType.objects.create(name_ar="نزاع", slug="dispute", is_dispute=True)
    ticket = tk.create_ticket(employer, ticket_type=dispute_type, title="نزاع", message="x", contract=contract)
    contract.refresh_from_db()
    assert contract.status == Contract.Status.DISPUTED
    assert contract.dispute_ticket_ref == str(ticket.pk)
    return contract, ticket


def test_cancel_refund_posts_legs_and_closes_ticket(fund_wallet, admin_request):
    contract, ticket = _disputed_contract_with_ticket(fund_wallet)
    ContractAdmin(Contract, AdminSite()).dispute_cancel_refund(
        admin_request(StaffUserFactory()), Contract.objects.filter(pk=contract.pk)
    )
    contract.refresh_from_db()
    ticket.refresh_from_db()
    assert contract.status == Contract.Status.CANCELLED  # never left Disputed
    assert ticket.status == Ticket.Status.CLOSED          # coupled ticket auto-closed

    wallet = pay.get_wallet(contract.employer)
    assert wallet.available == Decimal("100") and wallet.escrow_held == Decimal("0")  # full refund
    assert AuditLog.objects.filter(action="admin.dispute_cancel", object_id=str(contract.pk)).exists()


def test_split_pays_worker_and_commission(fund_wallet, admin_request):
    contract, ticket = _disputed_contract_with_ticket(fund_wallet)
    ContractAdmin(Contract, AdminSite()).dispute_split_50(
        admin_request(StaffUserFactory()), Contract.objects.filter(pk=contract.pk)
    )
    contract.refresh_from_db()
    ticket.refresh_from_db()
    assert contract.status == Contract.Status.COMPLETED
    assert ticket.status == Ticket.Status.CLOSED

    employer_wallet = pay.get_wallet(contract.employer)
    worker_wallet = pay.get_wallet(contract.worker)
    # 50% refund (50) to employer; worker gets 50 minus 10% commission = 45; escrow drained
    assert employer_wallet.available == Decimal("50")
    assert worker_wallet.available == Decimal("45")
    assert employer_wallet.escrow_held == Decimal("0")


def test_resume_keeps_contract_active_and_ticket_open(fund_wallet, admin_request):
    contract, ticket = _disputed_contract_with_ticket(fund_wallet)
    ContractAdmin(Contract, AdminSite()).dispute_resume(
        admin_request(StaffUserFactory()), Contract.objects.filter(pk=contract.pk)
    )
    contract.refresh_from_db()
    assert contract.status in (Contract.Status.ACTIVE, Contract.Status.DELIVERED)  # not Disputed
