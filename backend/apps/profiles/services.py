"""Profile services — national-ID verification workflow (FR-PROF-6).

Upload reuses the Part 03 attachment pipeline (the IDVerification row is the host). Admin review
flips WorkerProfile.is_verified, writes an AuditLog entry, and notifies the user."""
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.models import AuditLog

from .models import IDVerification, WorkerProfile

ERR = {
    "file_required": {"code": "file_required", "message_ar": "أرفق صورة الهوية الوطنية"},
    "reason_required": {"code": "reason_required", "message_ar": "سبب الرفض إلزامي"},
}


@transaction.atomic
def submit_id_verification(user, attachment_ids) -> IDVerification:
    """Create/replace the user's verification request (resets a rejected one to pending)."""
    from apps.accounts.services import assert_active  # noqa: PLC0415 (avoid import cycle)
    from apps.attachments.services import attach  # noqa: PLC0415

    assert_active(user)  # frozen/deleted accounts cannot submit
    ids = [i for i in (attachment_ids or []) if i]
    if not ids:
        raise ValidationError(ERR["file_required"])

    idv, _ = IDVerification.objects.get_or_create(user=user)
    idv.status = IDVerification.Status.PENDING
    idv.reject_reason = ""
    idv.reviewed_by = None
    idv.reviewed_at = None
    idv.save(update_fields=["status", "reject_reason", "reviewed_by", "reviewed_at"])

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
