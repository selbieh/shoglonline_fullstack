"""Avatar pipeline (FR-PROF-1): an uploaded image is set as the avatar by id, linked to the User
host (so it survives the orphan sweep) and served PUBLICLY inline so a plain <img> can render it —
unlike the scoped, auth-gated /uploads/<id> download URL the client must NEVER persist as avatar."""
from datetime import timedelta

import pytest
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.attachments.models import Attachment
from apps.attachments.tasks import sweep_orphan_attachments
from tests.factories import UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def upload_image(user, name="me.png"):
    f = SimpleUploadedFile(name, PNG, content_type="image/png")
    res = auth(user).post("/api/v1/uploads", {"file": f}, format="multipart")
    assert res.status_code == 201, res.content
    return res.json()["id"]


def set_avatar(user, attachment_id):
    return auth(user).patch("/api/v1/auth/me", {"avatar_attachment_id": attachment_id}, format="json")


# ----------------------------------------------------------------- set + public serve
def test_set_avatar_links_attachment_and_returns_public_url():
    user = UserFactory()
    att_id = upload_image(user)
    res = set_avatar(user, att_id)
    assert res.status_code == 200, res.content
    url = res.json()["avatar_url"]
    assert url.endswith(f"/auth/avatars/{att_id}")  # public inline endpoint, NOT /uploads/<id>

    # the attachment is now hosted by the User → not an orphan
    att = Attachment.objects.get(pk=att_id)
    assert att.host_type == ContentType.objects.get_for_model(User)
    assert att.object_id == user.id


def test_avatar_is_served_inline_to_anyone_unauthenticated():
    user = UserFactory()
    att_id = upload_image(user)
    set_avatar(user, att_id)
    # a plain <img> sends no Authorization header — the public endpoint must still serve it, inline
    res = APIClient().get(f"/api/v1/auth/avatars/{att_id}")
    assert res.status_code == 200
    assert res["Content-Type"] == "image/png"
    assert "attachment" not in res.get("Content-Disposition", "")  # inline, not a download


def test_avatar_endpoint_404s_for_a_non_avatar_attachment():
    user = UserFactory()
    att_id = upload_image(user)  # uploaded but never set as avatar → not User-hosted
    assert APIClient().get(f"/api/v1/auth/avatars/{att_id}").status_code == 404


def test_linked_avatar_survives_the_orphan_sweep():
    user = UserFactory()
    att_id = upload_image(user)
    set_avatar(user, att_id)
    Attachment.objects.filter(pk=att_id).update(created_at=timezone.now() - timedelta(hours=48))
    sweep_orphan_attachments()
    assert Attachment.objects.get(pk=att_id).is_deleted is False  # linked → kept


# ----------------------------------------------------------------- replace + clear
def test_replacing_avatar_retires_the_previous_one():
    user = UserFactory()
    first = upload_image(user, "old.png")
    set_avatar(user, first)
    second = upload_image(user, "new.png")
    res = set_avatar(user, second)
    assert res.json()["avatar_url"].endswith(f"/auth/avatars/{second}")
    assert Attachment.objects.get(pk=first).is_deleted is True   # old retired
    assert Attachment.objects.get(pk=second).is_deleted is False
    assert APIClient().get(f"/api/v1/auth/avatars/{first}").status_code == 404
    assert APIClient().get(f"/api/v1/auth/avatars/{second}").status_code == 200


def test_clearing_avatar_empties_url_and_retires_the_file():
    user = UserFactory()
    att_id = upload_image(user)
    set_avatar(user, att_id)
    res = set_avatar(user, None)
    assert res.status_code == 200
    assert res.json()["avatar_url"] == ""
    assert Attachment.objects.get(pk=att_id).is_deleted is True


# ----------------------------------------------------------------- guard rails
def test_avatar_url_is_read_only_cannot_be_set_directly():
    """Clients must not inject an arbitrary (or scoped /uploads) URL as their avatar."""
    user = UserFactory()
    res = auth(user).patch("/api/v1/auth/me", {"avatar_url": "https://evil.example/x.png"}, format="json")
    assert res.status_code == 200
    user.refresh_from_db()
    assert user.avatar_url == ""  # ignored — read-only


def test_cannot_set_another_users_upload_as_avatar():
    owner, attacker = UserFactory(), UserFactory()
    att_id = upload_image(owner)
    res = set_avatar(attacker, att_id)  # attacker doesn't own the attachment
    assert res.status_code == 400
    assert res.json()["code"] == "avatar_invalid"
    assert Attachment.objects.get(pk=att_id).host_type_id is None  # stays unlinked
