from rest_framework import serializers
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny

from ..models import Category, Skill


class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ["id", "name_ar", "slug", "subcategory_id"]


class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name_ar", "slug", "icon", "children"]

    def get_children(self, obj):
        return CategorySerializer(obj.children.filter(is_active=True), many=True).data


class CategoryListView(ListAPIView):
    """GET /api/v1/categories — public tree (visitor browsing, SEO category pages)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = CategorySerializer
    queryset = Category.objects.filter(parent__isnull=True, is_active=True)
    pagination_class = None


class SkillListView(ListAPIView):
    """GET /api/v1/skills?subcategory=<id>"""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = SkillSerializer
    filterset_fields = ["subcategory"]
    search_fields = ["name_ar"]
    queryset = Skill.objects.filter(is_active=True)
