"""Attachment pipeline services: validated create, host linking, and access control.

Validation is ALWAYS server-side (the frontend pre-check is a convenience only): kill-switch,
size, and MIME are enforced here against Global Settings, with Arabic error envelopes.
"""
from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

from apps.core.services import get_setting

from .models import Attachment

ERR = {
    "disabled": {"code": "uploads_disabled", "message_ar": "رفع الملفات معطّل حاليًا"},
    "required": {"code": "file_required", "message_ar": "لم يتم إرفاق ملف"},
    "empty": {"code": "empty_file", "message_ar": "الملف فارغ"},
    "too_large": {"code": "file_too_large", "message_ar": "حجم الملف يتجاوز الحد المسموح"},
    "blocked": {"code": "file_type_blocked", "message_ar": "نوع الملف غير مسموح"},
    "too_many": {"code": "too_many_files", "message_ar": "عدد الملفات يتجاوز الحد المسموح"},
}

# types whose bytes we CAN identify by magic number — if a file claims one of these but the
# bytes don't confirm it, it's a disguised upload and we reject it.
_SNIFFABLE_PREFIXES = ("image/", "video/", "audio/")
_SNIFFABLE_EXACT = {"application/pdf", "application/zip", "application/x-zip-compressed",
                    "application/x-rar-compressed", "application/vnd.rar"}


def _is_sniffable(mime: str) -> bool:
    return mime.startswith(_SNIFFABLE_PREFIXES) or mime in _SNIFFABLE_EXACT


# WebM/Ogg audio and video share a container (Matroska/Ogg) and therefore the same magic bytes, so
# a voice note recorded by MediaRecorder (audio/webm on Chrome) sniffs as video/webm. When the
# client claims an audio/* type and the detected container is the SAME family, we trust the audio
# claim — a voice note, not a disguised upload. (A genuinely disguised file, e.g. a PNG named
# audio/webm, sniffs as image/png — a different family — and is still caught below.)
_CONTAINER_FAMILY = {
    "audio/webm": "webm", "video/webm": "webm",
    "audio/ogg": "ogg", "video/ogg": "ogg",
}


def _same_container_family(claimed: str, detected: str) -> bool:
    fam = _CONTAINER_FAMILY.get(claimed)
    return fam is not None and fam == _CONTAINER_FAMILY.get(detected)


def _detect_mime(uploaded_file) -> str | None:
    """Magic-byte sniff (first 262 bytes). Returns the detected MIME or None if unidentifiable."""
    import filetype  # noqa: PLC0415

    head = uploaded_file.read(262)
    try:
        uploaded_file.seek(0)
    except (OSError, ValueError):
        pass
    guess = filetype.guess(head)
    return guess.mime if guess else None

_ARCHIVE_MIMES = {
    "application/zip", "application/x-zip-compressed",
    "application/x-rar-compressed", "application/vnd.rar",
}
_DOCUMENT_MIMES = {
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}


def kind_for(content_type: str) -> str:
    for prefix, kind in (("image/", Attachment.Kind.IMAGE),
                         ("video/", Attachment.Kind.VIDEO),
                         ("audio/", Attachment.Kind.AUDIO)):
        if content_type.startswith(prefix):
            return kind
    if content_type in _ARCHIVE_MIMES:
        return Attachment.Kind.ARCHIVE
    if content_type in _DOCUMENT_MIMES:
        return Attachment.Kind.DOCUMENT
    return Attachment.Kind.OTHER


def create_attachment(owner, uploaded_file) -> Attachment:
    """Validate (flag/size/MIME) then persist an unlinked attachment owned by `owner`."""
    if not get_setting("uploads.enabled", True):
        raise ValidationError(ERR["disabled"])
    if uploaded_file is None:
        raise ValidationError(ERR["required"])
    size = uploaded_file.size or 0
    if size <= 0:
        raise ValidationError(ERR["empty"])
    max_mb = int(get_setting("uploads.max_file_mb", 25))
    if size > max_mb * 1024 * 1024:
        raise ValidationError(ERR["too_large"])

    # MIME: never trust the client header alone. Magic-byte sniff is authoritative; if the file
    # CLAIMS a sniffable type (image/video/audio/pdf/zip/rar) but the bytes don't confirm it, it's
    # disguised → reject. Non-sniffable types (text, office docs) fall back to the claimed type.
    claimed = (uploaded_file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    detected = _detect_mime(uploaded_file)
    if detected and claimed.startswith("audio/") and _same_container_family(claimed, detected):
        content_type = claimed  # MediaRecorder voice note: webm/ogg audio sniffs as video — trust it
    elif detected:
        content_type = detected
    elif _is_sniffable(claimed):
        raise ValidationError(ERR["blocked"])  # claims an identifiable type but bytes say otherwise
    else:
        content_type = claimed

    allowed = get_setting("uploads.allowed_mime", []) or []
    if content_type not in allowed:  # empty allow-list = deny-all (fail closed)
        raise ValidationError(ERR["blocked"])

    return Attachment.objects.create(
        owner=owner,
        file=uploaded_file,
        original_name=(uploaded_file.name or "file")[:255],
        content_type=content_type,
        size=size,
        kind=kind_for(content_type),
    )


def attach(attachment_ids, host, owner) -> list[Attachment]:
    """Link the owner's UNLINKED attachments to a freshly-created host row.

    Defensive on every axis: ignores ids that aren't the owner's, are already linked, or deleted
    (no hijack / no re-parent); caps the count per host; and — the central invariant — refuses to
    link to a host the owner is not a party of, so a future caller can't accidentally expose a
    file to the wrong people.
    """
    ids = [i for i in (attachment_ids or []) if i]
    if not ids:
        return []
    max_per_host = int(get_setting("uploads.max_per_host", 10))
    if len(ids) > max_per_host:
        raise ValidationError(ERR["too_many"])
    if not _host_allows(host, owner):  # owner must be a party of the host they attach to
        return []
    host_ct = ContentType.objects.get_for_model(host.__class__)
    rows = list(Attachment.objects.filter(
        id__in=ids, owner=owner, is_deleted=False, host_type__isnull=True,
    ))
    for row in rows:
        row.host_type = host_ct
        row.object_id = host.pk
    if rows:
        Attachment.objects.bulk_update(rows, ["host_type", "object_id"])
    return rows


def can_access(attachment: Attachment, user) -> bool:
    """Owner always; otherwise only a party of the linked host. Default deny (no host → deny)."""
    if attachment.is_deleted:
        return False
    if attachment.owner_id == user.id:
        return True
    host = attachment.host
    return host is not None and _host_allows(host, user)


def _host_allows(host, user) -> bool:
    """Explicit, auditable per-host authorization. Unknown host types → deny."""
    from apps.chat.models import Message  # noqa: PLC0415 (avoid import cycle)
    from apps.contracts.models import Submission  # noqa: PLC0415
    from apps.profiles.models import Certificate, IDVerification, PortfolioItem  # noqa: PLC0415
    from apps.tickets.models import Ticket  # noqa: PLC0415

    if isinstance(host, Message):
        return host.conversation.has_member(user)
    if isinstance(host, Submission):
        return host.contract.is_party(user)
    if isinstance(host, Ticket):
        return host.user_id == user.id or bool(user.is_staff)
    if isinstance(host, IDVerification):  # owner uploads; staff review the ID file (FR-PROF-6)
        return host.user_id == user.id or bool(user.is_staff)
    if isinstance(host, (PortfolioItem, Certificate)):  # owner manages their own gallery/credentials
        return host.profile.user_id == user.id
    return False
