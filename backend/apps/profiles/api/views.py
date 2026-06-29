import django_filters
from django.db.models import Count, F, Q, TextField
from django.db.models.functions import Cast
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.generics import (
    DestroyAPIView,
    ListAPIView,
    ListCreateAPIView,
    RetrieveUpdateAPIView,
    RetrieveUpdateDestroyAPIView,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.attachments.models import Attachment
from apps.attachments.services import attach
from apps.core.services import get_setting
from apps.gigs.models import Service

from ..models import Certificate, EmployerProfile, IDVerification, PortfolioItem, WorkerProfile
from ..services import submit_id_verification, submit_profile_for_publication
from .serializers import (
    CertificateSerializer,
    EmployerProfileSerializer,
    IDVerificationSerializer,
    PortfolioItemSerializer,
    PublicPortfolioCardSerializer,
    PublicWorkerCardSerializer,
    PublicWorkerDetailSerializer,
    WorkerProfileSerializer,
)


def _worker_publicly_visible(profile: WorkerProfile) -> bool:
    """A worker (and their portfolio) is public only when online, account-active AND published
    (rule D-1). Mirrors the directory/gallery querysets so single-object gates can't drift from
    the list filters — a brand-new/draft profile is never served on any public surface."""
    return (
        profile.visibility == WorkerProfile.Visibility.ONLINE
        and profile.publish_state == WorkerProfile.PublishState.PUBLISHED
        and profile.user.status == User.Status.ACTIVE
    )


class MyWorkerProfileView(RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/me/profile — lazily creates the profile (SRS §10.1)."""

    serializer_class = WorkerProfileSerializer
    http_method_names = ["get", "patch"]

    def get_object(self) -> WorkerProfile:
        profile, _ = WorkerProfile.objects.get_or_create(user=self.request.user)
        return profile


class PublishProfileView(APIView):
    """POST /api/v1/me/profile/publish — submit the profile for publication (rule D-1).

    Gated on the admin-tunable `profiles.publish_min_completeness` threshold (default 70%; set 0
    to publish all profiles with no completeness gate); returns 400 with the percentage when not
    complete enough. A passing request goes live immediately when `profiles.auto_publish` is ON,
    otherwise it moves to PENDING_REVIEW and goes live only after an admin approves it."""

    def post(self, request):
        profile, _ = WorkerProfile.objects.get_or_create(user=request.user)
        min_pct = int(get_setting("profiles.publish_min_completeness", 70))
        if profile.completeness_pct < min_pct:
            return Response(
                {
                    "code": "profile_incomplete",
                    "message_ar": f"أكمل ملفك حتى {min_pct}٪ على الأقل قبل النشر",
                    "completeness_pct": profile.completeness_pct,
                    "required_pct": min_pct,
                },
                status=400,
            )
        submit_profile_for_publication(profile)
        return Response(WorkerProfileSerializer(profile, context={"request": request}).data)


class MyEmployerProfileView(RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/me/employer-profile — lazily created (ppt slide-26)."""

    serializer_class = EmployerProfileSerializer
    http_method_names = ["get", "patch"]

    def get_object(self) -> EmployerProfile:
        profile, _ = EmployerProfile.objects.get_or_create(user=self.request.user)
        return profile


class MyPortfolioView(ListCreateAPIView):
    """GET/POST /api/v1/me/portfolio — the owner's gallery (FR-PROF-4). On create, any uploaded
    image is linked by passing its (unlinked) attachment id(s) as `attachment_ids`."""

    serializer_class = PortfolioItemSerializer

    def get_queryset(self):
        profile, _ = WorkerProfile.objects.get_or_create(user=self.request.user)
        return profile.portfolio.all().prefetch_related("attachments")

    def perform_create(self, serializer):
        profile, _ = WorkerProfile.objects.get_or_create(user=self.request.user)
        ids = serializer.validated_data.get("attachment_ids") or []
        item = serializer.save(profile=profile)
        if ids:
            attach(ids, item, self.request.user)  # owner-only link (attachments._host_allows)


class MyPortfolioItemView(RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/me/portfolio/<id> — manage one of the owner's gallery items
    (ppt slide-24). PATCH edits the project fields (image edits handled separately)."""

    serializer_class = PortfolioItemSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_queryset(self):
        return PortfolioItem.objects.filter(profile__user=self.request.user).prefetch_related("attachments")

    def perform_update(self, serializer):
        ids = serializer.validated_data.get("attachment_ids") or []
        item = serializer.save()
        if ids:
            attach(ids, item, self.request.user)  # owner-only link (attachments._host_allows)


class PublicPortfolioItemView(APIView):
    """GET /api/v1/freelancers/portfolio/<id> — public single portfolio work (ppt slide-22).
    Served only for an online, active worker (mirrors the portfolio-media gate)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        item = get_object_or_404(
            PortfolioItem.objects.select_related("profile__user").prefetch_related("attachments"),
            pk=pk,
        )
        profile = item.profile
        if not _worker_publicly_visible(profile):
            raise Http404
        # ppt slide-22: bump the public view counter (atomic; mirror onto the instance for this response).
        PortfolioItem.objects.filter(pk=item.pk).update(views_count=F("views_count") + 1)
        item.views_count = (item.views_count or 0) + 1
        return Response(PortfolioItemSerializer(item, context={"request": request}).data)


class PortfolioGalleryFilter(django_filters.FilterSet):
    """Filters for the public works gallery: by media kind, by the owning freelancer's discipline
    (category), and by a used skill. `skill` matches the item's JSON skills list in a DB-agnostic
    way (the casted JSON text is searched, so it works on both Postgres and the SQLite test DB)."""

    media_type = django_filters.ChoiceFilter(choices=PortfolioItem.MediaType.choices)
    category = django_filters.NumberFilter(field_name="profile__main_category_id")
    skill = django_filters.CharFilter(method="filter_skill")

    class Meta:
        model = PortfolioItem
        fields = ["media_type", "category", "skill"]

    def filter_skill(self, queryset, name, value):
        return queryset.annotate(
            _skills_text=Cast("skills", output_field=TextField())
        ).filter(_skills_text__icontains=value)


class PublicPortfolioListView(ListAPIView):
    """GET /api/v1/freelancers/portfolio — public works gallery (معرض الأعمال). Every portfolio
    item from an online, active worker; each tile links to the single-work showcase (slide-22).
    Mirrors the portfolio-media / single-item visibility gate. Filterable by media_type / category
    / skill, searchable by title/description/project-type/freelancer name, and sortable by recency,
    views, or the owning freelancer's rating."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = PublicPortfolioCardSerializer
    filterset_class = PortfolioGalleryFilter
    search_fields = [
        "title", "description", "project_type",
        "profile__user__first_name", "profile__user__last_name",
    ]
    ordering_fields = ["created_at", "views_count", "profile__rating_avg"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return (
            PortfolioItem.objects.filter(
                profile__visibility=WorkerProfile.Visibility.ONLINE,
                profile__publish_state=WorkerProfile.PublishState.PUBLISHED,  # rule D-1: hide draft workers' work
                profile__user__status=User.Status.ACTIVE,
            )
            .select_related("profile__user", "profile__main_category")
            .prefetch_related("attachments")
        )


class MyCertificatesView(ListCreateAPIView):
    """GET/POST /api/v1/me/certificates — the owner's training certificates (ppt slide-06). On
    create, any uploaded file is linked by passing its (unlinked) attachment id(s)."""

    serializer_class = CertificateSerializer

    def get_queryset(self):
        profile, _ = WorkerProfile.objects.get_or_create(user=self.request.user)
        return profile.certificates.all().prefetch_related("attachments")

    def perform_create(self, serializer):
        profile, _ = WorkerProfile.objects.get_or_create(user=self.request.user)
        ids = serializer.validated_data.get("attachment_ids") or []
        item = serializer.save(profile=profile)
        if ids:
            attach(ids, item, self.request.user)  # owner-only link (attachments._host_allows)


class MyCertificateItemView(DestroyAPIView):
    """DELETE /api/v1/me/certificates/<id> — remove one of the owner's certificates."""

    def get_queryset(self):
        return Certificate.objects.filter(profile__user=self.request.user)


class PortfolioMediaView(APIView):
    """GET /api/v1/freelancers/portfolio-media/<attachment_id> — PUBLIC inline image.

    Portfolio is public by design (FR-PROF-4), so unlike the scoped /uploads/<id> download this
    serves the bytes INLINE to anyone — but ONLY when the file is hosted by a PortfolioItem of an
    online, active worker. Never serves any other attachment."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        att = get_object_or_404(Attachment, pk=pk, is_deleted=False)
        host = att.host
        if not isinstance(host, PortfolioItem):
            raise Http404
        profile = host.profile
        if not _worker_publicly_visible(profile):
            raise Http404
        response = FileResponse(att.file.open("rb"), filename=att.original_name)
        response["Content-Type"] = att.content_type  # inline (no as_attachment) → browser renders it
        return response


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
        idv = submit_id_verification(
            request.user,
            request.data.get("attachment_ids") or [],
            doc_type=request.data.get("doc_type", ""),
            consent=bool(request.data.get("consent")),
        )
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
        from apps.catalog.models import Category

        qs = (
            WorkerProfile.objects.filter(
                visibility=WorkerProfile.Visibility.ONLINE,
                publish_state=WorkerProfile.PublishState.PUBLISHED,  # rule D-1: drafts/pending are not freelancers
                user__status=User.Status.ACTIVE,
            )
            .select_related("user")
            .prefetch_related("skills__skill", "portfolio__attachments", "user__addresses")
            # «الخدمات» count for the card — published services only, counted in-query (no N+1).
            .annotate(
                services_count=Count(
                    "user__services",
                    filter=Q(user__services__status=Service.Status.LIVE),
                    distinct=True,
                )
            )
        )
        # Skill-area filter (mirrors the services discovery filter): a freelancer matches a
        # category when it's their main field / specialization OR they hold a skill in it. A
        # top-level «category» rolls up to include its subcategories; «subcategory» pins a branch.
        category = self.request.query_params.get("category")
        if category:
            lookup = {"pk": category} if str(category).isdigit() else {"slug": category}
            cat = Category.objects.filter(**lookup).first()
            if cat:
                ids = [cat.id, *cat.children.values_list("id", flat=True)]
                qs = qs.filter(
                    Q(main_category_id__in=ids)
                    | Q(specialization_id__in=ids)
                    | Q(skills__skill__subcategory_id__in=ids)
                )
            else:
                qs = qs.none()
        subcategory = self.request.query_params.get("subcategory")
        if subcategory and str(subcategory).isdigit():
            qs = qs.filter(
                Q(main_category_id=subcategory)
                | Q(specialization_id=subcategory)
                | Q(skills__skill__subcategory_id=subcategory)
            )
        return qs.distinct()


class PublicWorkerDetailView(APIView):
    """GET /api/v1/freelancers/<id> — full public profile for one freelancer."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        profile = get_object_or_404(
            WorkerProfile.objects.select_related("user").prefetch_related(
                "skills__skill", "languages", "educations", "employments",
                "portfolio__attachments", "certificates", "user__addresses",
            ),
            user_id=pk,
            visibility=WorkerProfile.Visibility.ONLINE,
            publish_state=WorkerProfile.PublishState.PUBLISHED,  # rule D-1: an unpublished profile is not public
            user__status=User.Status.ACTIVE,
        )
        return Response(
            PublicWorkerDetailSerializer(profile, context={"request": request}).data
        )
