from rest_framework import serializers

from apps.core.contact_guard import validate_no_contact

from ..models import BuyingRequest, Service, ServiceAddon


class AddonSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceAddon
        fields = ["id", "title", "price", "extra_days"]


class ServiceListSerializer(serializers.ModelSerializer):
    worker_name = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name_ar", read_only=True)

    class Meta:
        model = Service
        fields = ["id", "title", "slug", "description", "base_price", "delivery_days", "cover_image",
                  "category", "category_name", "worker_name", "favorites_count", "created_at", "status"]

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
        fields = ServiceDetailSerializer.Meta.fields + ["orders_count", "conversion"]

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

    class Meta:
        model = Service
        fields = [
            "title", "description", "category", "subcategory", "base_price", "delivery_days",
            "cover_image", "keywords", "what_you_get", "addons",
        ]

    def create(self, validated_data):
        addons = validated_data.pop("addons", [])
        service = super().create(validated_data)
        ServiceAddon.objects.bulk_create([ServiceAddon(service=service, **a) for a in addons])
        return service

    def update(self, instance, validated_data):
        # replace-all add-ons when provided (mirrors the profile nested-write pattern)
        addons = validated_data.pop("addons", None)
        instance = super().update(instance, validated_data)
        if addons is not None:
            instance.addons.all().delete()
            ServiceAddon.objects.bulk_create([ServiceAddon(service=instance, **a) for a in addons])
        return instance

    def validate_title(self, v):
        return validate_no_contact(v)

    def validate_description(self, v):
        return validate_no_contact(v)

    def validate_what_you_get(self, v):
        return validate_no_contact(v)


class BuyingRequestSerializer(serializers.ModelSerializer):
    service_title = serializers.CharField(source="service.title", read_only=True)

    class Meta:
        model = BuyingRequest
        fields = ["id", "service", "service_title", "quantity", "description", "total_price",
                  "delivery_days", "status", "reject_reason", "created_at"]
        read_only_fields = ["total_price", "delivery_days", "status", "reject_reason"]
