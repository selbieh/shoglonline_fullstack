"""Category subscriptions oversight (ADM-6)."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import CategorySubscription


@admin.register(CategorySubscription)
class CategorySubscriptionAdmin(ModelAdmin):
    list_display = ("id", "user", "category", "subcategory", "created_at")
    list_filter = ("category", "created_at")
    search_fields = ("user__email", "category__name_ar", "subcategory__name_ar")
    autocomplete_fields = ("user", "category", "subcategory")
    list_select_related = ("user", "category", "subcategory")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)

    def has_add_permission(self, request):
        return False
