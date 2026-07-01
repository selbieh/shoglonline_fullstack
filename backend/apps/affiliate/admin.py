"""Affiliate Commission Types + Users' Commissions (ADM-6, FR-AFF-4)."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from . import services
from .models import AffiliateClick, AffiliateCommission, AffiliateProfile, CommissionRule, Referral


@admin.register(AffiliateClick)
class AffiliateClickAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("id", "referrer", "slug", "referred_user", "converted", "ip", "created_at")
    list_filter = ("created_at",)
    search_fields = ("referrer__email", "referred_user__email", "slug", "ip")
    list_select_related = ("referrer", "referred_user")
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = [f.name for f in AffiliateClick._meta.fields]
    export_fields = ("id", "referrer", "slug", "ip", "referred_user", "created_at")
    actions = ["export_as_csv"]

    @admin.display(description="حوّل؟", boolean=True)
    def converted(self, obj):
        return obj.referred_user_id is not None

    def has_add_permission(self, request):
        return False


@admin.register(CommissionRule)
class CommissionRuleAdmin(ModelAdmin):
    list_display = ("applies_to", "min_amount", "max_amount", "rate_pct", "is_active")
    list_display_links = ("applies_to",)
    list_editable = ("rate_pct", "is_active")
    list_filter = ("applies_to", "is_active")


@admin.register(AffiliateProfile)
class AffiliateProfileAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("slug", "user", "is_frozen", "total_earned", "created_at")
    list_filter = ("is_frozen", "created_at")
    search_fields = ("slug", "user__email")
    autocomplete_fields = ("user",)
    list_select_related = ("user",)
    date_hierarchy = "created_at"
    ordering = ("-total_earned",)
    readonly_fields = ("total_earned", "created_at")
    export_fields = ("id", "slug", "user", "is_frozen", "total_earned", "created_at")
    actions = ["freeze", "activate", "export_as_csv"]

    @admin.action(description="❄️ Freeze participation")
    def freeze(self, request, queryset):
        for p in queryset:
            services.set_frozen(p.user, True)

    @admin.action(description="✅ Activate participation")
    def activate(self, request, queryset):
        for p in queryset:
            services.set_frozen(p.user, False)


@admin.register(AffiliateCommission)
class AffiliateCommissionAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("id", "referrer", "referred_user", "contract", "amount", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("referrer__email", "referred_user__email")
    list_select_related = ("referrer", "referred_user", "contract")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in AffiliateCommission._meta.fields]
    export_fields = ("id", "referrer", "referred_user", "contract", "base_amount", "rate_pct",
                     "amount", "status", "created_at")
    actions = ["do_clawback", "export_as_csv"]

    @admin.action(description="↩️ Claw back commission")
    def do_clawback(self, request, queryset):
        for c in queryset.filter(status=AffiliateCommission.Status.ACCRUED):
            services.clawback(c)


@admin.register(Referral)
class ReferralAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("referrer", "referred_user", "earning_window_end", "created_at")
    list_filter = ("earning_window_end", "created_at")
    search_fields = ("referrer__email", "referred_user__email")
    autocomplete_fields = ("referrer", "referred_user")
    list_select_related = ("referrer", "referred_user")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    readonly_fields = ("created_at",)
    export_fields = ("id", "referrer", "referred_user", "earning_window_end", "created_at")
    actions = ["export_as_csv"]
