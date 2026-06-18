from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from apps.core.admin_export import ExportCsvMixin

from .models import InvoiceLine, InvoiceRequest


class InvoiceLineInline(TabularInline):
    model = InvoiceLine
    extra = 0
    readonly_fields = ("contract", "description", "amount")
    can_delete = False


@admin.register(InvoiceRequest)
class InvoiceAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("number", "worker", "employer", "period_type", "total", "status", "created_at")
    list_filter = ("status", "period_type")
    search_fields = ("number", "worker__email", "employer__email")
    readonly_fields = [f.name for f in InvoiceRequest._meta.fields]
    export_fields = ("number", "worker", "employer", "period_type", "total", "status", "created_at")
    inlines = [InvoiceLineInline]
    actions = ["export_as_csv"]

    def has_add_permission(self, request):
        return False
