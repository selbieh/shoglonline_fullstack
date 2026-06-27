from rest_framework import serializers
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

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
        # Prefer a prebuilt parent->children map (set by CategoryListView) so the whole
        # tree serializes from a single query; fall back to a DB hit when serialized
        # standalone. Without the map this recurses one query per node (N+1).
        by_parent = self.context.get("children_by_parent")
        kids = by_parent.get(obj.id, []) if by_parent is not None else obj.children.filter(is_active=True)
        return CategorySerializer(kids, many=True, context=self.context).data


class CategoryListView(ListAPIView):
    """GET /api/v1/categories — public tree (visitor browsing, SEO category pages)."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = CategorySerializer
    queryset = Category.objects.filter(parent__isnull=True, is_active=True)
    pagination_class = None

    def list(self, request, *args, **kwargs):
        # Fetch the entire active tree in ONE query, then assemble parent->children in
        # memory. Replaces the recursive per-node query in get_children (a tree-wide N+1
        # that made this endpoint ~1s) with a single round-trip. Model Meta ordering is
        # preserved because we iterate the queryset in order when bucketing children.
        active = list(Category.objects.filter(is_active=True))
        children_by_parent: dict[int, list] = {}
        for cat in active:
            if cat.parent_id is not None:
                children_by_parent.setdefault(cat.parent_id, []).append(cat)
        roots = [c for c in active if c.parent_id is None]
        serializer = self.get_serializer(
            roots, many=True, context={**self.get_serializer_context(), "children_by_parent": children_by_parent}
        )
        return Response(serializer.data)


class SkillListView(ListAPIView):
    """GET /api/v1/skills?subcategory=<id>"""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    serializer_class = SkillSerializer
    filterset_fields = ["subcategory"]
    search_fields = ["name_ar"]
    pagination_class = None  # return a bare array (mirrors CategoryListView) — consumers expect a list
    queryset = Skill.objects.filter(is_active=True)
