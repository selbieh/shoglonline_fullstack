from django.contrib import admin
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from .models import Review


@admin.register(Review)
class ReviewAdmin(ExportCsvMixin, ModelAdmin):
    """ADM-6: Reviews — moderate (lock/unlock), search. Reviews are created only by the
    parties to a completed contract (BR-13) — never hand-authored in admin."""

    list_display = ("id", "contract", "author", "subject", "rating", "comment_preview", "is_locked", "created_at")
    list_filter = ("rating", "is_locked", "created_at")
    search_fields = ("author__email", "subject__email", "comment")
    list_select_related = ("contract", "author", "subject")
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = ("contract", "author", "subject", "created_at", "updated_at")
    export_fields = ("id", "contract", "author", "subject", "rating", "is_locked", "created_at")
    actions = ["lock_reviews", "unlock_reviews", "export_as_csv"]

    @admin.display(description="التعليق")
    def comment_preview(self, obj):
        if not obj.comment:
            return "—"
        return obj.comment[:60] + "…" if len(obj.comment) > 60 else obj.comment

    def has_add_permission(self, request):
        return False

    @admin.action(description="🔒 Lock selected reviews")
    def lock_reviews(self, request, queryset):
        updated = queryset.update(is_locked=True)
        self.message_user(request, f"قُفل {updated} تقييم.")

    @admin.action(description="🔓 Unlock selected reviews")
    def unlock_reviews(self, request, queryset):
        updated = queryset.update(is_locked=False)
        self.message_user(request, f"أُلغي قفل {updated} تقييم.")
