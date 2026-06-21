"""Attachment oversight (ADM-6): read-only; spot orphans (unlinked) and soft-deleted files."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Attachment


@admin.register(Attachment)
class AttachmentAdmin(ModelAdmin):
    list_display = ("id", "owner", "original_name", "kind", "content_type", "size",
                    "host_type", "linked", "is_deleted", "created_at")
    list_filter = ("kind", "is_deleted", "host_type")
    search_fields = ("owner__email", "original_name", "content_type")
    list_select_related = ("owner", "host_type")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in Attachment._meta.fields]

    @admin.display(boolean=True, description="Linked")
    def linked(self, obj) -> bool:
        return obj.is_linked

    def has_add_permission(self, request):
        return False
