from django.contrib import admin
from django.utils.html import format_html_join
from unfold.admin import ModelAdmin, TabularInline

from apps.core.admin_export import ExportCsvMixin

from .models import (
    Address,
    Certificate,
    Education,
    EmployerProfile,
    Employment,
    IDVerification,
    PortfolioItem,
    WorkerLanguage,
    WorkerProfile,
    WorkerSkill,
)
from .services import review_id_verification, review_profile_publish


@admin.register(EmployerProfile)
class EmployerProfileAdmin(ExportCsvMixin, ModelAdmin):
    list_display = ("user", "company_name", "field", "country", "city", "rating_avg", "rating_count", "total_spent")
    list_filter = ("country", "city", "field")
    search_fields = ("user__email", "company_name", "field", "city", "country")
    autocomplete_fields = ("user",)
    list_select_related = ("user",)
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = ("rating_avg", "rating_count", "total_spent", "created_at")
    export_fields = ("id", "user", "company_name", "field", "country", "city",
                     "rating_avg", "rating_count", "total_spent")
    actions = ["export_as_csv"]


@admin.register(Address)
class AddressAdmin(ModelAdmin):
    list_display = ("user", "country", "city", "state", "is_primary")
    list_filter = ("country", "is_primary")
    search_fields = ("user__email", "city", "country")
    autocomplete_fields = ("user",)
    list_select_related = ("user",)


class SkillInline(TabularInline):
    model = WorkerSkill
    autocomplete_fields = ("skill",)
    extra = 0


class CertificateInline(TabularInline):
    model = Certificate
    extra = 0


class EducationInline(TabularInline):
    model = Education
    extra = 0


class EmploymentInline(TabularInline):
    model = Employment
    extra = 0


class LanguageInline(TabularInline):
    model = WorkerLanguage
    extra = 0


class PortfolioInline(TabularInline):
    model = PortfolioItem
    extra = 0


@admin.register(WorkerProfile)
class WorkerProfileAdmin(ExportCsvMixin, ModelAdmin):
    """Profiles + the publish-review queue (rule D-1). A worker submits at ≥70% → PENDING_REVIEW;
    the reviewer sees the completeness % and approves (→ live) or rejects (uses publish_reject_reason)."""

    list_display = (
        "user", "bio_title", "publish_state", "completeness", "expertise_level",
        "visibility", "is_verified", "rating_avg",
    )
    list_filter = ("publish_state", "expertise_level", "availability", "visibility",
                   "is_verified", "offline_reminder_sent", "main_category")
    search_fields = ("user__email", "user__first_name", "user__last_name", "display_name", "bio_title")
    autocomplete_fields = ("user", "main_category", "specialization")
    list_select_related = ("user", "main_category")
    date_hierarchy = "created_at"
    list_per_page = 50
    readonly_fields = ("completeness", "publish_reviewed_by", "publish_reviewed_at",
                       "rating_avg", "rating_count", "total_earned",
                       "visibility_changed_at", "created_at", "updated_at")
    export_fields = ("id", "user", "display_name", "bio_title", "publish_state", "expertise_level",
                     "visibility", "is_verified", "rating_avg", "rating_count", "total_earned", "created_at")
    inlines = [SkillInline, EducationInline, EmploymentInline, LanguageInline, CertificateInline, PortfolioInline]
    actions = ["approve_publish", "reject_publish", "export_as_csv"]

    @admin.display(description="نسبة الاكتمال")
    def completeness(self, obj) -> str:
        return f"{obj.completeness_pct}%"

    @admin.action(description="✅ Approve publish (profile goes live)")
    def approve_publish(self, request, queryset):
        for profile in queryset:
            review_profile_publish(profile, approve=True, reviewer=request.user)
        self.message_user(request, f"نُشر {queryset.count()} ملف.")

    @admin.action(description="⛔ Reject publish (uses publish_reject_reason)")
    def reject_publish(self, request, queryset):
        from rest_framework.exceptions import ValidationError
        done = 0
        for profile in queryset:
            try:
                review_profile_publish(profile, approve=False, reviewer=request.user,
                                       reason=profile.publish_reject_reason or "لم يُستوفَ الحد الأدنى للنشر")
                done += 1
            except ValidationError:
                continue
        self.message_user(request, f"رُفض نشر {done} ملف.")


@admin.register(IDVerification)
class IDVerificationAdmin(ModelAdmin):
    """National-ID review queue (FR-PROF-6). Approve flips the worker's is_verified badge;
    reject requires a reason (edit the field, then run the reject action)."""

    list_display = ("user", "status", "doc_type", "reviewed_by", "created_at", "reviewed_at")
    list_filter = ("status", "doc_type", "consent")
    search_fields = ("user__email", "user__first_name", "user__last_name", "reject_reason")
    autocomplete_fields = ("user",)
    list_select_related = ("user", "reviewed_by")
    date_hierarchy = "created_at"
    readonly_fields = ("created_at", "reviewed_at", "reviewed_by", "id_files")
    actions = ["approve_selected", "reject_selected"]

    @admin.display(description="ملف الهوية")
    def id_files(self, obj):
        rows = obj.attachments.filter(is_deleted=False)
        if not rows:
            return "—"
        return format_html_join(
            " · ", '<a href="/api/v1/uploads/{}" target="_blank">{}</a>',
            ((a.pk, a.original_name) for a in rows),
        )

    @admin.action(description="✅ Approve (set verified badge)")
    def approve_selected(self, request, queryset):
        for idv in queryset:
            review_id_verification(idv, approve=True, reviewer=request.user)
        self.message_user(request, f"وُثّق {queryset.count()} حساب.")

    @admin.action(description="⛔ Reject (uses the reject_reason field)")
    def reject_selected(self, request, queryset):
        from rest_framework.exceptions import ValidationError
        done = 0
        for idv in queryset:
            try:
                review_id_verification(idv, approve=False, reviewer=request.user,
                                       reason=idv.reject_reason or "لم تُستوفَ متطلبات التوثيق")
                done += 1
            except ValidationError:
                continue
        self.message_user(request, f"رُفض {done} طلب.")
