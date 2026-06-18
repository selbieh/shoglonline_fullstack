"""Category subscriptions oversight (ADM-6)."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import CategorySubscription


@admin.register(CategorySubscription)
class CategorySubscriptionAdmin(ModelAdmin):
    list_display = ("id", "user", "category", "subcategory", "created_at")
    list_filter = ("category",)
    search_fields = ("user__email", "category__name_ar")
    readonly_fields = ("created_at",)

    def has_add_permission(self, request):
        return False
