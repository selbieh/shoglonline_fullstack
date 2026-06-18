from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.core.services import get_setting

from .. import services
from ..models import InvoiceRequest
from .serializers import InvoiceSerializer


class MyInvoicesView(ListAPIView):
    """Worker's invoice requests."""

    permission_classes = [IsAuthenticated]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        return InvoiceRequest.objects.filter(worker=self.request.user).prefetch_related("lines")


class IncomingInvoicesView(ListAPIView):
    """Employer's incoming invoice requests (FR-PAY-7)."""

    permission_classes = [IsAuthenticated]
    serializer_class = InvoiceSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        return InvoiceRequest.objects.filter(employer=self.request.user).prefetch_related("lines")


class CreateInvoiceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        employer = get_object_or_404(User, pk=request.data.get("employer_id"))
        period = request.data.get("period") or get_setting("invoices.period", "month")
        invoice = services.create_invoice_request(
            worker=request.user, employer=employer, period_type=period, notes=request.data.get("notes", ""),
        )
        return Response(InvoiceSerializer(invoice).data, status=201)


class InvoiceActionView(APIView):
    """POST /invoices/{id}/{action} — confirm | reject (employer)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, action):
        invoice = get_object_or_404(InvoiceRequest, pk=pk)
        if action == "confirm":
            services.confirm_invoice(invoice, request.user)
        elif action == "reject":
            reason = (request.data.get("reason") or "").strip()
            if not reason:
                from apps.core.api.errors import api_error
                raise api_error("reason_required", "السبب إلزامي")
            services.reject_invoice(invoice, request.user, reason)
        else:
            from apps.core.api.errors import api_error
            raise api_error("unknown_action", "إجراء غير معروف")
        return Response(InvoiceSerializer(invoice).data)
