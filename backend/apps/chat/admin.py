"""Conversation oversight (ADM-6): read, search by participant, archive (read-only),
plus a dedicated two-pane Chat Inbox (Firestore-backed) for reading a thread as chat bubbles."""
import math

from django.contrib import admin
from django.core.exceptions import PermissionDenied
from django.db.models import Count
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.template.response import TemplateResponse
from django.urls import path
from unfold.admin import ModelAdmin, TabularInline

from apps.core.models import AuditLog

from . import oversight, services
from .models import ChatReport, Conversation, ConversationMember, Message

INBOX_PAGE_SIZE = 40


def _client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")


def _client_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


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

    # ---------------------------------------------------------------- Chat Inbox (ADM-6)
    # A dedicated two-pane reader: conversations on one side, the selected thread rendered as
    # chat bubbles on the other. Threads are read live from Firestore (Postgres mirror fallback)
    # via apps.chat.oversight. The three URLs live in the `admin` namespace so the sidebar and
    # templates can reverse them (admin:chat_inbox / _thread / _action).
    def get_urls(self):
        inbox = [
            path("inbox/", self.admin_site.admin_view(self.inbox_view), name="chat_inbox"),
            path("inbox/<int:conv_id>/thread/",
                 self.admin_site.admin_view(self.inbox_thread), name="chat_inbox_thread"),
            path("inbox/<int:conv_id>/action/",
                 self.admin_site.admin_view(self.inbox_action), name="chat_inbox_action"),
        ]
        return inbox + super().get_urls()

    def inbox_view(self, request):
        """The Chat Inbox page — conversation list (searchable, paginated) + an empty thread pane."""
        if not self.has_view_permission(request):
            raise PermissionDenied
        q = request.GET.get("q", "").strip()
        status = request.GET.get("status", "").strip()
        context = request.GET.get("context", "").strip()
        has_messages = request.GET.get("has_messages", "") in ("1", "on", "true")
        try:
            page = max(1, int(request.GET.get("page", "1")))
        except (TypeError, ValueError):
            page = 1
        offset = (page - 1) * INBOX_PAGE_SIZE
        items, total = oversight.list_conversations(
            search=q, status=status, context=context, has_messages=has_messages,
            limit=INBOX_PAGE_SIZE, offset=offset,
        )
        num_pages = max(1, math.ceil(total / INBOX_PAGE_SIZE))
        ctx = {
            **self.admin_site.each_context(request),
            "title": "Chat inbox",
            "conversations": items,
            "q": q,
            "status": status,
            "context": context,
            "has_messages": has_messages,
            "page": page,
            "num_pages": num_pages,
            "total": total,
            "has_prev": page > 1,
            "has_next": page < num_pages,
            "prev_page": page - 1,
            "next_page": page + 1,
            "can_moderate": self.has_change_permission(request),
            "opts": self.model._meta,
        }
        return TemplateResponse(request, "admin/chat/inbox.html", ctx)

    def inbox_thread(self, request, conv_id):
        """JSON for one thread (messages + participants + source), fetched by the inbox JS."""
        if not self.has_view_permission(request):
            return JsonResponse({"error": "forbidden"}, status=403)
        try:
            data = oversight.get_thread(conv_id)
        except Conversation.DoesNotExist as exc:
            raise Http404("conversation not found") from exc
        return JsonResponse(data)

    def inbox_action(self, request, conv_id):
        """Inline moderation from the inbox: archive / reactivate a conversation, or freeze a party."""
        if request.method != "POST":
            return JsonResponse({"error": "method_not_allowed"}, status=405)
        if not self.has_change_permission(request):
            return JsonResponse({"error": "forbidden"}, status=403)
        conv = get_object_or_404(Conversation, pk=conv_id)
        action = request.POST.get("action", "")

        if action == "archive":
            services.set_read_only(conv)
            self._audit(request, "admin.chat_archive", conv)
            message = "أُرشفت المحادثة (للقراءة فقط)"
        elif action == "reactivate":
            services.set_active(conv)
            self._audit(request, "admin.chat_reactivate", conv)
            message = "أُعيد تفعيل المحادثة"
        elif action == "freeze":
            user_id = _client_int(request.POST.get("user_id"))
            if user_id not in (conv.user_a_id, conv.user_b_id):
                return JsonResponse({"error": "not_a_participant"}, status=400)
            from apps.accounts.services import freeze_user
            target = conv.user_a if user_id == conv.user_a_id else conv.user_b
            freeze_user(target, reason=f"admin chat inbox (conversation #{conv.pk})",
                        actor=request.user, ip=_client_ip(request))
            message = f"جُمّد الحساب: {target.email or target.pk}"
        else:
            return JsonResponse({"error": "unknown_action"}, status=400)

        conv.refresh_from_db()
        return JsonResponse({"ok": True, "message": message, "status": conv.status})

    def _audit(self, request, action, conv):
        AuditLog.objects.create(actor=request.user, action=action,
                                model="Conversation", object_id=str(conv.pk), ip=_client_ip(request))


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
