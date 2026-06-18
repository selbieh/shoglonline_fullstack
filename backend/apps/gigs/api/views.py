from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.generics import ListAPIView, ListCreateAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import services
from ..models import BuyingRequest, Service, ServiceFavorite
from .serializers import (
    BuyingRequestSerializer,
    ServiceDetailSerializer,
    ServiceListSerializer,
    ServiceWriteSerializer,
)


class PublicServiceListView(ListAPIView):
    """GET /services — discovery, live only (FR-SVC, AC-4)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = ServiceListSerializer
    filterset_fields = ["subcategory"]  # category handled below (descendant-aware, id or slug)
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
        service = get_object_or_404(
            Service.objects.select_related("category", "worker").prefetch_related("addons"),
            slug=slug,
        )
        return Response(ServiceDetailSerializer(service, context={"request": request}).data)


class MyServicesView(ListCreateAPIView):
    """GET/POST /me/services — worker-side management (FR-SVC)."""

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return ServiceWriteSerializer if self.request.method == "POST" else ServiceListSerializer

    def get_queryset(self):
        return Service.objects.filter(worker=self.request.user).select_related("category")

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
        return Response(ServiceDetailSerializer(self.get_object(), context={"request": request}).data)


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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        favs = ServiceFavorite.objects.filter(user=request.user).select_related("service__category")
        return Response(ServiceListSerializer([f.service for f in favs], many=True).data)

    def put(self, request, service_id=None):
        service = get_object_or_404(Service, pk=service_id)
        services.toggle_favorite(request.user, service, True)
        return Response(status=204)

    def delete(self, request, service_id=None):
        service = get_object_or_404(Service, pk=service_id)
        services.toggle_favorite(request.user, service, False)
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

    def get_queryset(self):
        return BuyingRequest.objects.filter(employer=self.request.user).select_related("service")


class IncomingRequestsView(ListAPIView):
    """Worker's incoming requests on their services (FR-SVC-7)."""

    permission_classes = [IsAuthenticated]
    serializer_class = BuyingRequestSerializer
    filterset_fields = ["status"]

    def get_queryset(self):
        return BuyingRequest.objects.filter(service__worker=self.request.user).select_related("service")


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
