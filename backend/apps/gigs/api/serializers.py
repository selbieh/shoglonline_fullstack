from django.urls import reverse
from rest_framework import serializers

from ..models import BuyingRequest, Service, ServiceAddon


def _cover_url(service, request) -> str:
    """The cover's browser-usable URL: an uploaded cover resolves to the PUBLIC inline
    service-cover-media endpoint; otherwise the pasted cover_image URL is returned as-is."""
    if service.cover_attachment_id:
        path = reverse("service-cover-media", args=[service.cover_attachment_id])
        return request.build_absolute_uri(path) if request else path
    return service.cover_image


class AddonSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceAddon
        fields = ["id", "title", "price", "extra_days"]


class ServiceListSerializer(serializers.ModelSerializer):
    worker_name = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name_ar", read_only=True)
    category_slug = serializers.CharField(source="category.slug", read_only=True)
    cover_image = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = ["id", "title", "slug", "description", "base_price", "delivery_days", "cover_image",
                  "category", "category_name", "category_slug", "worker_name", "favorites_count",
                  "created_at", "status"]

    def get_cover_image(self, obj) -> str:
        return _cover_url(obj, self.context.get("request"))

    def get_worker_name(self, obj) -> str:
        w = obj.worker
        return (f"{w.first_name} {w.last_name}".strip() or w.email)


class ServiceDetailSerializer(ServiceListSerializer):
    addons = AddonSerializer(many=True, read_only=True)
    is_favorite = serializers.SerializerMethodField()
    # ppt slide-21 (buyer view): the seller's rating/identity + buyer reviews + purchase/view stats.
    worker_avatar = serializers.CharField(source="worker.avatar_url", read_only=True)
    worker_rating = serializers.SerializerMethodField()
    worker_rating_count = serializers.SerializerMethodField()
    worker_verified = serializers.SerializerMethodField()
    purchases_count = serializers.SerializerMethodField()
    reviews = serializers.SerializerMethodField()

    class Meta(ServiceListSerializer.Meta):
        fields = ServiceListSerializer.Meta.fields + [
            "subcategory", "addons", "is_favorite", "worker", "keywords", "what_you_get",
            "views_count", "worker_avatar", "worker_rating", "worker_rating_count",
            "worker_verified", "purchases_count", "reviews", "meta_title", "meta_description",
        ]

    def get_is_favorite(self, obj) -> bool:
        req = self.context.get("request")
        if not req or not req.user.is_authenticated:
            return False
        return obj.favorites.filter(user=req.user).exists()

    @staticmethod
    def _wp(obj):
        return getattr(obj.worker, "worker_profile", None)

    def get_worker_rating(self, obj) -> float:
        wp = self._wp(obj)
        return float(wp.rating_avg) if wp else 0.0

    def get_worker_rating_count(self, obj) -> int:
        wp = self._wp(obj)
        return wp.rating_count if wp else 0

    def get_worker_verified(self, obj) -> bool:
        wp = self._wp(obj)
        return bool(wp.is_verified) if wp else False

    def get_purchases_count(self, obj) -> int:
        return obj.requests.filter(status=BuyingRequest.Status.ACCEPTED).count()

    def get_reviews(self, obj) -> list:
        from apps.reviews.models import Review  # noqa: PLC0415 (avoid import cycle)
        rows = Review.objects.filter(subject_id=obj.worker_id).select_related("author")[:8]
        return [{
            "id": r.id,
            "rating": r.rating,
            "comment": r.comment,
            "author_name": (f"{r.author.first_name} {r.author.last_name}".strip()
                            or r.author.email.split("@")[0]),
            "created_at": r.created_at,
        } for r in rows]


class OwnerServiceDetailSerializer(ServiceDetailSerializer):
    """Owner-only view of a service — adds the analytics the buyer must not see (slide-20)."""

    orders_count = serializers.SerializerMethodField()
    conversion = serializers.SerializerMethodField()

    class Meta(ServiceDetailSerializer.Meta):
        fields = ServiceDetailSerializer.Meta.fields + ["orders_count", "conversion", "reject_reason"]

    def get_orders_count(self, obj) -> int:
        return obj.requests.filter(status=BuyingRequest.Status.ACCEPTED).count()

    def get_conversion(self, obj) -> float:
        views = obj.views_count or 0
        if not views:
            return 0.0
        return round(self.get_orders_count(obj) / views * 100, 2)


class AddonWriteSerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)

    class Meta:
        model = ServiceAddon
        fields = ["title", "price", "extra_days"]


class ServiceWriteSerializer(serializers.ModelSerializer):
    keywords = serializers.ListField(child=serializers.CharField(max_length=40), required=False)
    addons = AddonWriteSerializer(many=True, required=False)
    base_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    # Mirror the wizard's client-side rule (≥ 1 day) so it can't be bypassed via the API,
    # and so the failure comes back field-keyed for per-input display.
    delivery_days = serializers.IntegerField(
        min_value=1, max_value=365,
        error_messages={"min_value": "أدخل مدة تسليم لا تقل عن يوم"},
    )
    # Require a real description (mirrors the wizard's client-side min) so it can't be
    # bypassed via the API; the frontend surfaces this per-field via apiFieldErrors.
    description = serializers.CharField(
        min_length=30, max_length=2500,
        error_messages={"min_length": "الوصف قصير جدًا — اكتب 30 حرفًا على الأقل"},
    )
    # Id of an image uploaded via POST /uploads to use as the cover (vs. the pasted cover_image
    # URL). Maps directly onto the cover_attachment FK column; an upload wins over a pasted URL.
    cover_attachment_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = Service
        fields = [
            "title", "description", "category", "subcategory", "base_price", "delivery_days",
            "cover_image", "cover_attachment_id", "keywords", "what_you_get", "addons",
        ]

    def validate_cover_attachment_id(self, value):
        if value in (None, ""):
            return None
        from apps.attachments.models import Attachment  # noqa: PLC0415 (avoid app import cycle)
        owner = self.context["request"].user
        exists = Attachment.objects.filter(
            pk=value, owner=owner, is_deleted=False, kind=Attachment.Kind.IMAGE,
        ).exists()
        if not exists:  # not the caller's own image → refuse (no linking someone else's file)
            raise serializers.ValidationError("صورة الغلاف غير صالحة")
        return value

    @staticmethod
    def _apply_cover(validated_data):
        # An uploaded cover supersedes a pasted URL; clear the stale URL so reads resolve the file.
        if validated_data.get("cover_attachment_id"):
            validated_data["cover_image"] = ""

    def create(self, validated_data):
        addons = validated_data.pop("addons", [])
        self._apply_cover(validated_data)
        service = super().create(validated_data)
        ServiceAddon.objects.bulk_create([ServiceAddon(service=service, **a) for a in addons])
        return service

    def update(self, instance, validated_data):
        # replace-all add-ons when provided (mirrors the profile nested-write pattern)
        addons = validated_data.pop("addons", None)
        self._apply_cover(validated_data)
        instance = super().update(instance, validated_data)
        if addons is not None:
            instance.addons.all().delete()
            ServiceAddon.objects.bulk_create([ServiceAddon(service=instance, **a) for a in addons])
        return instance

    # No hard contact-info block on public free text: a match must not fail submission (false
    # positives would block legitimate services). The soft gate lives in services.submit_service,
    # which diverts a flagged service to admin review instead of rejecting it.


class BuyingRequestSerializer(serializers.ModelSerializer):
    service_title = serializers.CharField(source="service.title", read_only=True)
    service_slug = serializers.CharField(source="service.slug", read_only=True)
    # the freelancer the request was sent to — lets the employer's "sent requests" list name the
    # recipient, and the worker's "incoming" list name the buyer.
    worker_name = serializers.SerializerMethodField()
    employer_name = serializers.SerializerMethodField()

    class Meta:
        model = BuyingRequest
        fields = ["id", "service", "service_title", "service_slug", "worker_name", "employer_name",
                  "quantity", "description", "total_price", "delivery_days", "status",
                  "reject_reason", "created_at"]
        read_only_fields = ["total_price", "delivery_days", "status", "reject_reason"]

    def get_worker_name(self, obj) -> str:
        w = obj.service.worker
        return f"{w.first_name} {w.last_name}".strip() or "المستقل"

    def get_employer_name(self, obj) -> str:
        e = obj.employer
        return f"{e.first_name} {e.last_name}".strip() or "صاحب العمل"
