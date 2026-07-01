from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html
from unfold.admin import ModelAdmin

from apps.core.admin_export import ExportCsvMixin

from .models import EmailLoginCode, User
from .services import freeze_user, unfreeze_user


def _client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


@admin.register(User)
class UserAdmin(ExportCsvMixin, DjangoUserAdmin, ModelAdmin):
    """Manage Users (FR-ADM-4): search, freeze, activate — deletion guarded by BR-2."""

    ordering = ["-date_joined"]
    date_hierarchy = "date_joined"
    list_display = ("avatar_tag", "email", "first_name", "last_name", "active_mode", "status", "phone_verified", "is_staff", "date_joined")
    list_display_links = ("email",)
    list_filter = ("status", "active_mode", "phone_verified", "is_staff", "is_superuser", "is_active", "date_joined")
    search_fields = ("email", "first_name", "last_name", "phone", "legacy_id")
    readonly_fields = ("last_login", "date_joined", "avatar_preview", "google_sub", "legacy_id")
    filter_horizontal = ("groups", "user_permissions")
    list_per_page = 50
    export_fields = ("id", "email", "first_name", "last_name", "status", "active_mode", "is_staff", "date_joined")
    actions = ["freeze_users", "activate_users", "export_as_csv"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("الملف", {"fields": ("first_name", "last_name", "avatar_url", "avatar_preview", "phone", "phone_verified")}),
        ("الحالة", {"fields": ("status", "active_mode", "terms_accepted_at")}),
        ("صلاحيات", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("النظام", {"fields": ("google_sub", "legacy_id", "last_login", "date_joined"), "classes": ("collapse",)}),
    )
    add_fieldsets = ((None, {"fields": ("email", "password1", "password2", "is_staff")}),)

    @admin.display(description="")
    def avatar_tag(self, obj):
        if obj.avatar_url:
            return format_html(
                '<img src="{}" style="width:28px;height:28px;border-radius:50%;object-fit:cover" loading="lazy">',
                obj.avatar_url,
            )
        return format_html('<span style="opacity:.4">—</span>')

    @admin.display(description="معاينة الصورة")
    def avatar_preview(self, obj):
        if obj.avatar_url:
            return format_html('<img src="{}" style="max-width:96px;border-radius:8px">', obj.avatar_url)
        return "—"

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


@admin.register(EmailLoginCode)
class EmailLoginCodeAdmin(ModelAdmin):
    """Read-only view of email login codes (FR-AUTH) — operator fallback when email delivery is down.
    Codes are short-lived, single-use and auto-purged (apps.accounts.tasks.purge_login_codes)."""

    list_display = ("email", "code", "created_at", "expires_at", "consumed_at", "attempts", "request_ip")
    list_filter = ("created_at", "consumed_at")
    search_fields = ("email", "request_ip")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 50
    readonly_fields = [f.name for f in EmailLoginCode._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
