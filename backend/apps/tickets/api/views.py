from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from ..models import Ticket, TicketType
from .serializers import (
    TicketDetailSerializer,
    TicketListSerializer,
    TicketTypeSerializer,
)


class TicketTypesView(ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = TicketTypeSerializer
    queryset = TicketType.objects.filter(is_active=True)


class MyTicketsView(ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TicketListSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        return Ticket.objects.filter(user=self.request.user).select_related("type")


class CreateTicketView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ticket_type = get_object_or_404(TicketType, pk=request.data.get("type_id"), is_active=True)
        contract = None
        if request.data.get("contract_id"):
            from django.db.models import Q

            from apps.contracts.models import Contract
            contract = get_object_or_404(
                Contract.objects.filter(Q(employer=request.user) | Q(worker=request.user)),
                pk=request.data["contract_id"],
            )
        job = None
        if request.data.get("job_id"):
            from apps.jobs.models import Job
            job = Job.objects.filter(pk=request.data["job_id"]).first()
        ticket = services.create_ticket(
            request.user, ticket_type=ticket_type,
            title=request.data.get("title", ""), message=request.data.get("message", ""),
            job=job, contract=contract, attachment_ids=request.data.get("attachment_ids") or [],
        )
        return Response(TicketDetailSerializer(ticket).data, status=201)


class TicketDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        ticket = get_object_or_404(Ticket, pk=pk, user=request.user)
        return Response(TicketDetailSerializer(ticket).data)


class TicketReplyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        ticket = get_object_or_404(Ticket, pk=pk, user=request.user)
        services.reply(ticket, request.user, request.data.get("message", ""), is_staff=False)
        ticket.refresh_from_db()
        return Response(TicketDetailSerializer(ticket).data, status=201)
