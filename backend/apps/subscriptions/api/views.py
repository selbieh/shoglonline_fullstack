from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import CategorySubscription


class SubscriptionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name_ar", read_only=True)

    class Meta:
        model = CategorySubscription
        fields = ["id", "category", "category_name", "subcategory"]


class MySubscriptionsView(APIView):
    """GET/PUT /me/category-subscriptions — account-level (FR-SUB-1)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        subs = CategorySubscription.objects.filter(user=request.user).select_related("category")
        return Response(SubscriptionSerializer(subs, many=True).data)

    def put(self, request):
        """Replace the full set: [{category: id, subcategory: id|null}, …]"""
        items = request.data if isinstance(request.data, list) else []
        CategorySubscription.objects.filter(user=request.user).delete()
        for item in items:
            serializer = SubscriptionSerializer(data=item)
            serializer.is_valid(raise_exception=True)
            CategorySubscription.objects.get_or_create(
                user=request.user,
                category_id=serializer.validated_data["category"].id,
                subcategory=serializer.validated_data.get("subcategory"),
            )
        return self.get(request)
