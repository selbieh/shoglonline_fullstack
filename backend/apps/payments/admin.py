from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin
from apps.core.models import AuditLog

from . import services
from .models import CommissionTier, PaymentMethod, Transaction, Wallet, WithdrawalRequest


@admin.register(CommissionTier)
class CommissionTierAdmin(ModelAdmin):
    """Platform-commission ranges (FR-PAY-6). Edits apply to FUTURE contracts only —
    existing contracts keep their frozen rate."""

    list_display = ("applies_to", "min_amount", "max_amount", "rate_pct", "is_active", "created_at")
    list_filter = ("applies_to", "is_active")


@admin.register(PaymentMethod)
class PaymentMethodAdmin(ModelAdmin):
    """Saved methods are token-only (no PAN). Read-only oversight."""

    list_display = ("id", "user", "type", "provider", "brand", "last4", "is_default", "created_at")
    list_filter = ("type", "provider", "is_default")
    search_fields = ("user__email", "label")
    readonly_fields = [f.name for f in PaymentMethod._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(Wallet)
class WalletAdmin(ModelAdmin):
    """Balances are ledger-derived — read-only by design (FR-PAY-9)."""

    list_display = ("__str__", "available", "escrow_held", "earnings_pending", "is_platform")
    search_fields = ("user__email",)
    readonly_fields = [f.name for f in Wallet._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Transaction)
class TransactionAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("id", "wallet", "type", "bucket", "amount", "status", "gateway_ref", "created_at")
    list_filter = ("type", "bucket", "status")
    search_fields = ("wallet__user__email", "gateway_ref", "note")
    readonly_fields = [f.name for f in Transaction._meta.fields]
    export_fields = ("id", "wallet", "type", "bucket", "amount", "status", "gateway_ref", "note", "created_at")
    actions = ["export_as_csv"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(WithdrawalRequest)
class WithdrawalAdmin(ExportCsvMixin, ModelAdmin):
    """Payout queue (FR-PAY-3/8): mark paid after sending the PayPal payout, or reject."""

    list_display = ("id", "user", "amount", "paypal_email", "status", "created_at", "processed_at")
    list_filter = ("status",)
    search_fields = ("user__email", "paypal_email")
    export_fields = ("id", "user", "amount", "paypal_email", "status", "created_at", "processed_at")
    actions = ["mark_paid", "reject_with_refund", "export_as_csv"]

    @admin.action(description="✅ Paid via PayPal")
    def mark_paid(self, request, queryset):
        for withdrawal in queryset:
            services.process_withdrawal(withdrawal, paid=True, actor=request.user)
            AuditLog.objects.create(actor=request.user, action="admin.withdrawal_paid",
                                    model="WithdrawalRequest", object_id=str(withdrawal.pk))

    @admin.action(description="❌ Reject & return funds")
    def reject_with_refund(self, request, queryset):
        for withdrawal in queryset:
            services.process_withdrawal(withdrawal, paid=False, actor=request.user,
                                        reason="رفض إداري — راجع بيانات حسابك")
            AuditLog.objects.create(actor=request.user, action="admin.withdrawal_rejected",
                                    model="WithdrawalRequest", object_id=str(withdrawal.pk))
