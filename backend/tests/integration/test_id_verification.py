"""National-ID verification (FR-PROF-6): upload → admin approve → is_verified badge surfaces on
the public profile + cards; reject carries a reason and leaves the badge off. The ID file is
owner/staff-scoped through the Part 03 attachment pipeline."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.profiles.models import IDVerification, WorkerProfile
from apps.profiles.services import review_id_verification
from tests.factories import StaffUserFactory, UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64  # valid PNG signature for the magic-byte sniffer


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _upload_id(user):
    file = SimpleUploadedFile("id.png", PNG, content_type="image/png")
    resp = auth(user).post("/api/v1/uploads", {"file": file}, format="multipart")
    assert resp.status_code == 201, resp.content
    return resp.json()["id"]


def test_upload_then_admin_approve_sets_badge():
    worker = UserFactory()
    WorkerProfileFactory(user=worker, visibility=WorkerProfile.Visibility.ONLINE)
    att_id = _upload_id(worker)

    submit = auth(worker).post("/api/v1/me/id-verification", {"attachment_ids": [att_id]}, format="json")
    assert submit.status_code == 201
    assert submit.json()["status"] == IDVerification.Status.PENDING

    idv = IDVerification.objects.get(user=worker)
    review_id_verification(idv, approve=True, reviewer=StaffUserFactory())

    assert WorkerProfile.objects.get(user=worker).is_verified is True
    # badge surfaces on the public detail endpoint
    pub = APIClient().get(f"/api/v1/freelancers/{worker.pk}")
    assert pub.status_code == 200
    assert pub.json()["is_verified"] is True


def test_reject_requires_reason_and_keeps_badge_off():
    worker = UserFactory()
    WorkerProfileFactory(user=worker)
    att_id = _upload_id(worker)
    auth(worker).post("/api/v1/me/id-verification", {"attachment_ids": [att_id]}, format="json")
    idv = IDVerification.objects.get(user=worker)

    from rest_framework.exceptions import ValidationError
    with pytest.raises(ValidationError):
        review_id_verification(idv, approve=False, reviewer=StaffUserFactory(), reason="")

    review_id_verification(idv, approve=False, reviewer=StaffUserFactory(), reason="الصورة غير واضحة")
    idv.refresh_from_db()
    assert idv.status == IDVerification.Status.REJECTED
    assert idv.reject_reason == "الصورة غير واضحة"
    assert WorkerProfile.objects.get(user=worker).is_verified is False


def test_resubmission_resets_to_pending():
    worker = UserFactory()
    WorkerProfileFactory(user=worker)
    att_id = _upload_id(worker)
    auth(worker).post("/api/v1/me/id-verification", {"attachment_ids": [att_id]}, format="json")
    idv = IDVerification.objects.get(user=worker)
    review_id_verification(idv, approve=False, reviewer=StaffUserFactory(), reason="غير مقروء")

    att2 = _upload_id(worker)
    resp = auth(worker).post("/api/v1/me/id-verification", {"attachment_ids": [att2]}, format="json")
    assert resp.status_code == 201
    assert resp.json()["status"] == IDVerification.Status.PENDING
    assert IDVerification.objects.filter(user=worker).count() == 1  # one record per user

    # the previous ID file is retired (soft-deleted); only the new one stays live
    from apps.attachments.models import Attachment
    assert Attachment.objects.get(pk=att_id).is_deleted is True
    assert Attachment.objects.get(pk=att2).is_deleted is False


def test_submit_requires_a_file():
    worker = UserFactory()
    resp = auth(worker).post("/api/v1/me/id-verification", {"attachment_ids": []}, format="json")
    assert resp.status_code == 400
    assert resp.json()["code"] == "file_required"


def test_id_file_is_owner_or_staff_scoped():
    worker = UserFactory()
    att_id = _upload_id(worker)
    auth(worker).post("/api/v1/me/id-verification", {"attachment_ids": [att_id]}, format="json")

    # a random user cannot download the ID file (existence hidden → 404)
    assert auth(UserFactory()).get(f"/api/v1/uploads/{att_id}").status_code == 404
    # owner and staff can
    assert auth(worker).get(f"/api/v1/uploads/{att_id}").status_code == 200
    assert auth(StaffUserFactory()).get(f"/api/v1/uploads/{att_id}").status_code == 200


def test_status_endpoint_reports_none_before_submission():
    worker = UserFactory()
    resp = auth(worker).get("/api/v1/me/id-verification")
    assert resp.status_code == 200
    assert resp.json()["status"] == "none"
