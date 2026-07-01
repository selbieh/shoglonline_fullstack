from django.contrib import admin
from django.db.models import Count
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from .models import Category, Skill


@admin.register(Category)
class CategoryAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("icon", "name_ar", "name_en", "slug", "parent", "child_count", "skill_count", "is_active", "order")
    list_display_links = ("name_ar",)
    list_editable = ("icon", "order", "is_active")  # pick the icon from the dropdown inline
    list_filter = ("is_active", "parent")
    search_fields = ("name_ar", "name_en", "slug", "legacy_id")
    autocomplete_fields = ("parent",)
    prepopulated_fields = {"slug": ("name_ar",)}
    readonly_fields = ("legacy_id",)
    fields = ("name_ar", "name_en", "slug", "parent", "icon", "description", "is_active", "order", "legacy_id")
    export_fields = ("id", "name_ar", "name_en", "slug", "parent", "is_active", "order", "legacy_id")
    actions = ["export_as_csv"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _children=Count("children", distinct=True), _skills=Count("skills", distinct=True)
        )

    @admin.display(description="فروع", ordering="_children")
    def child_count(self, obj):
        return obj._children

    @admin.display(description="مهارات", ordering="_skills")
    def skill_count(self, obj):
        return obj._skills


@admin.register(Skill)
class SkillAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("name_ar", "slug", "subcategory", "is_active")
    list_display_links = ("name_ar",)
    list_editable = ("is_active",)
    list_filter = ("is_active", "subcategory")
    search_fields = ("name_ar", "slug", "legacy_id")
    autocomplete_fields = ("subcategory",)
    list_select_related = ("subcategory",)
    prepopulated_fields = {"slug": ("name_ar",)}
    readonly_fields = ("legacy_id",)
    export_fields = ("id", "name_ar", "slug", "subcategory", "is_active", "legacy_id")
    actions = ["export_as_csv"]
