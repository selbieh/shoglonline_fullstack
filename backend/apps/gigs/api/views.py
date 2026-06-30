from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.attachments.models import Attachment

from .. import services
from ..models import BuyingRequest, Favorite, Service, ServiceFavorite
from .serializers import (
    BuyingRequestSerializer,
    OwnerServiceDetailSerializer,
    ServiceDetailSerializer,
    ServiceListSerializer,
    ServiceWriteSerializer,
)


class PublicServiceListView(ListAPIView):
    """GET /services — discovery, live only (FR-SVC, AC-4)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = ServiceListSerializer
    filterset_fields = ["subcategory", "worker"]  # category handled below; worker = profile services grid (slide-18)
    search_fields = ["title", "description", "category__name_ar"]
    ordering_fields = ["published_at", "base_price", "favorites_count"]
    ordering = ["-published_at"]

    def get_queryset(self):
        from django.db.models import Q

        from apps.catalog.models import Category

        qs = Service.objects.filter(status=Service.Status.LIVE).select_related("category", "worker")
        category = self.request.query_params.get("category")
        if category:
            lookup = {"pk": category} if str(category).isdigit() else {"slug": category}
            cat = Category.objects.filter(**lookup).first()
            if cat:
                ids = [cat.id, *cat.children.values_list("id", flat=True)]
                qs = qs.filter(Q(category_id__in=ids) | Q(subcategory_id__in=ids))
            else:
                qs = qs.none()
        return qs.distinct()


class PublicServiceDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, slug):
        from django.db.models import F

        service = get_object_or_404(
            Service.objects.select_related("category", "worker").prefetch_related("addons"),
            slug=slug,
            status=Service.Status.LIVE,  # never expose draft/pending/paused/archived/rejected (IDOR)
        )
        # count the visit for the owner analytics panel (ppt slide-20)
        Service.objects.filter(pk=service.pk).update(views_count=F("views_count") + 1)
        return Response(ServiceDetailSerializer(service, context={"request": request}).data)


class ServiceCoverMediaView(APIView):
    """GET /services/cover-media/<attachment_id> — PUBLIC inline service cover image.

    Mirrors the portfolio-media pattern: serves the bytes INLINE (so a plain <img> renders it
    without a bearer token), but ONLY when the attachment is the cover of a LIVE service — or the
    caller is the owning worker (their own drafts). Any other attachment/kind/host 404s, so the
    endpoint can't be used to enumerate private files."""

    permission_classes = [AllowAny]  # auth still runs (no authentication_classes override) so an
    # owner's bearer token is honoured for not-yet-live drafts.

    def get(self, request, pk):
        att = get_object_or_404(Attachment, pk=pk, is_deleted=False)
        service = Service.objects.filter(cover_attachment_id=att.pk).select_related("worker").first()
        if service is None or att.kind != Attachment.Kind.IMAGE:
            raise Http404
        is_owner = request.user.is_authenticated and service.worker_id == request.user.id
        if not is_owner and service.status != Service.Status.LIVE:
            raise Http404  # existence of an unpublished cover stays hidden from non-owners
        response = FileResponse(att.file.open("rb"), filename=att.original_name)
        response["Content-Type"] = att.content_type  # inline (no as_attachment) → browser renders it
        return response


