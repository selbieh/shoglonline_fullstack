from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from .models import ContentPage, FAQItem, LandingCard, LandingSection


@admin.register(ContentPage)
class ContentPageAdmin(ModelAdmin):
    list_display = ("slug", "title", "is_published", "updated_at")
    list_filter = ("is_published",)
    search_fields = ("slug", "title", "body")
    prepopulated_fields = {"slug": ("title",)}


@admin.register(FAQItem)
class FAQItemAdmin(ModelAdmin):
    list_display = ("question", "category", "order", "is_published")
    list_filter = ("is_published", "category")
    search_fields = ("question", "answer")


class LandingCardInline(TabularInline):
    model = LandingCard
    extra = 1
    fields = ("order", "icon", "title", "subtitle", "link", "image_url", "is_active")


@admin.register(LandingSection)
class LandingSectionAdmin(ModelAdmin):
    """Edit the public home page without a deploy (FR-CMS-1)."""

    list_display = ("key", "kind", "heading", "is_active", "order")
    list_filter = ("kind", "is_active")
    search_fields = ("key", "heading", "subheading")
    inlines = [LandingCardInline]
