"""Admin Money/Disputes queues (ADM-6): contract oversight, overdue surfacing,
and the BR-22 dispute resolution picker."""
from decimal import Decimal

from django.contrib import admin
from django.utils import timezone
from unfold.admin import ModelAdmin, TabularInline

from apps.core.admin_export import ExportCsvMixin
from apps.core.models import AuditLog

from . import services
from .models import Contract, ContractEvent, Submission, UpdateRequest


class OverdueFilter(admin.SimpleListFilter):
    """Surface active contracts past their deadline (the queue's stated purpose)."""

    title = "التأخير"
    parameter_name = "overdue"

    def lookups(self, request, model_admin):
        return (("yes", "متأخر (نشط بعد الموعد)"),)

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.filter(status=Contract.Status.ACTIVE, deadline__lt=timezone.now().date())
        return queryset


class WarrantyPendingFilter(admin.SimpleListFilter):
    """Completed contracts whose warranty funds are not yet released (force-release targets)."""

    title = "الضمان"
    parameter_name = "warranty"

    def lookups(self, request, model_admin):
        return (("pending", "مكتمل — الضمان غير محرَّر"),)

    def queryset(self, request, queryset):
        if self.value() == "pending":
            return queryset.filter(status=Contract.Status.COMPLETED, funds_released=False)
        return queryset


class SubmissionInline(TabularInline):
    model = Submission
    extra = 0
    fields = ("id", "status", "notes", "reject_reason", "created_at")
    readonly_fields = fields
    can_delete = False


class UpdateRequestInline(TabularInline):
    model = UpdateRequest
    extra = 0
    fields = ("id", "status", "new_budget", "new_deadline", "requested_by", "created_at")
    readonly_fields = fields
    can_delete = False


class ContractEventInline(TabularInline):
    model = ContractEvent
    extra = 0
    fields = ("kind", "detail", "actor", "created_at")
    readonly_fields = fields
    can_delete = False


@admin.register(Contract)
class ContractAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("id", "title", "employer", "worker", "budget", "status",
                    "deadline", "is_overdue", "warranty_ends_at")
    list_filter = (OverdueFilter, WarrantyPendingFilter, "status", "funds_released", "created_at")
    search_fields = ("title", "employer__email", "worker__email", "dispute_ticket_ref")
    list_select_related = ("employer", "worker", "job", "service")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in Contract._meta.fields]
    export_fields = ("id", "title", "employer", "worker", "budget", "commission_amount",
                     "worker_earning", "status", "deadline", "completed_at", "created_at")
    inlines = [SubmissionInline, UpdateRequestInline, ContractEventInline]
    actions = ["dispute_complete", "dispute_cancel_refund", "dispute_split_50",
               "dispute_resume", "force_release_warranty", "export_as_csv"]

    @admin.display(boolean=True, description="Overdue")
    def is_overdue(self, obj) -> bool:
        return bool(
            obj.deadline and obj.status in (Contract.Status.ACTIVE,)
            and obj.deadline < timezone.now().date()
        )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    # ---- BR-22 dispute outcomes (only act on Disputed contracts) ----
    def _resolve(self, request, queryset, outcome, refund_pct=Decimal("0"), label=""):
        done = 0
        for contract in queryset.filter(status=Contract.Status.DISPUTED):
            services.resolve_dispute(contract, outcome=outcome, refund_pct=refund_pct,
                                     actor=request.user, note=label)
            AuditLog.objects.create(actor=request.user, action=f"admin.dispute_{outcome}",
                                    model="Contract", object_id=str(contract.pk))
            done += 1
        self.message_user(request, f"عولجت {done} نزاعات: {label or outcome}")

    @admin.action(description="✅ Dispute: complete & pay worker in full")
    def dispute_complete(self, request, queryset):
        self._resolve(request, queryset, "complete", label="إكمال العقد بدفع كامل")

    @admin.action(description="↩️ Dispute: cancel & full refund to employer")
    def dispute_cancel_refund(self, request, queryset):
        self._resolve(request, queryset, "cancel", label="إلغاء واسترداد كامل")

    # Literal % must be escaped — Django runs `description % model_format_dict(opts)`.
    @admin.action(description="⚖️ Dispute: 50%% refund / 50%% payout split")
    def dispute_split_50(self, request, queryset):
        self._resolve(request, queryset, "split", refund_pct=Decimal("50"), label="تقسيم 50/50")

    @admin.action(description="🔄 Dispute: resume contract")
    def dispute_resume(self, request, queryset):
        self._resolve(request, queryset, "resume", label="استئناف العقد")

    @admin.action(description="⏱️ Release warranty manually (emergency)")
    def force_release_warranty(self, request, queryset):
        done = 0
        for contract in queryset.filter(status=Contract.Status.COMPLETED, funds_released=False):
            services.release_warranty(contract)
            AuditLog.objects.create(actor=request.user, action="admin.force_release_warranty",
                                    model="Contract", object_id=str(contract.pk))
            done += 1
        self.message_user(request, f"حُرّر الضمان لـ {done} عقد")


@admin.register(Submission)
class SubmissionAdmin(ModelAdmin):
    list_display = ("id", "contract", "status", "created_at", "decided_at")
    list_filter = ("status", "created_at")
    search_fields = ("contract__title",)
    list_select_related = ("contract",)
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in Submission._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(UpdateRequest)
class UpdateRequestAdmin(ModelAdmin):
    list_display = ("id", "contract", "status", "new_budget", "new_deadline", "requested_by", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("contract__title", "requested_by__email")
    list_select_related = ("contract", "requested_by")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in UpdateRequest._meta.fields]

    def has_add_permission(self, request):
        return False
