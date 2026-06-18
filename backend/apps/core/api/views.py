from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..analytics import analytics_widgets, compute_kpis
from ..services import public_settings


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
