"""Read-only ledger in admin (ADM-7): wallet/transaction admins forbid manual edits; balances move
only via an explicit ADJUSTMENT transaction (reason required), and the ledger invariant still holds."""
from decimal import Decimal

import pytest
from django.contrib.admin.sites import AdminSite
from django.db.models import Sum
from rest_framework.exceptions import ValidationError

from apps.core.models import AuditLog
from apps.payments import services as pay
from apps.payments.admin import TransactionAdmin, WalletAdmin
from apps.payments.models import Transaction, Wallet
from tests.factories import StaffUserFactory, UserFactory

pytestmark = [pytest.mark.security, pytest.mark.django_db]


def test_wallet_and_transaction_admins_are_readonly():
    wallet_admin = WalletAdmin(Wallet, AdminSite())
    assert wallet_admin.has_add_permission(None) is False
    assert wallet_admin.has_delete_permission(None) is False
    assert set(wallet_admin.readonly_fields) >= {"available", "escrow_held", "earnings_pending"}

    tx_admin = TransactionAdmin(Transaction, AdminSite())
    assert tx_admin.has_add_permission(None) is False
    assert tx_admin.has_change_permission(None) is False
    assert tx_admin.has_delete_permission(None) is False


def test_adjustment_moves_balance_and_keeps_invariant(fund_wallet):
    user = UserFactory()
    fund_wallet(user, "100")
    wallet = pay.get_wallet(user)

    pay.post_adjustment(wallet, bucket=Transaction.Bucket.AVAILABLE, amount=Decimal("-30"),
                        reason="تصحيح يدوي", actor=StaffUserFactory())
    wallet.refresh_from_db()
    assert wallet.available == Decimal("70")
    # invariant: balance == Σ succeeded rows for the bucket
    ledger = (Transaction.objects.filter(wallet=wallet, status=Transaction.Status.SUCCEEDED,
                                         bucket=Transaction.Bucket.AVAILABLE)
              .aggregate(s=Sum("amount"))["s"])
    assert wallet.available == ledger
    assert Transaction.objects.filter(wallet=wallet, type=Transaction.Type.ADJUSTMENT).exists()
    assert AuditLog.objects.filter(action="admin.balance_adjustment", object_id=str(wallet.pk)).exists()


def test_adjustment_requires_a_reason(fund_wallet):
    user = UserFactory()
    fund_wallet(user, "10")
    with pytest.raises(ValidationError):
        pay.post_adjustment(pay.get_wallet(user), bucket=Transaction.Bucket.AVAILABLE,
                            amount=Decimal("5"), reason="")
