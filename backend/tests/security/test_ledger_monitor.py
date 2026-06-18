"""Ledger-invariant monitor (AC-13): a healthy ledger reports nothing; a seeded corruption is
detected (per-wallet balance must equal Σ succeeded ledger rows; no negative balances)."""
from decimal import Decimal

import pytest

from apps.payments import services as pay
from apps.payments.models import Wallet
from apps.payments.monitoring import check_ledger_invariants
from apps.payments.tasks import monitor_ledger_invariants
from tests.factories import UserFactory

pytestmark = [pytest.mark.security, pytest.mark.django_db]


def test_healthy_ledger_has_no_violations(fund_wallet):
    user = UserFactory()
    fund_wallet(user, "100")
    assert check_ledger_invariants() == []
    assert monitor_ledger_invariants() == 0


def test_detects_balance_mismatch(fund_wallet):
    user = UserFactory()
    fund_wallet(user, "100")
    wallet = pay.get_wallet(user)
    # corrupt the denormalized balance directly, bypassing the ledger
    Wallet.objects.filter(pk=wallet.pk).update(available=Decimal("999"))

    violations = check_ledger_invariants()
    assert any(v["kind"] == "balance_mismatch" and v["wallet_id"] == wallet.pk for v in violations)
    assert monitor_ledger_invariants() >= 1


def test_detects_negative_balance():
    user = UserFactory()
    wallet = pay.get_wallet(user)
    Wallet.objects.filter(pk=wallet.pk).update(available=Decimal("-5"))
    assert any(v["kind"] == "negative_balance" for v in check_ledger_invariants())
