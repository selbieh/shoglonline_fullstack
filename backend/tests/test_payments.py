"""Phase 3 money rules: ledger invariant, idempotency, holds, double-spend (AC-5)."""
from decimal import Decimal

import pytest
from django.db.models import Sum
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bids.models import BidPlan
from apps.bids.services import bid_balance
from apps.payments import services
from apps.payments.models import Transaction, WithdrawalRequest
from apps.payments.tasks import reconcile_pending_deposits


@pytest.fixture()
def user(db):
    return User.objects.create_user(email="money@example.com")


@pytest.fixture()
def client(user):
    api_client = APIClient()
    api_client.force_authenticate(user)
    return api_client


def ledger_sum(wallet, bucket) -> Decimal:
    return (
        Transaction.objects.filter(wallet=wallet, status="succeeded", bucket=bucket)
        .aggregate(s=Sum("amount"))["s"]
        or Decimal("0")
    )


@pytest.mark.django_db
class TestDeposit:
    def test_charge_creates_pending_then_confirm_credits(self, client, user):
        res = client.post("/api/v1/wallet/charge", {"amount": "100"}, format="json")
        assert res.status_code == 201
        order_id = res.json()["order_id"]
        assert "approval_url" in res.json()

        wallet = services.get_wallet(user)
        assert wallet.available == 0  # pending ≠ credited (FR-PAY-2)
        tx = Transaction.objects.get(gateway_ref=order_id)
        assert tx.status == "pending"

        res = client.post("/api/v1/wallet/charge/confirm", {"order_id": order_id}, format="json")
        assert res.status_code == 200
        wallet.refresh_from_db()
        assert wallet.available == Decimal("100")
        assert wallet.available == ledger_sum(wallet, "available")  # invariant

    def test_confirm_reports_failed_capture(self, client, user, monkeypatch):
        """Regression: a failed PayPal capture must report 'failed', not a hard-coded 'succeeded'."""
        from apps.payments import paypal

        order_id = client.post("/api/v1/wallet/charge", {"amount": "40"}, format="json").json()["order_id"]
        monkeypatch.setattr(paypal, "capture_order", lambda _oid: False)
        res = client.post("/api/v1/wallet/charge/confirm", {"order_id": order_id}, format="json")
        assert res.status_code == 200
        assert res.json()["status"] == "failed"  # not the stale "succeeded"
        wallet = services.get_wallet(user)
        wallet.refresh_from_db()
        assert wallet.available == 0  # nothing credited
        assert Transaction.objects.get(gateway_ref=order_id).status == "failed"

    def test_confirm_is_idempotent(self, client, user):
        order_id = client.post("/api/v1/wallet/charge", {"amount": "50"}, format="json").json()["order_id"]
        for _ in range(3):  # webhook replay safety (AC-5)
            client.post("/api/v1/wallet/charge/confirm", {"order_id": order_id}, format="json")
        wallet = services.get_wallet(user)
        wallet.refresh_from_db()
        assert wallet.available == Decimal("50")
        assert Transaction.objects.filter(gateway_ref=order_id).count() == 1

    def test_reconciliation_settles_stale_pending(self, client, user):
        order_id = client.post("/api/v1/wallet/charge", {"amount": "30"}, format="json").json()["order_id"]
        Transaction.objects.filter(gateway_ref=order_id).update(
            created_at=Transaction.objects.get(gateway_ref=order_id).created_at.replace(year=2020)
        )
        assert reconcile_pending_deposits() == 1  # FR-PAY-2 sweep
        wallet = services.get_wallet(user)
        wallet.refresh_from_db()
        assert wallet.available == Decimal("30")

    def test_invalid_amount_rejected(self, client):
        assert client.post("/api/v1/wallet/charge", {"amount": "0"}, format="json").status_code == 400
        assert client.post("/api/v1/wallet/charge", {"amount": "abc"}, format="json").status_code == 400


