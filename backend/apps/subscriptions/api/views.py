from django.db import transaction
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
        # Validate the ENTIRE payload before touching the DB, and do the replace inside one
        # atomic block — otherwise an invalid item would leave the user's rows already deleted
        # (a 400 does not roll back a bare .delete()).
        validated = []
        for item in items:
            serializer = SubscriptionSerializer(data=item)
            serializer.is_valid(raise_exception=True)
            validated.append(serializer.validated_data)
        with transaction.atomic():
            CategorySubscription.objects.filter(user=request.user).delete()
            for data in validated:
                CategorySubscription.objects.get_or_create(
                    user=request.user,
                    category_id=data["category"].id,
                    subcategory=data.get("subcategory"),
                )
        return self.get(request)
