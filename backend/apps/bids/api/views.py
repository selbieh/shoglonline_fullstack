from django.db.models import Count, Sum
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import serializers
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import BidLedger, BidPlan
from ..services import bid_balance


class BidPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = BidPlan
        fields = ["id", "name", "bids_count", "cost", "description"]


class BidLedgerSerializer(serializers.ModelSerializer):
    class Meta:
        model = BidLedger
        fields = ["id", "delta", "reason", "proposal", "created_at"]


class BidPlansView(ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = BidPlanSerializer
    pagination_class = None

    def get_queryset(self):
        from apps.core.services import get_setting

        if not get_setting("bids.enabled", True):
            return BidPlan.objects.none()  # bid economy off → nothing to buy
        return BidPlan.objects.filter(is_active=True)


class MyBidsView(APIView):
    """GET /me/bids — balance + recent ledger (FR-BID-2)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        entries = BidLedger.objects.filter(user=request.user)[:30]
        return Response(
            {
                "balance": bid_balance(request.user),
                "ledger": BidLedgerSerializer(entries, many=True).data,
                # PHASE3: POST /bid-plans/{id}/purchase pays from the wallet
            }
        )


class MyBidsHistoryView(APIView):
    """GET /me/bids/history?period=current_month|current_year|all|custom&from=&to=&reason=

    Bid usage history with a per-period summary (FR-BID-2)."""

    permission_classes = [IsAuthenticated]

    _GRANT = (BidLedger.Reason.SIGNUP_GRANT, BidLedger.Reason.MONTHLY_GRANT)
    _REFUND = (BidLedger.Reason.REFUND_MODERATION, BidLedger.Reason.REFUND_JOB_CLOSED)

    def get(self, request):
        qs = BidLedger.objects.filter(user=request.user)
        period = request.query_params.get("period", "all")
        now = timezone.now()
        if period == "current_month":
            qs = qs.filter(created_at__year=now.year, created_at__month=now.month)
        elif period == "current_year":
            qs = qs.filter(created_at__year=now.year)
        elif period == "custom":
            # parse_date returns None for a malformed value, so we ignore bad input instead of
            # passing a raw string to the ORM lookup (which raises ValidationError -> 500).
            frm = parse_date(request.query_params.get("from") or "")
            to = parse_date(request.query_params.get("to") or "")
            if frm:
                qs = qs.filter(created_at__date__gte=frm)
            if to:
                qs = qs.filter(created_at__date__lte=to)
        if request.query_params.get("reason"):
            qs = qs.filter(reason=request.query_params["reason"])

        def _sum(reasons):
            return qs.filter(reason__in=reasons).aggregate(s=Sum("delta"))["s"] or 0

        by_reason = {row["reason"]: {"delta": row["delta"], "count": row["count"]}
                     for row in qs.values("reason").annotate(delta=Sum("delta"), count=Count("id"))}
        summary = {
            "granted": _sum(self._GRANT),
            "purchased": _sum((BidLedger.Reason.PURCHASE,)),
            "consumed": -(_sum((BidLedger.Reason.CONSUME,))),   # report as a positive count of bids used
            "refunded": _sum(self._REFUND),
            "net": qs.aggregate(s=Sum("delta"))["s"] or 0,
            "by_reason": by_reason,
        }
        return Response({
            "period": period,
            "balance": bid_balance(request.user),
            "summary": summary,
            "ledger": BidLedgerSerializer(qs[:200], many=True).data,
        })
