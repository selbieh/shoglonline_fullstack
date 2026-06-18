from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import Review


@admin.register(Review)
class ReviewAdmin(ModelAdmin):
    """ADM-6: Reviews — edit/delete/search."""

    list_display = ("id", "contract", "author", "subject", "rating", "is_locked", "created_at")
    list_filter = ("rating", "is_locked")
    search_fields = ("author__email", "subject__email", "comment")
    readonly_fields = ("contract", "author", "subject", "created_at", "updated_at")
