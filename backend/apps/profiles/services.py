"""Profile services — national-ID verification workflow (FR-PROF-6).

Upload reuses the Part 03 attachment pipeline (the IDVerification row is the host). Admin review
flips WorkerProfile.is_verified, writes an AuditLog entry, and notifies the user."""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.models import AuditLog
from apps.core.services import get_setting

from .models import IDVerification, WorkerProfile

ERR = {
    "file_required": {"code": "file_required", "message_ar": "أرفق صورة الهوية الوطنية"},
    "reason_required": {"code": "reason_required", "message_ar": "سبب الرفض إلزامي"},
}


def submit_profile_for_publication(profile: WorkerProfile) -> WorkerProfile:
    """Worker submit → published (profiles.auto_publish ON) or pending_review (OFF) — rule D-1.

    Mirrors jobs/services.submit_for_publication: with the flag ON the profile goes live with no
    admin review; with it OFF it waits in PENDING_REVIEW for review_profile_publish(). Callers gate
    on completeness (≥70%) before invoking this."""
    if get_setting("profiles.auto_publish", False):
        profile.publish_state = WorkerProfile.PublishState.PUBLISHED
    else:
        profile.publish_state = WorkerProfile.PublishState.PENDING_REVIEW
    profile.publish_reject_reason = ""
    profile.save(update_fields=["publish_state", "publish_reject_reason"])
    return profile


@transaction.atomic
def review_profile_publish(profile: WorkerProfile, *, approve: bool, reviewer=None, reason: str = "") -> WorkerProfile:
    """Admin review of a publish request (rule D-1).

    approve → publish_state PUBLISHED (the profile goes live); reject → REJECTED + a required
    reason. Writes an AuditLog entry and notifies the worker either way."""
    from apps.notifications.services import notify  # noqa: PLC0415 (avoid import cycle)

    if approve:
        profile.publish_state = WorkerProfile.PublishState.PUBLISHED
        profile.publish_reject_reason = ""
    else:
        if not (reason or "").strip():
            raise ValidationError(ERR["reason_required"])
        profile.publish_state = WorkerProfile.PublishState.REJECTED
        profile.publish_reject_reason = reason

    profile.publish_reviewed_by = reviewer
    profile.publish_reviewed_at = timezone.now()
    profile.save(update_fields=[
        "publish_state", "publish_reject_reason", "publish_reviewed_by", "publish_reviewed_at",
    ])

    AuditLog.objects.create(
        actor=reviewer, action="admin.profile_publish_reviewed", model="WorkerProfile",
        object_id=str(profile.pk),
        after={"publish_state": profile.publish_state, "reason": profile.publish_reject_reason},
    )
    # Publish decisions must always reach the worker (not suppressible by the marketing opt-out).
    if approve:
        notify(profile.user, kind="admin_broadcast", title="تم نشر ملفك",
               body="اعتمد المشرف ملفك وأصبح ظاهرًا للعملاء.", deep_link="/me/profile", force=True)
    else:
        notify(profile.user, kind="admin_broadcast", title="لم يُعتمد نشر ملفك",
               body=profile.publish_reject_reason[:200], deep_link="/me/profile", force=True)
    return profile


@transaction.atomic
def submit_id_verification(user, attachment_ids, doc_type="", consent=False) -> IDVerification:
    """Create/replace the user's verification request (resets a rejected one to pending).
    `attachment_ids` may carry several files (front / back / selfie — ppt slide-08)."""
    from apps.accounts.services import assert_active  # noqa: PLC0415 (avoid import cycle)
    from apps.attachments.services import attach  # noqa: PLC0415

    assert_active(user)  # frozen/deleted accounts cannot submit
    ids = [i for i in (attachment_ids or []) if i]
    if not ids:
        raise ValidationError(ERR["file_required"])

    idv, _ = IDVerification.objects.get_or_create(user=user)
    idv.status = IDVerification.Status.PENDING
    idv.doc_type = doc_type or idv.doc_type
    idv.consent = bool(consent)
    idv.reject_reason = ""
    idv.reviewed_by = None
    idv.reviewed_at = None
    idv.save(update_fields=["status", "doc_type", "consent", "reject_reason", "reviewed_by", "reviewed_at"])

    # On re-submission, retire the previously-attached ID file(s) so a reviewer only ever sees the
    # current upload (soft-delete keeps the old row for audit/orphan-sweep).
    idv.attachments.filter(is_deleted=False).update(is_deleted=True)
    linked = attach(ids, idv, user)  # owner-only link (enforced in attachments._host_allows)
    if not linked:
        raise ValidationError(ERR["file_required"])
    return idv


@transaction.atomic
def review_id_verification(idv: IDVerification, *, approve: bool, reviewer=None, reason: str = "") -> IDVerification:
    """Admin approves → is_verified badge on; rejects → reason required, badge stays off."""
    from apps.notifications.services import notify  # noqa: PLC0415 (avoid import cycle)

    if approve:
        idv.status = IDVerification.Status.APPROVED
        idv.reject_reason = ""
        profile, _ = WorkerProfile.objects.get_or_create(user=idv.user)
        WorkerProfile.objects.filter(pk=profile.pk).update(is_verified=True)
    else:
        if not (reason or "").strip():
            raise ValidationError(ERR["reason_required"])
        idv.status = IDVerification.Status.REJECTED
        idv.reject_reason = reason
        WorkerProfile.objects.filter(user=idv.user).update(is_verified=False)

    idv.reviewed_by = reviewer
    idv.reviewed_at = timezone.now()
    idv.save(update_fields=["status", "reject_reason", "reviewed_by", "reviewed_at"])

    AuditLog.objects.create(
        actor=reviewer, action="admin.id_verification_reviewed", model="IDVerification",
        object_id=str(idv.pk), after={"status": idv.status, "reason": idv.reject_reason},
    )
    # Account-status notices must always reach the user (not suppressible by the marketing opt-out).
    if approve:
        notify(idv.user, kind="admin_broadcast", title="تم توثيق هويتك",
               body="ظهرت علامة التوثيق على ملفك العام.", deep_link="/me/profile", force=True)
    else:
        notify(idv.user, kind="admin_broadcast", title="رُفض توثيق الهوية",
               body=idv.reject_reason[:200], deep_link="/me/profile", force=True)
    return idv
