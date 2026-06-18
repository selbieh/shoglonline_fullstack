from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User

from ..models import IDVerification, WorkerProfile
from ..services import submit_id_verification
from .serializers import (
    IDVerificationSerializer,
    PublicWorkerCardSerializer,
    PublicWorkerDetailSerializer,
    WorkerProfileSerializer,
)


class MyWorkerProfileView(RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/me/profile — lazily creates the profile (SRS §10.1)."""

    serializer_class = WorkerProfileSerializer
    http_method_names = ["get", "patch"]

    def get_object(self) -> WorkerProfile:
        profile, _ = WorkerProfile.objects.get_or_create(user=self.request.user)
        return profile


class MyIDVerificationView(APIView):
    """GET/POST /api/v1/me/id-verification — submit the national ID (FR-PROF-6) and read status.

    The file is uploaded first via POST /uploads (Part 03); its id is passed here as
    `attachment_ids` to link it to the verification request for admin review.
    """

    def get(self, request):
        idv = IDVerification.objects.filter(user=request.user).first()
        if idv is None:
            return Response({"status": "none"})
        return Response(IDVerificationSerializer(idv).data)

    def post(self, request):
        idv = submit_id_verification(request.user, request.data.get("attachment_ids") or [])
        return Response(IDVerificationSerializer(idv).data, status=201)


class PublicWorkerListView(ListAPIView):
    """GET /api/v1/freelancers — public freelancer directory (online profiles only)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = PublicWorkerCardSerializer
    filterset_fields = ["expertise_level"]
    search_fields = [
        "bio_title",
        "overview",
        "user__first_name",
        "user__last_name",
        "skills__skill__name_ar",
    ]
    ordering_fields = ["rating_avg", "rating_count", "hourly_rate", "created_at"]
    ordering = ["-rating_avg", "-rating_count"]

    def get_queryset(self):
        return (
            WorkerProfile.objects.filter(
                visibility=WorkerProfile.Visibility.ONLINE,
                user__status=User.Status.ACTIVE,
            )
            .select_related("user")
            .prefetch_related("skills__skill")
            .distinct()
        )


class PublicWorkerDetailView(APIView):
    """GET /api/v1/freelancers/<id> — full public profile for one freelancer."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        profile = get_object_or_404(
            WorkerProfile.objects.select_related("user").prefetch_related(
                "skills__skill", "languages", "educations", "employments", "portfolio",
                "user__addresses",
            ),
            user_id=pk,
            visibility=WorkerProfile.Visibility.ONLINE,
            user__status=User.Status.ACTIVE,
        )
        return Response(PublicWorkerDetailSerializer(profile).data)
