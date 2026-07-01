from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from .models import BidLedger, BidPlan


@admin.register(BidPlan)
class BidPlanAdmin(ModelAdmin):
    list_display = ("name", "bids_count", "cost", "is_active")
    list_display_links = ("name",)
    list_editable = ("cost", "is_active")
    list_filter = ("is_active",)
    search_fields = ("name", "description")


@admin.register(BidLedger)
class BidLedgerAdmin(ExportCsvMixin, ModelAdmin):
    """Append-only: adjustments happen via explicit admin_adjust rows, never edits.

    Add is allowed (to post an admin_adjust entry) with editable fields; existing rows are
    immutable — no change, no delete — preserving the append-only ledger invariant.
    """

    list_display = ("user", "delta", "reason", "proposal", "plan", "created_at")
    list_filter = ("reason", "created_at")
    search_fields = ("user__email",)
    autocomplete_fields = ("user", "plan")
    raw_id_fields = ("proposal",)
    list_select_related = ("user", "proposal", "plan")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 50
    export_fields = ("id", "user", "delta", "reason", "proposal", "plan", "created_at")
    actions = ["export_as_csv"]

    def get_readonly_fields(self, request, obj=None):
        # Existing rows are frozen; the add form stays editable so operators can post adjustments.
        if obj is None:
            return ()
        return [f.name for f in BidLedger._meta.fields]

    def get_changeform_initial_data(self, request):
        return {"reason": BidLedger.Reason.ADMIN_ADJUST}

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