class MyServicesView(ListCreateAPIView):
    """GET/POST /me/services — worker-side management (FR-SVC)."""

    permission_classes = [IsAuthenticated]
    filterset_fields = ["status"]

    def get_serializer_class(self):
        return ServiceWriteSerializer if self.request.method == "POST" else ServiceListSerializer

    def get_queryset(self):
        return Service.objects.filter(worker=self.request.user).select_related("category")

    def list(self, request, *args, **kwargs):
        # per-status counts for the filter tabs (ppt slide-17).
        from django.db.models import Count

        response = super().list(request, *args, **kwargs)
        counts = dict(
            Service.objects.filter(worker=request.user)
            .values("status").order_by().annotate(n=Count("id"))
            .values_list("status", "n")
        )
        counts["all"] = sum(counts.values())
        if isinstance(response.data, dict):
            response.data["status_counts"] = counts
        return response

    def perform_create(self, serializer):
        service = serializer.save(worker=self.request.user)
        services.submit_service(service)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(ServiceDetailSerializer(serializer.instance, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)


class MyServiceDetailView(RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ServiceWriteSerializer
    http_method_names = ["get", "patch"]

    def get_queryset(self):
        return Service.objects.filter(worker=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        return Response(OwnerServiceDetailSerializer(self.get_object(), context={"request": request}).data)


class ServiceActionView(APIView):
    """POST /me/services/{id}/{action} — publish | pause | resume | archive."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, action):
        service = get_object_or_404(Service, pk=pk, worker=request.user)
        if action == "publish":
            services.submit_service(service)
        elif action == "pause":
            services.set_paused(service, True)
        elif action == "resume":
            services.set_paused(service, False)
        elif action == "archive":
            services.archive_service(service)
        else:
            from apps.core.api.errors import api_error
            raise api_error("unknown_action", "إجراء غير معروف")
        return Response({"status": service.status})


class FavoritesView(APIView):
    """GET /me/favorites[?kind=service|job|freelancer|portfolio] — the saved items for one tab
    (ppt slide-43). Services use the dedicated ServiceFavorite (denormalized count); the other
    kinds come from the generic Favorite. PUT/DELETE /me/favorites/<service_id> toggles a service
    (back-compat); generic kinds toggle via GenericFavoriteView."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        kind = request.query_params.get("kind", "service")
        if kind == "service":
            favs = ServiceFavorite.objects.filter(user=request.user).select_related("service__category")
            return Response(ServiceListSerializer([f.service for f in favs], many=True,
                                                  context={"request": request}).data)

        ids = list(Favorite.objects.filter(user=request.user, kind=kind).values_list("object_id", flat=True))
        if not ids:
            return Response([])
        if kind == "job":
            from apps.jobs.api.serializers import JobListSerializer
            from apps.jobs.models import Job
            qs = Job.objects.filter(pk__in=ids).select_related("category")
            return Response(JobListSerializer(qs, many=True, context={"request": request}).data)
        if kind == "freelancer":
            from apps.profiles.api.serializers import PublicWorkerCardSerializer
            from apps.profiles.models import WorkerProfile
            qs = (WorkerProfile.objects.filter(user_id__in=ids)
                  .select_related("user").prefetch_related("skills__skill", "portfolio__attachments", "user__addresses"))
            return Response(PublicWorkerCardSerializer(qs, many=True, context={"request": request}).data)
        if kind == "portfolio":
            from apps.profiles.api.serializers import PortfolioItemSerializer
            from apps.profiles.models import PortfolioItem
            qs = PortfolioItem.objects.filter(pk__in=ids).select_related("profile").prefetch_related("attachments")
            return Response(PortfolioItemSerializer(qs, many=True, context={"request": request}).data)
        return Response([])

    def put(self, request, service_id=None):
        service = get_object_or_404(Service, pk=service_id)
        services.toggle_favorite(request.user, service, True)
        return Response(status=204)

    def delete(self, request, service_id=None):
        service = get_object_or_404(Service, pk=service_id)
        services.toggle_favorite(request.user, service, False)
        return Response(status=204)


class GenericFavoriteView(APIView):
    """PUT/DELETE /me/favorites/<kind>/<object_id> — toggle a job / freelancer / portfolio favorite."""

    permission_classes = [IsAuthenticated]
    KINDS = {"job", "freelancer", "portfolio"}

    def put(self, request, kind, object_id):
        if kind not in self.KINDS:
            return Response({"detail": "invalid kind"}, status=status.HTTP_400_BAD_REQUEST)
        Favorite.objects.get_or_create(user=request.user, kind=kind, object_id=object_id)
        return Response(status=204)

    def delete(self, request, kind, object_id):
        Favorite.objects.filter(user=request.user, kind=kind, object_id=object_id).delete()
        return Response(status=204)


class RequestServiceView(APIView):
    """POST /services/{id}/requests — employer buys (FR-SVC)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        service = get_object_or_404(Service, pk=pk)
        buying = services.request_service(
            employer=request.user, service=service,
            quantity=request.data.get("quantity", 1), description=request.data.get("description", ""),
            files=request.data.get("files") or [], addon_ids=request.data.get("addon_ids") or [],
        )
        return Response(BuyingRequestSerializer(buying).data, status=201)


class MyRequestsView(ListAPIView):
    """Employer's outgoing requests."""

    permission_classes = [IsAuthenticated]
    serializer_class = BuyingRequestSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        return (BuyingRequest.objects.filter(employer=self.request.user)
                .select_related("service__worker", "employer").order_by("-id"))


class IncomingRequestsView(ListAPIView):
    """Worker's incoming requests on their services (FR-SVC-7)."""

    permission_classes = [IsAuthenticated]
    serializer_class = BuyingRequestSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        return (BuyingRequest.objects.filter(service__worker=self.request.user)
                .select_related("service__worker", "employer").order_by("-id"))


class RequestActionView(APIView):
    """POST /requests/{id}/{action} — accept | reject (worker) · cancel (employer)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk, action):
        buying = get_object_or_404(BuyingRequest, pk=pk)
        if action == "accept":
            contract = services.accept_request(buying, request.user)
            return Response({"status": "accepted", "contract_id": contract.id, "contract_status": contract.status},
                            status=201)
        if action == "reject":
            reason = (request.data.get("reason") or "").strip()
            if not reason:
                from apps.core.api.errors import api_error
                raise api_error("reason_required", "السبب إلزامي")
            services.reject_request(buying, request.user, reason)
            return Response({"status": "rejected"})
        if action == "cancel":
            services.cancel_request(buying, request.user)
            return Response({"status": "cancelled"})
        from apps.core.api.errors import api_error
        raise api_error("unknown_action", "إجراء غير معروف")
