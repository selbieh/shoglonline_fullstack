from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from ..models import Invitation, Job, Proposal, WatchlistItem
from .serializers import (
    EmployerProposalSerializer,
    InvitationSerializer,
    JobCreateSerializer,
    JobDetailSerializer,
    JobListSerializer,
    ProposalCreateSerializer,
    ProposalSerializer,
)


class PublicJobListView(ListAPIView):
    """GET /jobs — public, SEO-feedable (FR-JOB-3).

    `?category=` accepts an id OR a slug and is **descendant-aware**: selecting a
    parent category returns every job under it and its subcategories. `?subcategory=`
    stays an exact match for drilling down.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = JobListSerializer
    filterset_fields = ["subcategory", "location_type"]  # category handled below (descendant-aware)
    search_fields = ["title", "description", "category__name_ar", "skills__name_ar"]
    ordering_fields = ["published_at", "budget_max", "proposals_count"]
    ordering = ["-published_at"]

    def get_queryset(self):
        from django.db.models import Q

        from apps.catalog.models import Category

        qs = (
            Job.objects.filter(status=Job.Status.PUBLISHED, is_private=False)
            .select_related("category")
            .prefetch_related("skills")
        )

        category = self.request.query_params.get("category")
        if category:
            # resolve by id or slug
            lookup = {"pk": category} if str(category).isdigit() else {"slug": category}
            cat = Category.objects.filter(**lookup).first()
            if cat:
                ids = [cat.id, *cat.children.values_list("id", flat=True)]  # self + children
                qs = qs.filter(Q(category_id__in=ids) | Q(subcategory_id__in=ids))
            else:
                qs = qs.none()

        # Single-skill filter (shared `?skill=` param with the gallery / freelancers filters): a job
        # matches when it requires that catalog skill. Matched by name so the value is interchangeable
        # across all three filters, which feed off the same `name_ar` catalog vocabulary.
        skill = self.request.query_params.get("skill")
        if skill:
            qs = qs.filter(skills__name_ar__icontains=skill)

        budget_min = self.request.query_params.get("budget_min")
        budget_max = self.request.query_params.get("budget_max")
        if budget_min:
            qs = qs.filter(budget_max__gte=budget_min)
        if budget_max:
            qs = qs.filter(budget_min__lte=budget_max)
        return qs.distinct()


class PublicJobDetailView(APIView):
    permission_classes = [AllowAny]
    # Auth stays enabled (no authentication_classes override) so the owner or an invited worker
    # can view a PRIVATE (invite-only) job; everyone else gets 404 for it.

    def get(self, request, slug):
        job = get_object_or_404(
            Job.objects.select_related("category", "employer"),
            slug=slug,
            status__in=[Job.Status.PUBLISHED, Job.Status.IN_PROGRESS, Job.Status.COMPLETED, Job.Status.CLOSED],
        )
        if job.is_private:
            user = request.user
            allowed = user.is_authenticated and (
                job.employer_id == user.id
                or Invitation.objects.filter(job=job, worker=user).exists()
            )
            if not allowed:
                raise Http404
        return Response(JobDetailSerializer(job, context={"request": request}).data)


class MyJobsView(ListCreateAPIView):
    """GET/POST /me/jobs — employer-side management (FR-JOB-1/7)."""

    def get_serializer_class(self):
        return JobCreateSerializer if self.request.method == "POST" else JobListSerializer

    def get_queryset(self):
        return Job.objects.filter(employer=self.request.user).select_related("category")

    def perform_create(self, serializer):
        job = serializer.save()
        # A private/invited hire (FR-JOB-12): record the request-to-propose before publishing so the
        # worker can apply without a bid (BR-7). _publish then notifies them once the job is live.
        if job.is_private and job.invited_worker_id:
            services.attach_invited_worker(
                job, employer=self.request.user, worker=job.invited_worker,
                message=serializer.initial_data.get("message", ""),
            )
        services.submit_for_publication(job)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(JobDetailSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)


class MyJobDetailView(RetrieveUpdateAPIView):
    """PATCH enforces BR-4: title/description locked once proposals exist."""

    serializer_class = JobCreateSerializer
    http_method_names = ["get", "patch"]

    def get_queryset(self):
        return Job.objects.filter(employer=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        return Response(JobDetailSerializer(self.get_object()).data)

    def perform_update(self, serializer):
        job = self.get_object()
        if job.is_locked:
            for field in ("title", "description"):
                if field in serializer.validated_data and serializer.validated_data[field] != getattr(job, field):
                    from rest_framework.exceptions import ValidationError

                    raise ValidationError(services.ERR["locked"])
        serializer.save()


class CloseJobView(APIView):
    def post(self, request, pk):
        job = get_object_or_404(Job, pk=pk, employer=request.user)
        if job.status not in (Job.Status.PUBLISHED, Job.Status.PENDING_REVIEW, Job.Status.DRAFT):
            from rest_framework.exceptions import ValidationError

            raise ValidationError(services.ERR["not_open"])
        services.close_job(job)
        return Response({"status": job.status})


def _job_overrides(data) -> dict:
    """Editable fields a repost/rehire may override before posting."""
    return {k: data[k] for k in ("title", "description", "budget_min", "budget_max", "message")
            if k in data and data[k] not in (None, "")}


class RepostJobView(APIView):
    """POST /me/jobs/{id}/repost {visibility, worker_id?, ...overrides} — FR-JOB-11."""

    def post(self, request, pk):
        source = get_object_or_404(Job, pk=pk, employer=request.user)
        worker = None
        if request.data.get("worker_id"):
            from apps.accounts.models import User
            worker = get_object_or_404(User, pk=request.data["worker_id"])
        job = services.repost_job(
            source, employer=request.user,
            visibility=request.data.get("visibility", "public"),
            worker=worker, overrides=_job_overrides(request.data),
        )
        return Response(JobDetailSerializer(job).data, status=status.HTTP_201_CREATED)


class RehireWorkerView(APIView):
    """POST /me/rehire {worker_id, ...overrides} — FR-JOB-12 (invited, no bid)."""

    def post(self, request):
        from apps.accounts.models import User
        worker = get_object_or_404(User, pk=request.data.get("worker_id"))
        job = services.rehire_worker(
            employer=request.user, worker=worker, overrides=_job_overrides(request.data)
        )
        return Response(JobDetailSerializer(job).data, status=status.HTTP_201_CREATED)


# ------------------------------------------------------------------ proposals
class SubmitProposalView(APIView):
    """POST /jobs/{id}/proposals (FR-JOB-5)."""

    def post(self, request, pk):
        job = get_object_or_404(Job, pk=pk)
        serializer = ProposalCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        proposal = services.submit_proposal(worker=request.user, job=job, **serializer.validated_data)
        return Response(ProposalSerializer(proposal).data, status=status.HTTP_201_CREATED)


class MyProposalsView(ListAPIView):
    serializer_class = ProposalSerializer
    filterset_fields = ["status", "job"]  # ?job={id} lets a worker check if they already applied

    def get_queryset(self):
        return Proposal.objects.filter(worker=self.request.user).select_related("job")

    def list(self, request, *args, **kwargs):
        # full per-status breakdown for the filter tabs (ppt slide-15) — independent of the
        # active status filter applied to the page.
        from django.db.models import Count

        response = super().list(request, *args, **kwargs)
        counts = dict(
            Proposal.objects.filter(worker=request.user)
            .values("status").order_by().annotate(n=Count("id"))
            .values_list("status", "n")
        )
        counts["all"] = sum(counts.values())
        if isinstance(response.data, dict):
            response.data["status_counts"] = counts
        return response


class CancelProposalView(APIView):
    def post(self, request, pk):
        proposal = get_object_or_404(Proposal, pk=pk, worker=request.user)
        services.cancel_proposal(proposal)
        return Response({"status": proposal.status})


class JobProposalsView(ListAPIView):
    """GET /jobs/{id}/proposals — employer only; listing marks them viewed (FR-JOB-8)."""

    serializer_class = EmployerProposalSerializer
    ordering_fields = ["created_at", "budget", "delivery_days", "employer_private_rating"]

    def get_queryset(self):
        job = get_object_or_404(Job, pk=self.kwargs["pk"], employer=self.request.user)
        qs = job.proposals.exclude(status=Proposal.Status.PENDING_APPROVAL).select_related("worker", "job")
        for proposal in qs:
            services.mark_viewed(proposal)
        return qs


class RateProposalView(APIView):
    """Private 1–5 stars — only the employer ever sees it (BR-8)."""

    def post(self, request, pk):
        proposal = get_object_or_404(Proposal, pk=pk, job__employer=request.user)
        from rest_framework.exceptions import ValidationError
        try:
            rating = int(request.data.get("rating", 0))
        except (TypeError, ValueError):
            rating = 0
        if not 1 <= rating <= 5:
            # field-keyed so the frontend can mark the rating stars (not just a banner)
            raise ValidationError({"rating": "التقييم يجب أن يكون بين 1 و5"})
        proposal.employer_private_rating = rating
        proposal.save(update_fields=["employer_private_rating"])
        return Response({"rating": rating})


class AcceptProposalView(APIView):
    def post(self, request, pk):
        proposal = get_object_or_404(Proposal, pk=pk, job__employer=request.user)
        contract = services.accept_proposal(proposal)
        proposal.refresh_from_db()
        data = EmployerProposalSerializer(proposal).data
        data["contract"] = {
            "id": contract.id,
            "status": contract.status,
            "budget": contract.budget,
            "funding_deadline": contract.funding_deadline,
        }
        return Response(data)


class RejectProposalView(APIView):
    def post(self, request, pk):
        proposal = get_object_or_404(Proposal, pk=pk, job__employer=request.user)
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"reason": "السبب إلزامي"})  # FR-JOB-9 (field-keyed)
        services.reject_proposal(proposal, reason)
        return Response(EmployerProposalSerializer(proposal).data)


# ------------------------------------------------------------------ invitations
class InviteWorkerView(APIView):
    def post(self, request, pk):
        job = get_object_or_404(Job, pk=pk, employer=request.user)
        from apps.accounts.models import User

        worker = get_object_or_404(User, pk=request.data.get("worker_id"))
        invitation = services.invite_worker(
            employer=request.user, job=job, worker=worker, message=request.data.get("message", "")
        )
        return Response(InvitationSerializer(invitation).data, status=201)


class MyInvitationsView(ListAPIView):
    """GET /me/invitations — invitations the worker RECEIVED."""

    serializer_class = InvitationSerializer

    def get_queryset(self):
        # explicit ordering so pagination is stable (avoids UnorderedObjectListWarning)
        return (Invitation.objects.filter(worker=self.request.user)
                .select_related("job", "employer", "worker").order_by("-id"))


class SentInvitationsView(ListAPIView):
    """GET /me/sent-invitations — invitations the employer SENT (mirror of the gigs sent/received
    split so a work owner can track every hire request they made)."""

    serializer_class = InvitationSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        return (Invitation.objects.filter(employer=self.request.user)
                .select_related("job", "employer", "worker").order_by("-id"))


class RejectInvitationView(APIView):
    def post(self, request, pk):
        invitation = get_object_or_404(Invitation, pk=pk, worker=request.user, status=Invitation.Status.SENT)
        services.reject_invitation(invitation, request.data.get("reason", ""))
        return Response({"status": invitation.status})


# ------------------------------------------------------------------ watchlist
class WatchlistView(APIView):
    """GET /me/watchlist · PUT/DELETE /me/watchlist/{job_id} (FR-JOB-4)."""

    def get(self, request):
        items = WatchlistItem.objects.filter(worker=request.user).select_related("job__category")
        return Response(JobListSerializer([i.job for i in items], many=True).data)

    def put(self, request, job_id=None):
        job = get_object_or_404(Job, pk=job_id, status=Job.Status.PUBLISHED)
        WatchlistItem.objects.get_or_create(worker=request.user, job=job)
        return Response(status=204)

    def delete(self, request, job_id=None):
        WatchlistItem.objects.filter(worker=request.user, job_id=job_id).delete()
        return Response(status=204)


# ------------------------------------------------------------------ permissions default
for view in [MyJobsView, MyJobDetailView, CloseJobView, SubmitProposalView, MyProposalsView,
             CancelProposalView, JobProposalsView, RateProposalView, AcceptProposalView,
             RejectProposalView, InviteWorkerView, MyInvitationsView, RejectInvitationView,
             WatchlistView, RepostJobView, RehireWorkerView]:
    view.permission_classes = [IsAuthenticated]
