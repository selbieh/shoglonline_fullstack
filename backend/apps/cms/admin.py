from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from .models import ContentPage, FAQItem, LandingCard, LandingSection, SiteSettings


@admin.action(description="✅ Publish selected")
def publish_selected(modeladmin, request, queryset):
    updated = queryset.update(is_published=True)
    modeladmin.message_user(request, f"نُشر {updated} عنصر.")


@admin.action(description="🚫 Unpublish selected")
def unpublish_selected(modeladmin, request, queryset):
    updated = queryset.update(is_published=False)
    modeladmin.message_user(request, f"أُلغي نشر {updated} عنصر.")


@admin.register(ContentPage)
class ContentPageAdmin(ModelAdmin):
    list_display = ("slug", "title", "is_published", "updated_at")
    list_filter = ("is_published",)
    search_fields = ("slug", "title", "body")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("updated_at",)
    actions = [publish_selected, unpublish_selected]


@admin.register(FAQItem)
class FAQItemAdmin(ModelAdmin):
    list_display = ("question", "category", "order", "is_published")
    list_editable = ("order", "is_published")
    list_filter = ("is_published", "category")
    search_fields = ("question", "answer")
    actions = [publish_selected, unpublish_selected]


class LandingCardInline(TabularInline):
    model = LandingCard
    extra = 1
    fields = ("order", "icon", "title", "subtitle", "link", "image_url", "is_active")


@admin.register(LandingSection)
class LandingSectionAdmin(ModelAdmin):
    """Edit the public home page without a deploy (FR-CMS-1)."""

    list_display = ("key", "kind", "heading", "is_active", "order")
    list_editable = ("is_active", "order")
    list_filter = ("kind", "is_active")
    search_fields = ("key", "heading", "subheading")
    inlines = [LandingCardInline]


@admin.register(SiteSettings)
class SiteSettingsAdmin(ModelAdmin):
    """Footer contact / app / social links — a singleton (FR-CMS).

    Clear any field to hide that entry on the public footer.
    """

    fieldsets = (
        ("تواصل معنا", {"fields": ("contact_email", "contact_phone", "contact_address")}),
        ("تطبيقات الجوال", {"fields": ("app_store_url", "google_play_url")}),
        ("روابط التواصل الاجتماعي", {
            "fields": ("facebook_url", "twitter_url", "instagram_url", "youtube_url", "linkedin_url"),
        }),
    )
    readonly_fields = ("updated_at",)

    def has_add_permission(self, request):
        # Singleton — never more than one row; edit the existing one.
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        from django.shortcuts import redirect
        obj = SiteSettings.load()
        return redirect("admin:cms_sitesettings_change", obj.pk)
