from django.contrib import admin
from unfold.admin import ModelAdmin

from .models import AuditLog, GlobalSetting, SettingChangeLog


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
