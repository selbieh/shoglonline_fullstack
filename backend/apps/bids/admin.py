from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import BidLedger, BidPlan


@admin.register(BidPlan)
class BidPlanAdmin(ModelAdmin):
    list_display = ("name", "bids_count", "cost", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "description")


@admin.register(BidLedger)
class BidLedgerAdmin(ModelAdmin):
    """Append-only: adjustments happen via explicit admin_adjust rows, never edits."""

    list_display = ("user", "delta", "reason", "proposal", "plan", "created_at")
    list_filter = ("reason", "created_at")
    search_fields = ("user__email",)
    list_select_related = ("user", "proposal", "plan")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in BidLedger._meta.fields]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
