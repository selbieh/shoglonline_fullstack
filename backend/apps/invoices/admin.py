from django.contrib import admin
from django.utils.html import format_html
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
    list_display = ("number", "worker", "employer", "period_type", "period", "total", "status", "pdf_link", "created_at")
    list_filter = ("status", "period_type", "created_at")
    search_fields = ("number", "worker__email", "employer__email")
    list_select_related = ("worker", "employer")
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = [f.name for f in InvoiceRequest._meta.fields]
    export_fields = ("number", "worker", "employer", "period_type", "period_start", "period_end",
                     "total", "status", "created_at")
    inlines = [InvoiceLineInline]
    actions = ["export_as_csv"]

    @admin.display(description="الفترة")
    def period(self, obj):
        return f"{obj.period_start} → {obj.period_end}"

    @admin.display(description="PDF")
    def pdf_link(self, obj):
        if obj.pdf_url:
            return format_html('<a href="{}" target="_blank" rel="noopener">📄 PDF</a>', obj.pdf_url)
        return "—"

    def has_add_permission(self, request):
        return False
