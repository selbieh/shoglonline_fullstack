from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html
from unfold.admin import ModelAdmin

from . import reports as report_targets
from .admin_export import ExportCsvMixin
from .models import AuditLog, GlobalSetting, Report, SettingChangeLog


@admin.register(GlobalSetting)
class GlobalSettingAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("key", "value", "value_type", "category", "is_public", "updated_by", "updated_at")
    list_filter = ("category", "value_type", "is_public")
    search_fields = ("key", "description")
    date_hierarchy = "updated_at"
    readonly_fields = ("updated_by", "updated_at")
    list_select_related = ("updated_by",)
    export_fields = ("id", "key", "value", "value_type", "category", "is_public", "updated_by", "updated_at")
    actions = ["export_as_csv"]

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
class SettingChangeLogAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("key", "old_value", "new_value", "changed_by", "changed_at")
    list_filter = ("key", "changed_at")
    search_fields = ("key", "changed_by__email")
    date_hierarchy = "changed_at"
    list_per_page = 50
    list_select_related = ("changed_by",)
    readonly_fields = [f.name for f in SettingChangeLog._meta.fields]
    export_fields = ("id", "key", "old_value", "new_value", "changed_by", "changed_at")
    actions = ["export_as_csv"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


REASON_LABELS = {
    "spam": "محتوى مكرر / سبام",
    "scam": "احتيال أو نصب",
    "inappropriate": "محتوى مسيء",
    "copyright": "انتهاك حقوق ملكية",
    "misleading": "معلومات مضللة",
    "other": "أخرى",
}


@admin.register(Report)
class ReportAdmin(ExportCsvMixin, ModelAdmin):
    """Abuse-report review queue: open the reported item, then remove it (archive/reject/withdraw/
    cancel/delete depending on kind) or dismiss the report. Removing an item also resolves every
    other open report on the same item and notifies its owner. Actions are audit-logged (SEC-10)."""

    list_display = ("id", "kind", "reported_item", "times_reported", "reporter", "reason_label",
                    "status", "reviewed_by", "created_at")
    list_filter = ("status", "kind", "reason", "created_at")
    search_fields = ("object_id", "reason", "detail", "reporter__email")
    list_select_related = ("reporter", "reviewed_by")
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = ("kind", "object_id", "reporter", "reason_label", "detail", "created_at",
                       "reviewed_by", "reviewed_at", "reported_item", "times_reported")
    export_fields = ("id", "kind", "object_id", "reporter", "reason", "status", "resolution",
                     "reviewed_by", "reviewed_at", "created_at")
    actions = ["remove_item", "dismiss", "export_as_csv"]

    def get_queryset(self, request):
        # default view leads with the open queue, newest first (status is a filter, not a lock-in)
        return super().get_queryset(request).order_by("-created_at")

    @admin.display(description="السبب", ordering="reason")
    def reason_label(self, obj):
        return REASON_LABELS.get(obj.reason, obj.reason)

    @admin.display(description="بلاغات مفتوحة")
    def times_reported(self, obj):
        n = Report.objects.filter(kind=obj.kind, object_id=obj.object_id,
                                  status=Report.Status.OPEN).count()
        if n > 1:
            return format_html('<b style="color:#c1121f">×{}</b>', n)
        return n

    @admin.display(description="Reported item")
    def reported_item(self, obj):
        target = report_targets.resolve_target(obj.kind, obj.object_id)
        if target is None:
            return format_html('<span style="color:#999">محذوف / غير موجود</span>')
        url = report_targets.target_admin_url(obj.kind, target)
        label = str(target)
        return format_html('<a href="{}">{}</a>', url, label) if url else label

    def _notify_owner(self, kind, target):
        """Best-effort: tell the item's owner it was removed after a report (force past opt-out)."""
        owner = report_targets.owner_of(kind, target)
        if owner is None:
            return
        try:
            from apps.notifications.services import notify
            label = report_targets.kind_label(kind)
            notify(owner, kind="admin_broadcast", title="تمت إزالة عنصر بعد بلاغ",
                   body=f"تمت إزالة «{label}» الخاص بك بعد مراجعة بلاغ من الإدارة لمخالفته قواعد المنصة.",
                   force=True)
        except Exception:  # noqa: BLE001 — notification failure must not abort the moderation action
            pass

    def _resolve_open_siblings(self, report, reviewer, *, resolution):
        """Collapse the queue: mark every other OPEN report on the same item as actioned too."""
        Report.objects.filter(
            kind=report.kind, object_id=report.object_id, status=Report.Status.OPEN,
        ).exclude(pk=report.pk).update(
            status=Report.Status.ACTIONED, resolution=resolution,
            reviewed_by=reviewer, reviewed_at=timezone.now(),
        )

    @admin.action(description="🗑️ Remove reported item")
    def remove_item(self, request, queryset):
        for report in queryset.exclude(status=Report.Status.ACTIONED):
            target = report_targets.resolve_target(report.kind, report.object_id)
            if target is None:
                self.message_user(request, f"البلاغ #{report.pk}: العنصر غير موجود", level="warning")
                report.status, report.resolution = Report.Status.ACTIONED, "missing"
            else:
                label = report_targets.remove_target(report.kind, target)
                self._notify_owner(report.kind, target)
                report.status, report.resolution = Report.Status.ACTIONED, "removed"
                AuditLog.objects.create(
                    actor=request.user, action="admin.report_remove", model=report.kind,
                    object_id=str(report.object_id), after={"resolution": label},
                )
                self._resolve_open_siblings(report, request.user, resolution="removed (duplicate)")
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
class AuditLogAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("at", "actor", "action", "model", "object_id", "ip")
    list_filter = ("action", "model", "at")
    search_fields = ("object_id", "action", "model", "ip", "actor__email")
    date_hierarchy = "at"
    list_per_page = 50
    list_select_related = ("actor",)
    readonly_fields = [f.name for f in AuditLog._meta.fields]
    export_fields = ("id", "at", "actor", "action", "model", "object_id", "ip")
    actions = ["export_as_csv"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
