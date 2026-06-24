from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin

from . import reports as report_targets
from .models import AuditLog, GlobalSetting, Report, SettingChangeLog


@admin.register(GlobalSetting)
class GlobalSettingAdmin(ModelAdmin):
    list_display = ("key", "value", "value_type", "category", "is_public", "updated_by", "updated_at")
    list_filter = ("category", "value_type", "is_public")
    search_fields = ("key", "description")
    readonly_fields = ("updated_by", "updated_at")
    list_select_related = ("updated_by",)

    def save_model(self, request, obj, form, change):
        from django.core.cache import cache

        from .services import CACHE_PREFIX

        if change:
            old = type(obj).objects.get(pk=obj.pk).value
            SettingChangeLog.objects.create(
                key=obj.key, old_value=old, new_value=obj.value, changed_by=request.user
            )
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)
        cache.delete(CACHE_PREFIX + obj.key)


@admin.register(SettingChangeLog)
class SettingChangeLogAdmin(ModelAdmin):
    list_display = ("key", "old_value", "new_value", "changed_by", "changed_at")
    list_filter = ("key",)
    search_fields = ("key",)
    date_hierarchy = "changed_at"
    list_select_related = ("changed_by",)
    readonly_fields = [f.name for f in SettingChangeLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Report)
class ReportAdmin(ModelAdmin):
    """Abuse-report review queue: open the reported item, then remove it (archive/reject/withdraw/
    cancel/delete depending on kind) or dismiss the report. Actions are audit-logged (SEC-10)."""

    list_display = ("id", "kind", "reported_item", "reporter", "reason", "status", "reviewed_by", "created_at")
    list_filter = ("kind", "status", "reason", "created_at")
    search_fields = ("object_id", "reason", "detail", "reporter__email")
    list_select_related = ("reporter", "reviewed_by")
    date_hierarchy = "created_at"
    readonly_fields = ("kind", "object_id", "reporter", "reason", "detail", "created_at",
                       "reviewed_by", "reviewed_at", "reported_item")
    actions = ["remove_item", "dismiss"]

    @admin.display(description="Reported item")
    def reported_item(self, obj):
        target = report_targets.resolve_target(obj.kind, obj.object_id)
        if target is None:
            return format_html('<span style="color:#999">محذوف / غير موجود</span>')
        url = report_targets.target_admin_url(obj.kind, target)
        label = str(target)
        return format_html('<a href="{}">{}</a>', url, label) if url else label

    @admin.action(description="🗑️ Remove reported item")
    def remove_item(self, request, queryset):
        for report in queryset.exclude(status=Report.Status.ACTIONED):
            target = report_targets.resolve_target(report.kind, report.object_id)
            if target is None:
                self.message_user(request, f"البلاغ #{report.pk}: العنصر غير موجود", level="warning")
                report.status, report.resolution = Report.Status.ACTIONED, "missing"
            else:
                label = report_targets.remove_target(report.kind, target)
                report.status, report.resolution = Report.Status.ACTIONED, "removed"
                AuditLog.objects.create(
                    actor=request.user, action="admin.report_remove", model=report.kind,
                    object_id=str(report.object_id), after={"resolution": label},
                )
                self.message_user(request, f"البلاغ #{report.pk}: {label}")
            report.reviewed_by, report.reviewed_at = request.user, timezone.now()
            report.save(update_fields=["status", "resolution", "reviewed_by", "reviewed_at"])

    @admin.action(description="✓ Dismiss report")
    def dismiss(self, request, queryset):
        for report in queryset.filter(status=Report.Status.OPEN):
            report.status, report.resolution = Report.Status.DISMISSED, "dismissed"
            report.reviewed_by, report.reviewed_at = request.user, timezone.now()
            report.save(update_fields=["status", "resolution", "reviewed_by", "reviewed_at"])
            AuditLog.objects.create(
                actor=request.user, action="admin.report_dismiss", model=report.kind,
                object_id=str(report.object_id),
            )

    def has_add_permission(self, request):
        return False


@admin.register(AuditLog)
class AuditLogAdmin(ModelAdmin):
    list_display = ("at", "actor", "action", "model", "object_id", "ip")
    list_filter = ("action", "model")
    search_fields = ("object_id", "action", "model", "ip")
    date_hierarchy = "at"
    list_select_related = ("actor",)
    readonly_fields = [f.name for f in AuditLog._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
