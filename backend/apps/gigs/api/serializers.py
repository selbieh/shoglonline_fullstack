from rest_framework import serializers

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

    class Meta(ServiceListSerializer.Meta):
        fields = ServiceListSerializer.Meta.fields + ["subcategory", "addons", "is_favorite", "worker"]

    def get_is_favorite(self, obj) -> bool:
        req = self.context.get("request")
        if not req or not req.user.is_authenticated:
            return False
        return obj.favorites.filter(user=req.user).exists()


class ServiceWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ["title", "description", "category", "subcategory", "base_price", "delivery_days", "cover_image"]


class BuyingRequestSerializer(serializers.ModelSerializer):
    service_title = serializers.CharField(source="service.title", read_only=True)

    class Meta:
        model = BuyingRequest
        fields = ["id", "service", "service_title", "quantity", "description", "total_price",
                  "delivery_days", "status", "reject_reason", "created_at"]
        read_only_fields = ["total_price", "delivery_days", "status", "reject_reason"]
