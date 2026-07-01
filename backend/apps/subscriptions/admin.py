"""Category subscriptions oversight (ADM-6)."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from .models import CategorySubscription, Membership


@admin.register(CategorySubscription)
class CategorySubscriptionAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("id", "user", "category", "subcategory", "created_at")
    list_filter = ("category", "created_at")
    search_fields = ("user__email", "category__name_ar", "subcategory__name_ar")
    autocomplete_fields = ("user", "category", "subcategory")
    list_select_related = ("user", "category", "subcategory")
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = ("created_at",)
    export_fields = ("id", "user", "category", "subcategory", "created_at")
    actions = ["export_as_csv"]

    def has_add_permission(self, request):
        return False


@admin.register(Membership)
class MembershipAdmin(ExportCsvMixin, ModelAdmin):
    """Legacy WordPress plan/quota state (reference data from the migration — not live billing).
    Read-only oversight so support can look up a user's historical plan."""

    list_display = ("user", "plan_name", "duration_type", "jobs_quota", "featured_jobs_quota",
                    "has_banner", "featured_until", "created_at")
    list_filter = ("duration_type", "has_banner", "created_at")
    search_fields = ("user__email", "plan_name", "legacy_plan_id")
    autocomplete_fields = ("user",)
    list_select_related = ("user",)
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = [f.name for f in Membership._meta.fields]
    export_fields = ("id", "user", "plan_name", "legacy_plan_id", "jobs_quota", "featured_jobs_quota",
                     "duration_type", "has_banner", "featured_until", "created_at")
    actions = ["export_as_csv"]

    def has_add_permission(self, request):
        return False
