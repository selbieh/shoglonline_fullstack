"""Attachment pipeline (Part 03, FR-*-files): upload→attach→download round-trip, server-side
size/MIME enforcement with Arabic errors, owner/host-party download scoping, and the kill-switch."""
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.attachments.models import Attachment
from apps.contracts import services as csvc
from apps.contracts.models import Contract
from apps.core.services import set_setting
from tests.factories import ContractFactory, ConversationFactory, TicketFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def upload(user, *, content=PNG, name="pic.png", content_type="image/png"):
    f = SimpleUploadedFile(name, content, content_type=content_type)
    return auth(user).post("/api/v1/uploads", {"file": f}, format="multipart")


# ----------------------------------------------------------------- upload validation
def test_upload_returns_metadata_and_scoped_url():
    res = upload(UserFactory())
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["kind"] == "image"
    assert body["content_type"] == "image/png"
    assert body["size"] == len(PNG)
    assert body["url"].endswith(f"/api/v1/uploads/{body['id']}")  # scoped endpoint, not media path


def test_upload_requires_authentication():
    f = SimpleUploadedFile("x.png", PNG, content_type="image/png")
    assert APIClient().post("/api/v1/uploads", {"file": f}, format="multipart").status_code == 401


def test_missing_file_rejected():
    res = auth(UserFactory()).post("/api/v1/uploads", {}, format="multipart")
    assert res.status_code == 400
    assert res.json()["code"] == "file_required"


def test_oversize_rejected_with_arabic_error():
    set_setting("uploads.max_file_mb", 1)
    big = b"x" * (1024 * 1024 + 10)
    res = upload(UserFactory(), content=big, name="big.png")
    assert res.status_code == 400
    assert res.json()["code"] == "file_too_large"
    assert res.json()["message_ar"]


def test_blocked_mime_rejected():
    res = upload(UserFactory(), content=b"MZ...", name="virus.exe", content_type="application/x-msdownload")
    assert res.status_code == 400
    assert res.json()["code"] == "file_type_blocked"


def test_disguised_file_rejected_by_magic_bytes():
    # claims image/png but the bytes are a script — magic-byte sniff catches the lie
    res = upload(UserFactory(), content=b"<script>alert(1)</script>", name="x.png", content_type="image/png")
    assert res.status_code == 400
    assert res.json()["code"] == "file_type_blocked"


def test_webm_voice_note_classified_as_audio(mocker):
    """MediaRecorder voice notes are webm containers whose magic bytes sniff as video/webm. When the
    client claims audio/*, trust it so the voice note classifies as AUDIO, not VIDEO (FR-CHAT-4)."""
    mocker.patch("apps.attachments.services._detect_mime", return_value="video/webm")
    res = upload(UserFactory(), name="voice.webm", content_type="audio/webm")
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["kind"] == "audio"
    assert body["content_type"] == "audio/webm"


def test_disguised_audio_webm_classified_by_real_bytes(mocker):
    # claims audio/webm but the bytes are a PNG (a different container family) → the audio claim is
    # NOT blindly trusted; it's classified by what the sniffer actually found.
    mocker.patch("apps.attachments.services._detect_mime", return_value="image/png")
    res = upload(UserFactory(), name="fake.webm", content_type="audio/webm")
    assert res.status_code == 201, res.content
    assert res.json()["kind"] == "image"


def test_kill_switch_disables_uploads():
    set_setting("uploads.enabled", False)
    res = upload(UserFactory())
    assert res.status_code == 400
    assert res.json()["code"] == "uploads_disabled"


# ----------------------------------------------------------------- download scoping
def test_owner_can_download_unlinked_attachment():
    owner = UserFactory()
    att_id = upload(owner).json()["id"]
    res = auth(owner).get(f"/api/v1/uploads/{att_id}")
    assert res.status_code == 200


def test_stranger_cannot_download_unlinked_attachment_404():
    owner = UserFactory()
    att_id = upload(owner).json()["id"]
    res = auth(UserFactory()).get(f"/api/v1/uploads/{att_id}")
    assert res.status_code == 404  # existence hidden from non-owners


def test_chat_attachment_round_trip_and_party_scope():
    conv = ConversationFactory()
    sender, recipient, stranger = conv.user_a, conv.user_b, UserFactory()
    att_id = upload(sender).json()["id"]

    msg = auth(sender).post(f"/api/v1/conversations/{conv.pk}/messages",
                            {"body": "ملف", "attachment_ids": [att_id]}, format="json")
    assert msg.status_code == 201
    assert msg.json()["attachments"][0]["id"] == att_id   # exposed on the message

    assert auth(recipient).get(f"/api/v1/uploads/{att_id}").status_code == 200  # the other party
    assert auth(stranger).get(f"/api/v1/uploads/{att_id}").status_code == 404   # outsider denied


