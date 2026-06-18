"""Affiliate Commission Types + Users' Commissions (ADM-6, FR-AFF-4)."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from . import services
from .models import AffiliateClick, AffiliateCommission, AffiliateProfile, CommissionRule, Referral


@admin.register(AffiliateClick)
class AffiliateClickAdmin(ModelAdmin):
    list_display = ("id", "referrer", "slug", "referred_user", "ip", "created_at")
    search_fields = ("referrer__email", "slug")
    readonly_fields = [f.name for f in AffiliateClick._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(CommissionRule)
class CommissionRuleAdmin(ModelAdmin):
    list_display = ("applies_to", "min_amount", "max_amount", "rate_pct", "is_active")
    list_filter = ("applies_to", "is_active")


@admin.register(AffiliateProfile)
class AffiliateProfileAdmin(ModelAdmin):
    list_display = ("slug", "user", "is_frozen", "total_earned")
    search_fields = ("slug", "user__email")
    actions = ["freeze", "activate"]

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
    list_filter = ("status",)
    search_fields = ("referrer__email", "referred_user__email")
    readonly_fields = [f.name for f in AffiliateCommission._meta.fields]
    export_fields = ("id", "referrer", "referred_user", "contract", "base_amount", "rate_pct",
                     "amount", "status", "created_at")
    actions = ["do_clawback", "export_as_csv"]

    @admin.action(description="↩️ Claw back commission")
    def do_clawback(self, request, queryset):
        for c in queryset.filter(status=AffiliateCommission.Status.ACCRUED):
            services.clawback(c)


@admin.register(Referral)
class ReferralAdmin(ModelAdmin):
    list_display = ("referrer", "referred_user", "earning_window_end", "created_at")
    search_fields = ("referrer__email", "referred_user__email")
