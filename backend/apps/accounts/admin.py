from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from .models import User
from .services import freeze_user, unfreeze_user


def _client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


@admin.register(User)
class UserAdmin(ExportCsvMixin, DjangoUserAdmin, ModelAdmin):
    """Manage Users (FR-ADM-4): search, freeze, activate — deletion guarded by BR-2."""

    ordering = ["-date_joined"]
    date_hierarchy = "date_joined"
    list_display = ("email", "first_name", "last_name", "active_mode", "status", "phone_verified", "is_staff", "date_joined")
    list_filter = ("status", "active_mode", "phone_verified", "is_staff", "is_superuser", "is_active")
    search_fields = ("email", "first_name", "last_name", "phone")
    readonly_fields = ("last_login", "date_joined")
    export_fields = ("id", "email", "first_name", "last_name", "status", "active_mode", "is_staff", "date_joined")
    actions = ["freeze_users", "activate_users", "export_as_csv"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("الملف", {"fields": ("first_name", "last_name", "avatar_url", "phone", "phone_verified")}),
        ("الحالة", {"fields": ("status", "active_mode", "terms_accepted_at")}),
        ("صلاحيات", {"fields": ("is_active", "is_staff", "is_superuser", "groups")}),
        ("تواريخ", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = ((None, {"fields": ("email", "password1", "password2", "is_staff")}),)

    @admin.action(description="Freeze selected (FR-ADM-5 / BR-23 ripple)")
    def freeze_users(self, request, queryset):
        ip = _client_ip(request)
        count = 0
        for user in queryset:
            freeze_user(user, reason="admin bulk action", actor=request.user, ip=ip)
            count += 1
        self.message_user(request, f"جُمّد {count} حساب مع تطبيق آثار التجميد (BR-23).")

    @admin.action(description="Reactivate selected")
    def activate_users(self, request, queryset):
        ip = _client_ip(request)
        count = 0
        for user in queryset:
            unfreeze_user(user, actor=request.user, ip=ip)
            count += 1
        self.message_user(request, f"أُعيد تفعيل {count} حساب واستُعيدت قوائمهم.")