def test_submission_attachment_scoped_to_contract_parties(fund_wallet):
    employer, worker = UserFactory(), UserFactory()
    commission, earning = csvc.compute_commission(Decimal("100"), Decimal("10"))
    c = ContractFactory(employer=employer, worker=worker, budget=Decimal("100"),
                        commission_pct=Decimal("10"), commission_amount=commission, worker_earning=earning)
    fund_wallet(employer, "100")
    c = csvc.try_fund(c)
    assert c.status == Contract.Status.ACTIVE

    att_id = upload(worker).json()["id"]
    res = auth(worker).post(f"/api/v1/contracts/{c.pk}/submissions",
                            {"notes": "تسليم", "attachment_ids": [att_id]}, format="json")
    assert res.status_code == 201

    assert auth(employer).get(f"/api/v1/uploads/{att_id}").status_code == 200  # the employer (party)
    assert auth(UserFactory()).get(f"/api/v1/uploads/{att_id}").status_code == 404


def test_ticket_attachment_scoped_to_owner_and_staff():
    owner, staff, stranger = UserFactory(), UserFactory(is_staff=True), UserFactory()
    att_id = upload(owner).json()["id"]
    from apps.attachments.services import attach
    ticket = TicketFactory(user=owner)
    attach([att_id], ticket, owner)
    assert auth(owner).get(f"/api/v1/uploads/{att_id}").status_code == 200
    assert auth(staff).get(f"/api/v1/uploads/{att_id}").status_code == 200    # support can view
    assert auth(stranger).get(f"/api/v1/uploads/{att_id}").status_code == 404


@pytest.mark.parametrize("content_type,expected", [
    ("image/png", "image"),
    ("video/mp4", "video"),
    ("audio/mpeg", "audio"),
    ("application/pdf", "document"),
    ("application/zip", "archive"),
    ("text/plain", "document"),
])
def test_kind_detection(content_type, expected):
    from apps.attachments.services import kind_for
    assert kind_for(content_type) == expected


# ----------------------------------------------------------------- linking guarantees
def test_attach_ignores_another_users_attachment():
    """A caller cannot link someone else's attachment to their own host (no hijack)."""
    from apps.attachments.services import attach
    owner, attacker = UserFactory(), UserFactory()
    att_id = upload(owner).json()["id"]
    ticket = TicketFactory(user=attacker)
    linked = attach([att_id], ticket, attacker)  # attacker is not the owner
    assert linked == []
    assert Attachment.objects.get(pk=att_id).host_type_id is None  # stays unlinked


def test_attach_refuses_host_owner_is_not_party_of():
    """The owner-must-be-party invariant: linking to a host you're not part of links nothing."""
    from apps.attachments.services import attach
    uploader = UserFactory()
    att_id = upload(uploader).json()["id"]
    others_ticket = TicketFactory(user=UserFactory())  # a ticket the uploader is NOT party to
    assert attach([att_id], others_ticket, uploader) == []
    assert Attachment.objects.get(pk=att_id).host_type_id is None


def test_too_many_files_per_host_rejected():
    set_setting("uploads.max_per_host", 2)
    conv = ConversationFactory()
    ids = [upload(conv.user_a).json()["id"] for _ in range(3)]
    res = auth(conv.user_a).post(f"/api/v1/conversations/{conv.pk}/messages",
                                 {"body": "كثير", "attachment_ids": ids}, format="json")
    assert res.status_code == 400
    assert res.json()["code"] == "too_many_files"


def test_orphan_sweep_removes_unlinked_only():
    from datetime import timedelta

    from django.utils import timezone

    from apps.attachments.services import attach
    from apps.attachments.tasks import sweep_orphan_attachments

    owner = UserFactory()
    stale = upload(owner).json()["id"]          # old + unlinked → swept
    recent = upload(owner).json()["id"]         # unlinked but recent → kept
    linked = upload(owner).json()["id"]         # old but linked → kept
    attach([linked], TicketFactory(user=owner), owner)
    old = timezone.now() - timedelta(hours=48)
    Attachment.objects.filter(pk__in=[stale, linked]).update(created_at=old)

    assert sweep_orphan_attachments() == 1
    assert Attachment.objects.get(pk=stale).is_deleted is True
    assert Attachment.objects.get(pk=recent).is_deleted is False
    assert Attachment.objects.get(pk=linked).is_deleted is False


def test_attach_is_idempotent_no_reparent():
    """An already-linked attachment is never re-parented to a second host."""
    from apps.attachments.services import attach
    owner = UserFactory()
    att_id = upload(owner).json()["id"]
    t1, t2 = TicketFactory(user=owner), TicketFactory(user=owner)
    assert len(attach([att_id], t1, owner)) == 1
    assert attach([att_id], t2, owner) == []  # already linked → skipped
    att = Attachment.objects.get(pk=att_id)
    assert att.object_id == t1.pk
