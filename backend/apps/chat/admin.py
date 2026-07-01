"""Conversation oversight (ADM-6): read, search by participant, archive (read-only)."""
from django.contrib import admin
from django.db.models import Count
from unfold.admin import ModelAdmin, TabularInline

from apps.core.models import AuditLog

from . import services
from .models import ChatReport, Conversation, ConversationMember, Message


class MessageInline(TabularInline):
    model = Message
    extra = 0
    fields = ("sender", "body", "created_at")
    readonly_fields = fields
    can_delete = False


@admin.register(Message)
class MessageAdmin(ModelAdmin):
    """Read-only message lookup — locate a reported message by body/sender (FR-CHAT-10)."""

    list_display = ("id", "conversation", "sender", "body_preview", "unread_email_sent", "created_at")
    list_filter = ("unread_email_sent", "created_at")
    search_fields = ("body", "sender__email", "conversation__user_a__email", "conversation__user_b__email")
    list_select_related = ("conversation", "sender")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_per_page = 50
    readonly_fields = [f.name for f in Message._meta.fields]

    @admin.display(description="النص")
    def body_preview(self, obj):
        if not obj.body:
            return "—"
        return obj.body[:80] + "…" if len(obj.body) > 80 else obj.body

    def has_add_permission(self, request):
        return False


@admin.register(Conversation)
class ConversationAdmin(ModelAdmin):
    list_display = ("id", "user_a", "user_b", "context_type", "status", "message_count", "last_message_at")
    list_filter = ("status", "context_type", "last_message_at")
    search_fields = ("user_a__email", "user_b__email", "last_message_snippet")
    list_select_related = ("user_a", "user_b", "contract", "job")
    date_hierarchy = "last_message_at"
    list_per_page = 50
    readonly_fields = [f.name for f in Conversation._meta.fields]
    inlines = [MessageInline]
    actions = ["archive_read_only"]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_msgs=Count("messages"))

    @admin.display(description="رسائل", ordering="_msgs")
    def message_count(self, obj):
        return obj._msgs

    def has_add_permission(self, request):
        return False

    @admin.action(description="📁 Archive (read-only)")
    def archive_read_only(self, request, queryset):
        for conv in queryset:
            services.set_read_only(conv)
        self.message_user(request, f"أُرشفت {queryset.count()} محادثة")


@admin.register(ConversationMember)
class ConversationMemberAdmin(ModelAdmin):
    """Read cursor per participant (drives unread counts) — read-only diagnostic view."""

    list_display = ("id", "conversation", "user", "last_read_at")
    search_fields = ("user__email", "conversation__id")
    list_select_related = ("conversation", "user")
    list_per_page = 50
    readonly_fields = [f.name for f in ConversationMember._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(ChatReport)
class ChatReportAdmin(ModelAdmin):
    """Abuse-report review queue (FR-CHAT-10): dismiss, warn, freeze the offender, or archive."""

    list_display = ("id", "conversation", "reporter", "reason_preview", "status", "resolution", "reviewed_by", "created_at")
    list_filter = ("status", "reviewed_at", "created_at")
    search_fields = ("conversation__user_a__email", "conversation__user_b__email", "reporter__email", "reason")
    list_select_related = ("conversation", "message", "reporter", "reviewed_by")
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = [f.name for f in ChatReport._meta.fields]
    actions = ["dismiss", "warn", "freeze_offender", "archive_conversation"]

    @admin.display(description="السبب")
    def reason_preview(self, obj):
        return obj.reason[:60] + "…" if obj.reason and len(obj.reason) > 60 else obj.reason

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
