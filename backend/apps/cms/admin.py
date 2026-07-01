from django.contrib import admin
from django.db.models import Count
from unfold.admin import ModelAdmin, TabularInline

from apps.core.admin_export import ExportCsvMixin

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
class ContentPageAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("slug", "title", "is_published", "updated_at")
    list_display_links = ("title",)
    list_editable = ("is_published",)
    list_filter = ("is_published", "updated_at")
    search_fields = ("slug", "title", "body")
    prepopulated_fields = {"slug": ("title",)}
    date_hierarchy = "updated_at"
    readonly_fields = ("updated_at",)
    fieldsets = (
        (None, {"fields": ("slug", "title", "body", "is_published")}),
        ("SEO", {"fields": ("meta_title", "meta_description"), "classes": ("collapse",)}),
        ("معلومات", {"fields": ("updated_at",)}),
    )
    export_fields = ("id", "slug", "title", "is_published", "updated_at")
    actions = [publish_selected, unpublish_selected, "export_as_csv"]


@admin.register(FAQItem)
class FAQItemAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("question", "category", "order", "is_published")
    list_editable = ("order", "is_published")
    list_filter = ("is_published", "category")
    search_fields = ("question", "answer")
    export_fields = ("id", "question", "category", "order", "is_published")
    actions = [publish_selected, unpublish_selected, "export_as_csv"]


class LandingCardInline(TabularInline):
    model = LandingCard
    extra = 1
    fields = ("order", "icon", "title", "subtitle", "link", "image_url", "is_active")


@admin.register(LandingSection)
class LandingSectionAdmin(ModelAdmin):
    """Edit the public home page without a deploy (FR-CMS-1)."""

    list_display = ("key", "kind", "heading", "card_count", "is_active", "order")
    list_editable = ("is_active", "order")
    list_filter = ("kind", "is_active")
    search_fields = ("key", "heading", "subheading")
    inlines = [LandingCardInline]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_cards=Count("cards"))

    @admin.display(description="بطاقات", ordering="_cards")
    def card_count(self, obj):
        return obj._cards


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
        ("معلومات", {"fields": ("updated_at",)}),
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
