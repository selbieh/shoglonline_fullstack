from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.bids.models import BidPlan
from apps.core.services import get_setting

from .. import paypal, services
from ..models import PaymentMethod, Transaction, WithdrawalRequest


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = ["id", "type", "bucket", "amount", "status", "gateway", "note", "created_at"]


class PaymentMethodSerializer(serializers.ModelSerializer):
    """Read-safe: the gateway_token is never exposed."""

    class Meta:
        model = PaymentMethod
        fields = ["id", "type", "provider", "brand", "last4", "label", "is_default", "created_at"]


class MyPaymentMethodsView(APIView):
    """GET list · POST add (tokenized; PANs rejected) — FR-PAY-4."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        methods = PaymentMethod.objects.filter(user=request.user)
        return Response(PaymentMethodSerializer(methods, many=True).data)

    def post(self, request):
        method = services.add_payment_method(request.user, request.data)
        return Response(PaymentMethodSerializer(method).data, status=status.HTTP_201_CREATED)


class PaymentMethodDetailView(APIView):
    """PATCH (set default / rename) · DELETE a saved method."""

    permission_classes = [IsAuthenticated]
    http_method_names = ["patch", "delete"]

    def patch(self, request, pk):
        method = get_object_or_404(PaymentMethod, pk=pk, user=request.user)
        if "label" in request.data:
            method.label = str(request.data["label"])[:80]
            method.save(update_fields=["label"])
        if request.data.get("is_default"):
            services.set_default_method(request.user, method)
        method.refresh_from_db()
        return Response(PaymentMethodSerializer(method).data)

    def delete(self, request, pk):
        method = get_object_or_404(PaymentMethod, pk=pk, user=request.user)
        method.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WithdrawalSerializer(serializers.ModelSerializer):
    class Meta:
        model = WithdrawalRequest
        fields = ["id", "amount", "paypal_email", "status", "reject_reason", "created_at", "processed_at"]


class MyWalletView(APIView):
    """GET /me/wallet — the three buckets (FR-PAY-1)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        wallet = services.get_wallet(request.user)
        return Response(
            {
                "currency": get_setting("platform.currency", "USD"),
                "available": wallet.available,
                "escrow_held": wallet.escrow_held,
                "earnings_pending": wallet.earnings_pending,
            }
        )


class MyTransactionsView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TransactionSerializer
    filterset_fields = ["type", "status"]

    def get_queryset(self):
        return Transaction.objects.filter(wallet=services.get_wallet(self.request.user))


class ChargeView(APIView):
    """POST /wallet/charge {amount} → pending tx + PayPal approval URL (FR-PAY-2)."""

    permission_classes = [IsAuthenticated]
    throttle_scope = "payments"  # money-moving — tighter than the blanket user throttle

    def post(self, request):
        try:
            amount = Decimal(str(request.data.get("amount", "0")))
        except InvalidOperation:
            amount = Decimal("0")
        if amount < services.MIN_DEPOSIT:
            from apps.core.api.errors import api_error
            raise api_error("invalid_amount", "المبلغ غير صالح")
        currency = get_setting("platform.currency", "USD")
        return_url = request.data.get("return_url") or "http://localhost:3000/wallet"
        order = paypal.create_order(str(amount), currency, return_url, return_url)
        services.post(
            services.get_wallet(request.user),
            type=Transaction.Type.DEPOSIT,
            bucket=Transaction.Bucket.AVAILABLE,
            amount=amount,
            status=Transaction.Status.PENDING,  # visible immediately (FR-PAY-2)
            gateway="paypal",
            gateway_ref=order["order_id"],
            idempotency_key=f"deposit:{order['order_id']}",
            note="شحن المحفظة عبر PayPal",
        )
        return Response(order, status=status.HTTP_201_CREATED)


class ChargeConfirmView(APIView):
    """POST /wallet/charge/confirm {order_id} — capture after buyer approval.

    Idempotent: replays return the settled row unchanged (AC-5).
    A PayPal webhook (CHECKOUT.ORDER.APPROVED) can call the same logic in production.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        order_id = (request.data.get("order_id") or "").strip()
        tx = get_object_or_404(
            Transaction,
            gateway="paypal",
            gateway_ref=order_id,
            wallet=services.get_wallet(request.user),
        )
        if tx.status == Transaction.Status.PENDING:
            captured = paypal.capture_order(order_id)
            services.settle_pending(tx, succeeded=captured)
        wallet = services.get_wallet(request.user)
        return Response({"status": tx.status if tx.status != "pending" else "succeeded",
                         "available": wallet.available})


class MyWithdrawalsView(APIView):
    """GET list · POST request — PayPal only, instant hold (FR-PAY-3)."""

    permission_classes = [IsAuthenticated]

    def get_throttles(self):
        # rate-limit the money-moving POST; reads keep the default user throttle
        if self.request.method == "POST":
            from rest_framework.throttling import ScopedRateThrottle
            self.throttle_scope = "payments"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get(self, request):
        rows = WithdrawalRequest.objects.filter(user=request.user)
        return Response(WithdrawalSerializer(rows, many=True).data)

    def post(self, request):
        try:
            amount = Decimal(str(request.data.get("amount", "0")))
        except InvalidOperation:
            amount = Decimal("0")
        email = (request.data.get("paypal_email") or request.user.email).strip()
        withdrawal = services.request_withdrawal(request.user, amount, email)
        return Response(WithdrawalSerializer(withdrawal).data, status=201)


class PurchaseBidPlanView(APIView):
    """POST /bid-plans/{id}/purchase — pays from the wallet (FR-BID-3)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        plan = get_object_or_404(BidPlan, pk=pk, is_active=True)
        services.purchase_bid_plan(request.user, plan)
        from apps.bids.services import bid_balance

        wallet = services.get_wallet(request.user)
        return Response({"bid_balance": bid_balance(request.user), "available": wallet.available})
