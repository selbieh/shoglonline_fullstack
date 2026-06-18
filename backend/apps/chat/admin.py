"""Conversation oversight (ADM-6): read, search by participant, archive (read-only)."""
from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from apps.core.models import AuditLog

from . import services
from .models import ChatReport, Conversation, Message


class MessageInline(TabularInline):
    model = Message
    extra = 0
    fields = ("sender", "body", "created_at")
    readonly_fields = fields
    can_delete = False


@admin.register(Conversation)
class ConversationAdmin(ModelAdmin):
    list_display = ("id", "user_a", "user_b", "context_type", "status", "last_message_at")
    list_filter = ("status", "context_type")
    search_fields = ("user_a__email", "user_b__email")
    readonly_fields = [f.name for f in Conversation._meta.fields]
    inlines = [MessageInline]
    actions = ["archive_read_only"]

    def has_add_permission(self, request):
        return False

    @admin.action(description="📁 Archive (read-only)")
    def archive_read_only(self, request, queryset):
        for conv in queryset:
            services.set_read_only(conv)
        self.message_user(request, f"أُرشفت {queryset.count()} محادثة")


@admin.register(ChatReport)
class ChatReportAdmin(ModelAdmin):
    """Abuse-report review queue (FR-CHAT-10): dismiss, warn, freeze the offender, or archive."""

    list_display = ("id", "conversation", "reporter", "status", "resolution", "reviewed_by", "created_at")
    list_filter = ("status",)
    search_fields = ("conversation__user_a__email", "conversation__user_b__email", "reason")
    readonly_fields = [f.name for f in ChatReport._meta.fields]
    actions = ["dismiss", "warn", "freeze_offender", "archive_conversation"]

    def has_add_permission(self, request):
        return False

    def _resolve(self, request, queryset, action, label):
        from rest_framework.exceptions import ValidationError
        done = 0
        for report in queryset.filter(status=ChatReport.Status.OPEN):
            try:
                services.resolve_report(report, action=action, reviewer=request.user)
                AuditLog.objects.create(actor=request.user, action=f"admin.chat_report_{action}",
                                        model="ChatReport", object_id=str(report.pk))
                done += 1
            except ValidationError:
                continue
        self.message_user(request, f"{label}: {done}")

    @admin.action(description="✅ Dismiss")
    def dismiss(self, request, queryset):
        self._resolve(request, queryset, "dismiss", "رُفض البلاغ")

    @admin.action(description="⚠️ Warn the offender")
    def warn(self, request, queryset):
        self._resolve(request, queryset, "warn", "أُرسل تحذير")

    @admin.action(description="❄️ Freeze the offender (BR-23)")
    def freeze_offender(self, request, queryset):
        self._resolve(request, queryset, "freeze", "جُمّد المُبلَّغ عنه")

    @admin.action(description="📁 Archive the conversation")
    def archive_conversation(self, request, queryset):
        self._resolve(request, queryset, "archive", "أُرشفت المحادثة")