@pytest.mark.django_db
class TestWithdrawal:
    def _fund(self, client, amount="200"):
        order_id = client.post("/api/v1/wallet/charge", {"amount": amount}, format="json").json()["order_id"]
        client.post("/api/v1/wallet/charge/confirm", {"order_id": order_id}, format="json")

    def test_request_holds_immediately(self, client, user):
        self._fund(client)
        res = client.post("/api/v1/me/withdrawals", {"amount": "150"}, format="json")
        assert res.status_code == 201
        wallet = services.get_wallet(user)
        wallet.refresh_from_db()
        assert wallet.available == Decimal("50")  # FR-PAY-3: no double-spend window

    def test_insufficient_funds_blocked(self, client, user):
        self._fund(client, "20")
        res = client.post("/api/v1/me/withdrawals", {"amount": "100"}, format="json")
        assert res.status_code == 400

    def test_below_minimum_blocked(self, client):
        self._fund(client)
        assert client.post("/api/v1/me/withdrawals", {"amount": "5"}, format="json").status_code == 400

    def test_rejection_reverses_hold(self, client, user):
        self._fund(client)
        client.post("/api/v1/me/withdrawals", {"amount": "150"}, format="json")
        withdrawal = WithdrawalRequest.objects.get()
        services.process_withdrawal(withdrawal, paid=False, reason="بيانات غير مطابقة")
        wallet = services.get_wallet(user)
        wallet.refresh_from_db()
        assert wallet.available == Decimal("200")  # restored
        assert wallet.available == ledger_sum(wallet, "available")

    def test_paid_is_final_and_idempotent(self, client, user):
        self._fund(client)
        client.post("/api/v1/me/withdrawals", {"amount": "150"}, format="json")
        withdrawal = WithdrawalRequest.objects.get()
        services.process_withdrawal(withdrawal, paid=True)
        services.process_withdrawal(withdrawal, paid=False, reason="x")  # ignored — already paid
        withdrawal.refresh_from_db()
        assert withdrawal.status == WithdrawalRequest.Status.PAID
        wallet = services.get_wallet(user)
        wallet.refresh_from_db()
        assert wallet.available == Decimal("50")

    def test_paid_sends_paypal_payout_and_records_batch(self, client, user):
        """paid=True actually invokes PayPal Payouts and stores the returned batch as gateway_ref."""
        self._fund(client)
        client.post("/api/v1/me/withdrawals", {"amount": "150"}, format="json")
        withdrawal = WithdrawalRequest.objects.get()
        services.process_withdrawal(withdrawal, paid=True)
        withdrawal.refresh_from_db()
        assert withdrawal.status == WithdrawalRequest.Status.PAID
        batch_ref = f"STUBPO-wd-{withdrawal.pk}"
        # the PayPal batch reference is persisted on BOTH the withdrawal and its ledger marker row
        assert withdrawal.gateway_ref == batch_ref
        paid_row = Transaction.objects.get(related_withdrawal=withdrawal,
                                           type=Transaction.Type.WITHDRAWAL_PAID)
        assert paid_row.gateway_ref == batch_ref and paid_row.gateway == "paypal"

    def test_payout_failure_leaves_funds_held_for_retry(self, client, user, monkeypatch):
        """A failed PayPal payout must NOT mark paid; the hold stays so the admin can retry."""
        from apps.payments import paypal
        self._fund(client)
        client.post("/api/v1/me/withdrawals", {"amount": "150"}, format="json")
        withdrawal = WithdrawalRequest.objects.get()
        def _boom(**_kw):
            raise paypal.PayPalError("payout")
        monkeypatch.setattr(paypal, "payout", _boom)
        with pytest.raises(paypal.PayPalError):
            services.process_withdrawal(withdrawal, paid=True)
        withdrawal.refresh_from_db()
        assert withdrawal.status == WithdrawalRequest.Status.REQUESTED  # not paid
        wallet = services.get_wallet(user)
        wallet.refresh_from_db()
        assert wallet.available == Decimal("50")  # 200 funded − 150 still held; payout failure didn't reverse it


@pytest.mark.django_db
class TestBidPurchase:
    def test_purchase_debits_wallet_credits_bids(self, client, user):
        plan = BidPlan.objects.create(name="الشهرية", bids_count=20, cost=Decimal("15"))
        order_id = client.post("/api/v1/wallet/charge", {"amount": "20"}, format="json").json()["order_id"]
        client.post("/api/v1/wallet/charge/confirm", {"order_id": order_id}, format="json")
        res = client.post(f"/api/v1/bid-plans/{plan.pk}/purchase", format="json")
        assert res.status_code == 200
        assert res.json()["bid_balance"] == 20  # FR-BID-3
        assert Decimal(str(res.json()["available"])) == Decimal("5")

    def test_purchase_blocked_without_funds(self, client, user):
        plan = BidPlan.objects.create(name="الشهرية", bids_count=20, cost=Decimal("15"))
        res = client.post(f"/api/v1/bid-plans/{plan.pk}/purchase", format="json")
        assert res.status_code == 400
        assert bid_balance(user) == 0


@pytest.mark.django_db
class TestWalletEndpoint:
    def test_wallet_shape(self, client):
        res = client.get("/api/v1/me/wallet")
        assert res.status_code == 200
        body = res.json()
        assert set(body) == {"currency", "available", "escrow_held", "earnings_pending"}
        assert body["currency"] == "USD"

    def test_transactions_listing(self, client):
        order_id = client.post("/api/v1/wallet/charge", {"amount": "10"}, format="json").json()["order_id"]
        client.post("/api/v1/wallet/charge/confirm", {"order_id": order_id}, format="json")
        res = client.get("/api/v1/me/transactions")
        assert res.status_code == 200
        assert res.json()["count"] == 1
        assert res.json()["results"][0]["type"] == "deposit"
