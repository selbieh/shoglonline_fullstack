"""Contract & delivery endpoints (FR-TASK). Authorization is relationship-based
(party to the contract), never mode-based — FR-MODE-4."""
from decimal import Decimal, InvalidOperation

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from ..models import Contract, Submission, UpdateRequest
from .serializers import ContractDetailSerializer, ContractListSerializer


def _party_contract(user, pk) -> Contract:
    return get_object_or_404(Contract.objects.filter(Q(employer=user) | Q(worker=user)), pk=pk)


def _to_decimal(raw):
    try:
        return Decimal(str(raw))
    except (InvalidOperation, TypeError):
        return None


class MyContractsView(ListAPIView):
    """GET /me/contracts — both roles at once (dual-role, FR-MODE-3)."""

    permission_classes = [IsAuthenticated]
    serializer_class = ContractListSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        user = self.request.user
        qs = Contract.objects.filter(Q(employer=user) | Q(worker=user)).select_related("employer", "worker")
        role = self.request.query_params.get("role")
        if role == "employer":
            qs = qs.filter(employer=user)
        elif role == "worker":
            qs = qs.filter(worker=user)
        return qs

    def list(self, request, *args, **kwargs):
        # per-status counts for the filter tabs (ppt slide-13), scoped to the active role but
        # independent of the active status filter.
        from django.db.models import Count

        response = super().list(request, *args, **kwargs)
        user = request.user
        base = Contract.objects.filter(Q(employer=user) | Q(worker=user))
        role = request.query_params.get("role")
        if role == "employer":
            base = base.filter(employer=user)
        elif role == "worker":
            base = base.filter(worker=user)
        counts = dict(base.values("status").order_by().annotate(n=Count("id")).values_list("status", "n"))
        counts["all"] = sum(counts.values())
        if isinstance(response.data, dict):
            response.data["status_counts"] = counts
        return response


class ContractDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        contract = _party_contract(request.user, pk)
        return Response(ContractDetailSerializer(contract, context={"request": request}).data)


class FundContractView(APIView):
    """POST /contracts/{id}/fund — employer funds after charging the wallet (FR-TASK-2)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        contract = _party_contract(request.user, pk)
        services.fund_now(contract, request.user)
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data)


class SubmissionsView(APIView):
    """GET list · POST create (worker) — FR-TASK-3."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        contract = _party_contract(request.user, pk)
        services.submit_deliverable(
            contract, request.user,
            notes=request.data.get("notes", ""), files=request.data.get("files") or [],
            attachment_ids=request.data.get("attachment_ids") or [],
        )
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data, status=201)


class AcceptSubmissionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        submission = get_object_or_404(Submission, pk=pk, contract__employer=request.user)
        services.accept_submission(submission, request.user)
        contract = submission.contract
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data)


class RejectSubmissionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        submission = get_object_or_404(Submission, pk=pk, contract__employer=request.user)
        services.reject_submission(submission, request.user, request.data.get("reason", ""))
        contract = submission.contract
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data)


class UpdateRequestsView(APIView):
    """POST /contracts/{id}/update-requests (either party) — FR-TASK-5."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        contract = _party_contract(request.user, pk)
        raw_budget = request.data.get("new_budget")
        if raw_budget:
            new_budget = _to_decimal(raw_budget)
            if new_budget is None:
                raise ValidationError({"new_budget": "أدخل رقمًا صحيحًا"})
        else:
            new_budget = None
        services.request_update(
            contract, request.user,
            new_budget=new_budget,
            new_deadline=request.data.get("new_deadline") or None,
            message=request.data.get("message", ""),
        )
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data, status=201)


class RespondUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        update = get_object_or_404(
            UpdateRequest.objects.filter(Q(contract__employer=request.user) | Q(contract__worker=request.user)),
            pk=pk,
        )
        services.respond_update(
            update, request.user,
            accept=bool(request.data.get("accept")), reason=request.data.get("reason", ""),
        )
        contract = update.contract
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data)


class RequestCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        contract = _party_contract(request.user, pk)
        services.request_cancel(contract, request.user, request.data.get("reason", ""))
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data)


class ConfirmCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        contract = _party_contract(request.user, pk)
        services.confirm_cancel(contract, request.user)
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data)


class OpenDisputeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        contract = _party_contract(request.user, pk)
        services.open_dispute(contract, request.user, reason=request.data.get("reason", ""))
        contract.refresh_from_db()
        return Response(ContractDetailSerializer(contract, context={"request": request}).data)
