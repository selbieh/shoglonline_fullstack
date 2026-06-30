"""Special Services + Buying Requests moderation (ADM-6)."""
from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from apps.core.models import AuditLog

from . import services
from .models import BuyingRequest, Favorite, Service, ServiceAddon, ServiceFavorite


class AddonInline(TabularInline):
    model = ServiceAddon
    extra = 0


@admin.register(Service)
class ServiceAdmin(ModelAdmin):
    list_display = ("id", "title", "worker", "category", "base_price", "status", "favorites_count", "views_count")
    list_filter = ("status", "category", "published_at")
    search_fields = ("title", "slug", "worker__email", "description")
    autocomplete_fields = ("worker", "category", "subcategory")
    list_select_related = ("worker", "category")
    date_hierarchy = "created_at"
    readonly_fields = ("slug", "favorites_count", "views_count", "frozen_prev_status",
                       "published_at", "created_at", "updated_at")
    inlines = [AddonInline]
    actions = ["approve_services", "reject_services"]

    @admin.action(description="✅ Approve & publish services")
    def approve_services(self, request, queryset):
        from apps.notifications.services import notify
        for service in queryset.filter(status=Service.Status.PENDING_REVIEW):
            services.approve_service(service)
            notify(service.worker, kind="admin_broadcast", title="تم نشر خدمتك",
                   body=service.title, deep_link=f"/services/{service.slug}", force=True)  # always deliver
            AuditLog.objects.create(actor=request.user, action="admin.service_approved",
                                    model="Service", object_id=str(service.pk))

    @admin.action(description="❌ Reject services")
    def reject_services(self, request, queryset):
        from apps.notifications.services import notify
        for service in queryset.filter(status=Service.Status.PENDING_REVIEW):
            service.status = Service.Status.REJECTED
            service.reject_reason = "مخالفة معايير النشر"
            service.save(update_fields=["status", "reject_reason"])
            notify(service.worker, kind="admin_broadcast", title="رُفضت خدمتك",
                   body=service.reject_reason, deep_link="/me/services", force=True)  # sends the Arabic reason
            AuditLog.objects.create(actor=request.user, action="admin.service_rejected",
                                    model="Service", object_id=str(service.pk))


@admin.register(BuyingRequest)
class BuyingRequestAdmin(ModelAdmin):
    list_display = ("id", "service", "employer", "quantity", "total_price", "status", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("service__title", "employer__email")
    list_select_related = ("service", "employer")
    date_hierarchy = "created_at"
    readonly_fields = [f.name for f in BuyingRequest._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(ServiceFavorite)
class ServiceFavoriteAdmin(ModelAdmin):
    list_display = ("user", "service", "created_at")
    list_filter = ("created_at",)
    search_fields = ("user__email", "service__title")
    autocomplete_fields = ("user", "service")
    list_select_related = ("user", "service")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)


@admin.register(Favorite)
class FavoriteAdmin(ModelAdmin):
    list_display = ("user", "kind", "object_id", "created_at")
    list_filter = ("kind", "created_at")
    search_fields = ("user__email",)
    autocomplete_fields = ("user",)
    list_select_related = ("user",)
    date_hierarchy = "created_at"
    readonly_fields = ("created_at",)
