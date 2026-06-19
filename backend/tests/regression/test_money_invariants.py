"""Randomized money-invariant property test (BR-24): after ANY sequence of contract
lifecycle operations, no cent is created or destroyed and every wallet balance still equals
the sum of its succeeded ledger rows."""
import random
from decimal import Decimal

import pytest

from apps.contracts import services as svc
from apps.contracts.models import Contract
from apps.payments.models import Transaction, Wallet
from tests.factories import ContractFactory, UserFactory

pytestmark = [pytest.mark.regression, pytest.mark.django_db, pytest.mark.srs("BR-24")]


def _make_active(employer, worker, budget, fund_wallet, pct=Decimal("10")):
    commission, earning = svc.compute_commission(budget, pct)
    c = ContractFactory(
        employer=employer, worker=worker, budget=budget,
        commission_pct=pct, commission_amount=commission, worker_earning=earning,
    )
    fund_wallet(employer, str(budget))
    return svc.try_fund(c)


def _drive(rng, c):
    """Apply one random terminal (or non-terminal) outcome; all keep money balanced."""
    outcome = rng.choice(["complete", "warranty", "cancel", "dispute_split", "dispute_cancel",
                          "delivered", "active"])
    if outcome in ("complete", "warranty"):
        sub = svc.submit_deliverable(c, c.worker)
        svc.accept_submission(sub, c.employer)
        if outcome == "complete":
            svc.release_warranty(c)
    elif outcome == "cancel":
        svc.request_cancel(c, c.employer)
        svc.confirm_cancel(c, c.worker)
    elif outcome == "dispute_split":
        svc.open_dispute(c, c.employer, reason="خلاف")
        svc.resolve_dispute(c, outcome="split", refund_pct=Decimal(str(rng.choice([0, 25, 50, 100]))))
    elif outcome == "dispute_cancel":
        svc.open_dispute(c, c.worker, reason="خلاف")
        svc.resolve_dispute(c, outcome="cancel")
    elif outcome == "delivered":
        svc.submit_deliverable(c, c.worker)
    # "active": leave the escrow held — still balanced


def _bucket_sum(wallet, bucket):
    # Sum in Python with Decimal rather than via the DB's SUM(): SQLite has no native
    # decimal type, so Django's Sum() over a DecimalField coerces through float and drifts
    # (e.g. 24.9899999999999). Postgres keeps it exact, but the repo's default `make test`
    # backend is in-memory sqlite — summing here keeps this invariant exact on every backend.
    amounts = Transaction.objects.filter(
        wallet=wallet, status=Transaction.Status.SUCCEEDED, bucket=bucket
    ).values_list("amount", flat=True)
    return sum(amounts, Decimal("0"))


@pytest.mark.parametrize("seed", [1, 7, 42, 99, 2024])
def test_no_money_created_or_destroyed(seed, fund_wallet):
    rng = random.Random(seed)
    users = [UserFactory() for _ in range(6)]

    total_deposited = Decimal("0")
    for _ in range(12):
        employer, worker = rng.sample(users, 2)  # distinct → never self-dealing
        budget = Decimal(rng.choice(["0.01", "9.99", "33.33", "100.00", "1234.56", "7.77"]))
        total_deposited += budget  # _make_active funds exactly the budget
        c = _make_active(employer, worker, budget, fund_wallet)
        if c.status == Contract.Status.ACTIVE:
            _drive(rng, c)

    # (1) every wallet's stored balance still equals its ledger sum, bucket by bucket
    for w in Wallet.objects.all():
        assert w.available == _bucket_sum(w, Transaction.Bucket.AVAILABLE)
        assert w.escrow_held == _bucket_sum(w, Transaction.Bucket.ESCROW_HELD)
        assert w.earnings_pending == _bucket_sum(w, Transaction.Bucket.EARNINGS_PENDING)

    # (2) conservation: Σ(all buckets, all wallets incl. platform) == Σ deposits
    grand_total = sum(
        (w.available + w.escrow_held + w.earnings_pending for w in Wallet.objects.all()),
        Decimal("0"),
    )
    assert grand_total == total_deposited
