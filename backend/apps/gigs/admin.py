"""Special Services + Buying Requests moderation (ADM-6)."""
from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from apps.core.models import AuditLog

from . import services
from .models import BuyingRequest, Service, ServiceAddon


class AddonInline(TabularInline):
    model = ServiceAddon
    extra = 0


@admin.register(Service)
class ServiceAdmin(ModelAdmin):
    list_display = ("id", "title", "worker", "category", "base_price", "status", "favorites_count")
    list_filter = ("status", "category")
    search_fields = ("title", "worker__email", "description")
    inlines = [AddonInline]
    actions = ["approve_services", "reject_services"]

    @admin.action(description="✅ Approve & publish services")
    def approve_services(self, request, queryset):
        for service in queryset.filter(status=Service.Status.PENDING_REVIEW):
            services.approve_service(service)
            AuditLog.objects.create(actor=request.user, action="admin.service_approved",
                                    model="Service", object_id=str(service.pk))

    @admin.action(description="❌ Reject services")
    def reject_services(self, request, queryset):
        for service in queryset.filter(status=Service.Status.PENDING_REVIEW):
            service.status = Service.Status.REJECTED
            service.reject_reason = "مخالفة معايير النشر"
            service.save(update_fields=["status", "reject_reason"])
            AuditLog.objects.create(actor=request.user, action="admin.service_rejected",
                                    model="Service", object_id=str(service.pk))


@admin.register(BuyingRequest)
class BuyingRequestAdmin(ModelAdmin):
    list_display = ("id", "service", "employer", "quantity", "total_price", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("service__title", "employer__email")
    readonly_fields = [f.name for f in BuyingRequest._meta.fields]

    def has_add_permission(self, request):
        return False
