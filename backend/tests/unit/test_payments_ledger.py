"""Ledger core (FR-PAY-1/2/9, BR-9/24): balances are always Σ succeeded rows, posts are
idempotent under gateway replay, and pending money never counts until settled."""
from decimal import Decimal

import pytest
from django.db.models import Sum

from apps.payments import services as pay
from apps.payments.models import Transaction, Wallet
from tests.factories import UserFactory

pytestmark = [pytest.mark.unit, pytest.mark.django_db]

DEPOSIT = Transaction.Type.DEPOSIT
AVAILABLE = Transaction.Bucket.AVAILABLE
ESCROW = Transaction.Bucket.ESCROW_HELD


def _succeeded_sum(wallet, bucket):
    return (
        Transaction.objects.filter(wallet=wallet, status=Transaction.Status.SUCCEEDED, bucket=bucket)
        .aggregate(s=Sum("amount"))["s"]
        or Decimal("0")
    )


@pytest.mark.srs("FR-PAY-9")
def test_balance_equals_sum_of_succeeded_rows():
    w = pay.get_wallet(UserFactory())
    pay.post(w, type=DEPOSIT, bucket=AVAILABLE, amount=Decimal("100.00"))
    pay.post(w, type=Transaction.Type.CONTRACT_HOLD, bucket=AVAILABLE, amount=Decimal("-30.00"))
    pay.post(w, type=Transaction.Type.CONTRACT_HOLD, bucket=ESCROW, amount=Decimal("30.00"))
    w.refresh_from_db()
    assert w.available == Decimal("70.00") == _succeeded_sum(w, AVAILABLE)
    assert w.escrow_held == Decimal("30.00") == _succeeded_sum(w, ESCROW)


@pytest.mark.srs("FR-PAY-2")
def test_idempotency_key_dedupes_webhook_replay():
    w = pay.get_wallet(UserFactory())
    rows = [
        pay.post(w, type=DEPOSIT, bucket=AVAILABLE, amount=Decimal("50.00"), idempotency_key="gw-1")
        for _ in range(3)  # triple webhook replay
    ]
    assert len({r.pk for r in rows}) == 1  # same row returned each time
    assert Transaction.objects.filter(wallet=w).count() == 1
    w.refresh_from_db()
    assert w.available == Decimal("50.00")


def test_pending_rows_do_not_affect_balance_until_settled():
    w = pay.get_wallet(UserFactory())
    tx = pay.post(w, type=DEPOSIT, bucket=AVAILABLE, amount=Decimal("80.00"),
                  status=Transaction.Status.PENDING)
    w.refresh_from_db()
    assert w.available == Decimal("0")  # pending ≠ credited

    pay.settle_pending(tx, succeeded=True, gateway_ref="ok")
    w.refresh_from_db()
    assert w.available == Decimal("80.00")


def test_settle_pending_is_idempotent_and_failed_never_credits():
    w = pay.get_wallet(UserFactory())
    ok = pay.post(w, type=DEPOSIT, bucket=AVAILABLE, amount=Decimal("40.00"),
                  status=Transaction.Status.PENDING)
    pay.settle_pending(ok, succeeded=True)
    pay.settle_pending(ok, succeeded=False)  # ignored — already succeeded
    ok.refresh_from_db()
    assert ok.status == Transaction.Status.SUCCEEDED

    bad = pay.post(w, type=DEPOSIT, bucket=AVAILABLE, amount=Decimal("99.00"),
                   status=Transaction.Status.PENDING)
    pay.settle_pending(bad, succeeded=False)
    w.refresh_from_db()
    assert w.available == Decimal("40.00")  # the failed deposit never landed


def test_platform_wallet_is_a_single_shared_singleton():
    a = pay.get_platform_wallet()
    b = pay.get_platform_wallet()
    assert a.pk == b.pk
    assert a.is_platform is True
    assert Wallet.objects.filter(is_platform=True).count() == 1
