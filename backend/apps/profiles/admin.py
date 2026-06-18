from django.contrib import admin
from django.utils.html import format_html_join
from unfold.admin import ModelAdmin, TabularInline

from .models import (
    Address,
    Education,
    EmployerProfile,
    Employment,
    IDVerification,
    PortfolioItem,
    WorkerLanguage,
    WorkerProfile,
    WorkerSkill,
)
from .services import review_id_verification


@admin.register(EmployerProfile)
class EmployerProfileAdmin(ModelAdmin):
    list_display = ("user", "company_name", "rating_avg", "rating_count", "total_spent")
    search_fields = ("user__email", "company_name")


@admin.register(Address)
class AddressAdmin(ModelAdmin):
    list_display = ("user", "country", "city", "is_primary")
    list_filter = ("country", "is_primary")
    search_fields = ("user__email", "city", "country")


class SkillInline(TabularInline):
    model = WorkerSkill
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
class WorkerProfileAdmin(ModelAdmin):
    list_display = ("user", "bio_title", "expertise_level", "visibility", "is_verified", "rating_avg", "total_earned")
    list_filter = ("expertise_level", "visibility", "is_verified")
    search_fields = ("user__email", "bio_title")
    inlines = [SkillInline, EducationInline, EmploymentInline, LanguageInline, PortfolioInline]


@admin.register(IDVerification)
class IDVerificationAdmin(ModelAdmin):
    """National-ID review queue (FR-PROF-6). Approve flips the worker's is_verified badge;
    reject requires a reason (edit the field, then run the reject action)."""

    list_display = ("user", "status", "reviewed_by", "created_at", "reviewed_at")
    list_filter = ("status",)
    search_fields = ("user__email",)
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
