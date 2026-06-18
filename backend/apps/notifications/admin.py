from django.contrib import admin
from django.utils import timezone
from unfold.admin import ModelAdmin

from apps.core.models import AuditLog

from . import services
from .models import Notification, NotificationPreference, ScheduledNotification


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    list_display = ("id", "user", "kind", "title", "read_at", "emailed", "pushed", "created_at")
    list_filter = ("kind", "emailed", "pushed")
    search_fields = ("user__email", "title", "body")
    readonly_fields = [f.name for f in Notification._meta.fields]

    def has_add_permission(self, request):
        return False


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(ModelAdmin):
    list_display = ("user", "chat_unread", "job_alerts", "proposal_updates", "marketing", "updated_at")
    list_filter = ("chat_unread", "job_alerts", "proposal_updates", "marketing")
    search_fields = ("user__email",)
    readonly_fields = ("user", "updated_at")

    def has_add_permission(self, request):
        return False


@admin.register(ScheduledNotification)
class ScheduledNotificationAdmin(ModelAdmin):
    """Compose UI for admin broadcasts (FR-NOT-3/4): set audience + schedule. A future
    `scheduled_at` is delivered by the beat sweeper; use 'Send now' for an instant broadcast."""

    list_display = ("id", "title", "audience", "status", "scheduled_at", "recipients_count", "sent_at")
    list_filter = ("status", "audience")
    search_fields = ("title", "body")
    actions = ["send_now", "cancel_pending"]
    fields = ("title", "body", "deep_link", "audience", "audience_user_ids", "scheduled_at",
              "status", "recipients_count", "created_by", "sent_at")
    readonly_fields = ("status", "recipients_count", "created_by", "sent_at")

    def save_model(self, request, obj, form, change):
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    @admin.action(description="📣 Send now")
    def send_now(self, request, queryset):
        total = 0
        for scheduled in queryset.filter(status=ScheduledNotification.Status.PENDING):
            sent = services.broadcast(
                title=scheduled.title, body=scheduled.body, audience=scheduled.audience,
                deep_link=scheduled.deep_link, user_ids=scheduled.audience_user_ids,
            )
            scheduled.status = ScheduledNotification.Status.SENT
            scheduled.sent_at = timezone.now()
            scheduled.recipients_count = sent
            scheduled.save(update_fields=["status", "sent_at", "recipients_count"])
            AuditLog.objects.create(actor=request.user, action="admin.broadcast_sent",
                                    model="ScheduledNotification", object_id=str(scheduled.pk),
                                    after={"audience": scheduled.audience, "recipients": sent})
            total += sent
        self.message_user(request, f"أُرسل البث إلى {total} مستخدم.")

    @admin.action(description="🚫 Cancel pending")
    def cancel_pending(self, request, queryset):
        updated = queryset.filter(status=ScheduledNotification.Status.PENDING).update(
            status=ScheduledNotification.Status.CANCELLED
        )
        self.message_user(request, f"أُلغي {updated} بثًّا مجدولًا.")
