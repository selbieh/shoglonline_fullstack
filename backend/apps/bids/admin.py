from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import BidLedger, BidPlan


@admin.register(BidPlan)
class BidPlanAdmin(ModelAdmin):
    list_display = ("name", "bids_count", "cost", "is_active")
    list_filter = ("is_active",)


@admin.register(BidLedger)
class BidLedgerAdmin(ModelAdmin):
    """Append-only: adjustments happen via explicit admin_adjust rows, never edits."""

    list_display = ("user", "delta", "reason", "proposal", "created_at")
    list_filter = ("reason",)
    search_fields = ("user__email",)
    readonly_fields = [f.name for f in BidLedger._meta.fields]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
