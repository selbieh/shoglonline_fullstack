from rest_framework.generics import CreateAPIView
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from ..analytics import analytics_widgets, compute_kpis
from ..models import Report
from ..services import public_settings
from .serializers import ReportCreateSerializer


class PublicSettingsView(APIView):
    """GET /api/v1/settings/public — public feature flags for SSR/UI gating (BR-19)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        return Response(public_settings())


class AdminStatsView(APIView):
    """GET /api/v1/admin/stats — KPI dashboard data, staff only (ADM-2). `?widgets=1` adds the
    ADM-9 analytics widgets (top workers/employers, affiliate funnel, jobs-by-category)."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        data = compute_kpis()
        if request.query_params.get("widgets"):
            data["widgets"] = analytics_widgets()
        return Response(data)


class CreateReportView(CreateAPIView):
    """POST /api/v1/reports {kind, object_id, reason, detail?} — flag a service/job/freelancer/
    portfolio/proposal/buying-request to the admin review queue. Re-reporting an item the user
    already has open is a silent no-op (returns the existing open report)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "chat_send"
    serializer_class = ReportCreateSerializer

    def perform_create(self, serializer):
        existing = Report.objects.filter(
            reporter=self.request.user, status=Report.Status.OPEN,
            kind=serializer.validated_data["kind"], object_id=serializer.validated_data["object_id"],
        ).first()
        serializer.instance = existing or serializer.save(reporter=self.request.user)
