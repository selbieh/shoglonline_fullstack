"""Contract state machine (SRS §9.10): legal transitions advance; illegal ones raise and
never move money. Drives the real services so the escrow legs are exercised end-to-end."""
from decimal import Decimal

import pytest
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.contracts import services as svc
from apps.contracts.models import Contract, Submission
from tests.factories import ContractFactory, UserFactory

pytestmark = [pytest.mark.unit, pytest.mark.django_db]


def make_active_contract(fund_wallet, *, budget="100", pct="10"):
    employer, worker = UserFactory(), UserFactory()
    commission, earning = svc.compute_commission(Decimal(budget), Decimal(pct))
    c = ContractFactory(
        employer=employer, worker=worker, budget=Decimal(budget),
        commission_pct=Decimal(pct), commission_amount=commission, worker_earning=earning,
    )
    fund_wallet(employer, budget)
    c = svc.try_fund(c)
    assert c.status == Contract.Status.ACTIVE
    return c


# ----------------------------------------------------------------- legal path
def test_full_happy_path_active_to_released(fund_wallet):
    c = make_active_contract(fund_wallet)
    sub = svc.submit_deliverable(c, c.worker, notes="تم")
    c.refresh_from_db()
    assert c.status == Contract.Status.DELIVERED

    svc.accept_submission(sub, c.employer)
    c.refresh_from_db()
    assert c.status == Contract.Status.COMPLETED
    assert c.warranty_ends_at is not None

    svc.release_warranty(c)
    c.refresh_from_db()
    assert c.funds_released is True


def test_reject_returns_to_active_then_resubmit(fund_wallet):
    c = make_active_contract(fund_wallet)
    sub = svc.submit_deliverable(c, c.worker)
    svc.reject_submission(sub, c.employer, reason="ينقص ملف")
    c.refresh_from_db()
    assert c.status == Contract.Status.ACTIVE
    # worker can resubmit
    svc.submit_deliverable(c, c.worker)
    c.refresh_from_db()
    assert c.status == Contract.Status.DELIVERED


# --------------------------------------------------------------- illegal moves
def test_accept_before_delivery_is_rejected(fund_wallet):
    c = make_active_contract(fund_wallet)
    sub = Submission.objects.create(contract=c)  # fabricate an open submission while ACTIVE
    with pytest.raises(ValidationError):
        svc.accept_submission(sub, c.employer)


def test_submit_by_non_worker_is_forbidden(fund_wallet):
    c = make_active_contract(fund_wallet)
    with pytest.raises(PermissionDenied):
        svc.submit_deliverable(c, c.employer)  # employer can't deliver


def test_accept_by_non_employer_is_forbidden(fund_wallet):
    c = make_active_contract(fund_wallet)
    sub = svc.submit_deliverable(c, c.worker)
    with pytest.raises(PermissionDenied):
        svc.accept_submission(sub, c.worker)  # worker can't self-accept


def test_reject_requires_a_reason(fund_wallet):
    c = make_active_contract(fund_wallet)
    sub = svc.submit_deliverable(c, c.worker)
    with pytest.raises(ValidationError):
        svc.reject_submission(sub, c.employer, reason="   ")


def test_submit_on_completed_is_rejected(fund_wallet):
    c = make_active_contract(fund_wallet)
    sub = svc.submit_deliverable(c, c.worker)
    svc.accept_submission(sub, c.employer)
    c.refresh_from_db()
    with pytest.raises(ValidationError):
        svc.submit_deliverable(c, c.worker)  # terminal state


def test_confirm_cancel_needs_the_counterpart(fund_wallet):
    c = make_active_contract(fund_wallet)
    svc.request_cancel(c, c.employer, reason="تغيّر النطاق")
    c.refresh_from_db()
    with pytest.raises(PermissionDenied):
        svc.confirm_cancel(c, c.employer)  # same party can't confirm their own request


def test_cancel_refunds_escrow_in_full(fund_wallet):
    c = make_active_contract(fund_wallet, budget="100")
    svc.request_cancel(c, c.employer)
    svc.confirm_cancel(c, c.worker)
    c.refresh_from_db()
    assert c.status == Contract.Status.CANCELLED
    from apps.payments import services as pay
    w = pay.get_wallet(c.employer)
    w.refresh_from_db()
    assert w.available == Decimal("100")  # full refund
    assert w.escrow_held == Decimal("0")


def test_resolve_dispute_only_from_disputed(fund_wallet):
    c = make_active_contract(fund_wallet)
    with pytest.raises(ValidationError):
        svc.resolve_dispute(c, outcome="complete")  # not disputed yet


def test_fund_now_by_non_employer_is_forbidden(fund_wallet):
    c = ContractFactory(status=Contract.Status.PENDING_FUNDING)
    with pytest.raises(PermissionDenied):
        svc.fund_now(c, c.worker)
