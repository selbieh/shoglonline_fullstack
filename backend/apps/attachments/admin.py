"""Attachment oversight (ADM-6): read-only; spot orphans (unlinked) and soft-deleted files."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from .models import Attachment


class OrphanFilter(admin.SimpleListFilter):
    """Spot orphans — attachments never linked to a host row (the module's stated purpose)."""

    title = "الربط"
    parameter_name = "linked"

    def lookups(self, request, model_admin):
        return (("yes", "مرتبط بمضيف"), ("no", "يتيم (غير مرتبط)"))

    def queryset(self, request, queryset):
        if self.value() == "yes":
            return queryset.filter(host_type__isnull=False)
        if self.value() == "no":
            return queryset.filter(host_type__isnull=True)
        return queryset


@admin.register(Attachment)
class AttachmentAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("id", "owner", "original_name", "kind", "content_type", "size_h",
                    "host_type", "linked", "is_deleted", "created_at")
    list_filter = ("kind", "is_deleted", "host_type", OrphanFilter, "created_at")
    search_fields = ("owner__email", "original_name", "content_type")
    list_select_related = ("owner", "host_type")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 50
    readonly_fields = [f.name for f in Attachment._meta.fields]
    export_fields = ("id", "owner", "original_name", "kind", "content_type", "size",
                     "host_type", "object_id", "is_deleted", "created_at")
    actions = ["export_as_csv"]

    @admin.display(boolean=True, description="Linked")
    def linked(self, obj) -> bool:
        return obj.is_linked

    @admin.display(description="الحجم", ordering="size")
    def size_h(self, obj):
        size = float(obj.size or 0)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024 or unit == "GB":
                return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
            size /= 1024

    def has_add_permission(self, request):
        return False
