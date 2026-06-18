"""AC-1b: one account simultaneously runs an employer-side AND a worker-side contract; the
three buckets stay correct for that account and self-dealing is rejected throughout."""
from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.contracts import services as svc
from apps.contracts.models import Contract
from apps.payments import services as pay
from tests.factories import ContractFactory, UserFactory

pytestmark = [pytest.mark.regression, pytest.mark.django_db, pytest.mark.srs("AC-1b")]


def _make_active(employer, worker, budget, fund_wallet, pct=Decimal("10")):
    commission, earning = svc.compute_commission(Decimal(budget), pct)
    c = ContractFactory(
        employer=employer, worker=worker, budget=Decimal(budget),
        commission_pct=pct, commission_amount=commission, worker_earning=earning,
    )
    fund_wallet(employer, str(budget))
    return svc.try_fund(c)


def test_one_account_as_employer_and_worker_keeps_buckets_correct(fund_wallet):
    dual = UserFactory()              # the dual-role account
    contractor = UserFactory()        # works for `dual`
    client = UserFactory()            # hires `dual`

    # (A) dual is the EMPLOYER hiring `contractor` for 100
    a = _make_active(dual, contractor, "100", fund_wallet)
    # (B) dual is the WORKER hired by `client` for 200
    b = _make_active(client, dual, "200", fund_wallet)

    w = pay.get_wallet(dual)
    w.refresh_from_db()
    assert w.escrow_held == Decimal("100")   # the 100 it funded as employer is held
    assert w.earnings_pending == Decimal("0")

    # complete contract B → dual earns (200 − 10% = 180) into earnings_pending
    sub_b = svc.submit_deliverable(b, dual)
    svc.accept_submission(sub_b, client)
    w.refresh_from_db()
    assert w.earnings_pending == Decimal("180")
    assert w.escrow_held == Decimal("100")   # employer-side hold untouched

    # complete contract A → contractor earns; dual's escrow clears
    sub_a = svc.submit_deliverable(a, contractor)
    svc.accept_submission(sub_a, dual)
    w.refresh_from_db()
    assert w.escrow_held == Decimal("0")
    assert w.earnings_pending == Decimal("180")  # still its own earnings


def test_self_dealing_contract_is_rejected_by_db_constraint():
    u = UserFactory()
    with pytest.raises(IntegrityError):
        ContractFactory(employer=u, worker=u, status=Contract.Status.PENDING_FUNDING)
