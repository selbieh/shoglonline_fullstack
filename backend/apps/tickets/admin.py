"""Ticket Types CRUD + Tickets queue with reply/solve/close (ADM-6, AC-9)."""
from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from apps.core.admin_export import ExportCsvMixin
from apps.core.models import AuditLog

from . import services
from .models import Ticket, TicketReply, TicketType


@admin.register(TicketType)
class TicketTypeAdmin(ModelAdmin):
    list_display = ("name_ar", "slug", "is_dispute", "is_active")
    list_filter = ("is_dispute", "is_active")
    prepopulated_fields = {"slug": ("name_ar",)}


class TicketReplyInline(TabularInline):
    model = TicketReply
    extra = 0
    fields = ("author", "message", "is_staff", "created_at")
    readonly_fields = ("author", "created_at")


@admin.register(Ticket)
class TicketAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("id", "title", "user", "type", "status", "contract", "last_activity_at")
    list_filter = ("status", "type")
    search_fields = ("title", "user__email", "message")
    readonly_fields = ("user", "type", "contract", "job", "created_at", "solved_at", "closed_at",
                       "on_hold_at")
    export_fields = ("id", "title", "user", "type", "status", "contract", "created_at", "last_activity_at")
    inlines = [TicketReplyInline]
    actions = ["mark_pending", "mark_on_hold", "resume_hold", "mark_solved", "mark_closed", "export_as_csv"]

    def save_formset(self, request, form, formset, change):
        """Admin replies are staff replies (sets status → Answered)."""
        instances = formset.save(commit=False)
        for obj in instances:
            if isinstance(obj, TicketReply) and not obj.pk:
                services.reply(obj.ticket, request.user, obj.message, is_staff=True)
            else:
                obj.save()
        formset.save_m2m()

    @admin.action(description="⏳ Mark pending")
    def mark_pending(self, request, queryset):
        from rest_framework.exceptions import ValidationError
        for ticket in queryset:
            try:
                services.set_pending(ticket)
                AuditLog.objects.create(actor=request.user, action="admin.ticket_pending",
                                        model="Ticket", object_id=str(ticket.pk))
            except ValidationError:
                self.message_user(request, f"التذكرة #{ticket.pk}: حالة غير صالحة للتعليق", level="error")

    @admin.action(description="⏸️ Put On-Hold (uses the on_hold_reason field)")
    def mark_on_hold(self, request, queryset):
        from rest_framework.exceptions import ValidationError
        for ticket in queryset:
            try:
                services.hold(ticket, reason=ticket.on_hold_reason or "بانتظار جهة خارجية")
                AuditLog.objects.create(actor=request.user, action="admin.ticket_on_hold",
                                        model="Ticket", object_id=str(ticket.pk),
                                        after={"reason": ticket.on_hold_reason})
            except ValidationError:
                self.message_user(request, f"التذكرة #{ticket.pk}: حالة غير صالحة للتعليق", level="error")

    @admin.action(description="▶️ Resume (lift hold)")
    def resume_hold(self, request, queryset):
        from rest_framework.exceptions import ValidationError
        for ticket in queryset:
            try:
                services.resume(ticket)
                AuditLog.objects.create(actor=request.user, action="admin.ticket_resume",
                                        model="Ticket", object_id=str(ticket.pk))
            except ValidationError:
                self.message_user(request, f"التذكرة #{ticket.pk}: ليست معلّقة", level="error")

    @admin.action(description="✅ Mark solved")
    def mark_solved(self, request, queryset):
        for ticket in queryset:
            services.solve(ticket, report="حُلّت من الإدارة")
            AuditLog.objects.create(actor=request.user, action="admin.ticket_solved",
                                    model="Ticket", object_id=str(ticket.pk))

    @admin.action(description="🔒 Close ticket (resolve dispute first)")
    def mark_closed(self, request, queryset):
        from rest_framework.exceptions import ValidationError
        for ticket in queryset:
            try:
                services.close(ticket, report="أُغلقت من الإدارة")
                AuditLog.objects.create(actor=request.user, action="admin.ticket_closed",
                                        model="Ticket", object_id=str(ticket.pk))
            except ValidationError:
                self.message_user(request, f"التذكرة #{ticket.pk}: احسم نزاع العقد أولًا (BR-22)", level="error")
