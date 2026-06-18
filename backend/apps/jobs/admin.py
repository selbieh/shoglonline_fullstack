from django.contrib import admin
from unfold.admin import ModelAdmin, TabularInline

from apps.core.admin_export import ExportCsvMixin
from apps.core.models import AuditLog

from . import services
from .models import Invitation, Job, Proposal, ScreeningQuestion


class ScreeningInline(TabularInline):
    model = ScreeningQuestion
    extra = 0


@admin.register(Job)
class JobAdmin(ExportCsvMixin, ModelAdmin):
    """Moderation queue (FR-JOB-14): approve/reject in bulk, with audit."""

    list_display = ("title", "employer", "category", "status", "budget_min", "budget_max",
                    "proposals_count", "published_at", "expires_at")
    list_filter = ("status", "category", "location_type")
    search_fields = ("title", "description", "employer__email", "skills__name_ar")
    export_fields = ("id", "title", "employer", "category", "status", "budget_min", "budget_max",
                     "proposals_count", "is_private", "published_at", "created_at")
    inlines = [ScreeningInline]
    actions = ["approve_jobs", "reject_jobs", "archive_jobs", "export_as_csv"]
    date_hierarchy = "created_at"

    @admin.action(description="✅ Approve & publish (emails subscribers)")
    def approve_jobs(self, request, queryset):
        from apps.notifications.services import notify
        for job in queryset.filter(status=Job.Status.PENDING_REVIEW):
            services.approve_job(job)
            notify(job.employer, kind="admin_broadcast", title="تم نشر وظيفتك",
                   body=job.title, deep_link=f"/jobs/{job.slug}", force=True)  # always deliver
            AuditLog.objects.create(actor=request.user, action="admin.approve_job",
                                    model="Job", object_id=str(job.pk))

    @admin.action(description="❌ Reject (reason required on job page)")
    def reject_jobs(self, request, queryset):
        from apps.notifications.services import notify
        reason = "رفض جماعي — راجع سياسات النشر"
        for job in queryset.filter(status=Job.Status.PENDING_REVIEW):
            services.reject_job(job, reason)
            notify(job.employer, kind="admin_broadcast", title="رُفضت وظيفتك",
                   body=reason, deep_link="/me/jobs", force=True)  # sends the Arabic reason
            AuditLog.objects.create(actor=request.user, action="admin.reject_job",
                                    model="Job", object_id=str(job.pk))

    @admin.action(description="🗄 Archive (BR-17: soft delete)")
    def archive_jobs(self, request, queryset):
        queryset.update(status=Job.Status.ARCHIVED)


@admin.register(Proposal)
class ProposalAdmin(ExportCsvMixin, ModelAdmin):
    """Proposal moderation (FR-JOB-15) — rejection refunds the bid (FR-BID-6)."""

    list_display = ("id", "job", "worker", "budget", "delivery_days", "status",
                    "bid_consumed", "bid_refunded", "created_at")
    list_filter = ("status",)
    search_fields = ("worker__email", "job__title")
    export_fields = ("id", "job", "worker", "budget", "delivery_days", "status",
                     "bid_consumed", "bid_refunded", "created_at")
    actions = ["approve_proposals", "reject_proposals", "export_as_csv"]

    @admin.action(description="✅ Pass to employer")
    def approve_proposals(self, request, queryset):
        queryset.filter(status=Proposal.Status.PENDING_APPROVAL).update(status=Proposal.Status.SUBMITTED)

    @admin.action(description="❌ Reject & refund bid (FR-BID-6)")
    def reject_proposals(self, request, queryset):
        for proposal in queryset.filter(status=Proposal.Status.PENDING_APPROVAL):
            services.moderation_reject_proposal(proposal, "مخالف لسياسات المنصة")
            AuditLog.objects.create(actor=request.user, action="admin.reject_proposal",
                                    model="Proposal", object_id=str(proposal.pk))


@admin.register(Invitation)
class InvitationAdmin(ModelAdmin):
    list_display = ("job", "employer", "worker", "status", "created_at")
    list_filter = ("status",)
