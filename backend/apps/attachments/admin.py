"""Attachment oversight (ADM-6): read-only; spot orphans (unlinked) and soft-deleted files."""
from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Attachment


@admin.register(Attachment)
class AttachmentAdmin(ModelAdmin):
    list_display = ("id", "owner", "original_name", "kind", "content_type", "size",
                    "host_type", "is_deleted", "created_at")
    list_filter = ("kind", "is_deleted", "host_type")
    search_fields = ("owner__email", "original_name")
    readonly_fields = [f.name for f in Attachment._meta.fields]

    def has_add_permission(self, request):
        return False
