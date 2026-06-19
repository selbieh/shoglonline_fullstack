"""Portfolio gallery (معرض الأعمال, FR-PROF-4): owner CRUD over /me/portfolio, public inline image
serving, writable experience/education/language sections, and the directory-card preview."""
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.profiles.models import PortfolioItem, WorkerProfile
from tests.factories import UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def online_worker():
    user = UserFactory()
    WorkerProfileFactory(user=user, visibility=WorkerProfile.Visibility.ONLINE)
    return user


def upload_png(user, name="work.png"):
    f = SimpleUploadedFile(name, PNG, content_type="image/png")
    res = auth(user).post("/api/v1/uploads", {"file": f}, format="multipart")
    assert res.status_code == 201, res.content
    return res.json()["id"]


# ----------------------------------------------------------------- owner CRUD
def test_create_link_item_appears_in_public_profile():
    user = online_worker()
    res = auth(user).post(
        "/api/v1/me/portfolio",
        {"title": "متجري", "media_type": "link", "url": "https://shop.example"},
        format="json",
    )
    assert res.status_code == 201, res.content
    assert res.json()["media_type"] == "link" and res.json()["url"] == "https://shop.example"

    detail = APIClient().get(f"/api/v1/freelancers/{user.id}").json()
    assert len(detail["portfolio"]) == 1
    assert detail["portfolio"][0]["title"] == "متجري"


def test_create_image_item_served_inline_publicly():
    user = online_worker()
    att_id = upload_png(user)
    res = auth(user).post(
        "/api/v1/me/portfolio",
        {"title": "تصميم", "media_type": "image", "attachment_ids": [att_id]},
        format="json",
    )
    assert res.status_code == 201, res.content
    image_url = res.json()["image_url"]
    assert image_url.endswith(f"/api/v1/freelancers/portfolio-media/{att_id}")

    # PUBLIC (unauthenticated) inline fetch works and is NOT a forced download
    media = APIClient().get(f"/api/v1/freelancers/portfolio-media/{att_id}")
    assert media.status_code == 200
    assert media["Content-Type"] == "image/png"
    assert "attachment" not in media.get("Content-Disposition", "")


def test_portfolio_media_rejects_non_portfolio_attachment():
    """A file linked to a non-portfolio host (or unlinked) must never leak via the public endpoint."""
    user = online_worker()
    att_id = upload_png(user)  # uploaded but never linked to a PortfolioItem
    assert APIClient().get(f"/api/v1/freelancers/portfolio-media/{att_id}").status_code == 404


def test_portfolio_media_hidden_when_worker_offline():
    user = UserFactory()
    WorkerProfileFactory(user=user, visibility=WorkerProfile.Visibility.OFFLINE)
    att_id = upload_png(user)
    item = PortfolioItem.objects.create(profile=user.worker_profile, title="x", media_type="image")
    from apps.attachments.services import attach
    attach([att_id], item, user)  # correctly linked, but the worker is offline → still hidden
    assert APIClient().get(f"/api/v1/freelancers/portfolio-media/{att_id}").status_code == 404


def test_delete_portfolio_item():
    user = online_worker()
    item = PortfolioItem.objects.create(profile=user.worker_profile, title="قديم")
    res = auth(user).delete(f"/api/v1/me/portfolio/{item.id}")
    assert res.status_code == 204
    assert not PortfolioItem.objects.filter(id=item.id).exists()


def test_cannot_delete_another_workers_item():
    owner = online_worker()
    other = online_worker()
    item = PortfolioItem.objects.create(profile=owner.worker_profile, title="ملك الغير")
    assert auth(other).delete(f"/api/v1/me/portfolio/{item.id}").status_code == 404
    assert PortfolioItem.objects.filter(id=item.id).exists()


def test_portfolio_requires_auth():
    assert APIClient().post("/api/v1/me/portfolio", {"title": "x"}, format="json").status_code == 401


# ----------------------------------------------------------------- writable sections
def test_experience_education_languages_are_writable():
    user = online_worker()
    res = auth(user).patch(
        "/api/v1/me/profile",
        {
            "employments": [{"company": "شركة", "job_title": "مطوّر", "period_from": "2021"}],
            "educations": [{"school": "جامعة", "degree": "بكالوريوس"}],
            "languages": [{"name": "العربية", "proficiency": "native"}],
        },
        format="json",
    )
    assert res.status_code == 200, res.content
    body = res.json()
    assert body["employments"][0]["job_title"] == "مطوّر"
    assert body["educations"][0]["school"] == "جامعة"
    assert body["languages"][0]["proficiency"] == "native"

    # replace-all semantics: a second PATCH swaps the list (mirrors `skills`)
    res = auth(user).patch(
        "/api/v1/me/profile", {"employments": []}, format="json"
    )
    assert res.json()["employments"] == []

    detail = APIClient().get(f"/api/v1/freelancers/{user.id}").json()
    assert detail["educations"][0]["degree"] == "بكالوريوس"


# ----------------------------------------------------------------- directory card preview
def test_card_list_exposes_portfolio_preview_and_count():
    user = online_worker()
    PortfolioItem.objects.create(
        profile=user.worker_profile, title="عمل بصورة", media_type="image",
        url="https://cdn.example/a.jpg",
    )
    PortfolioItem.objects.create(
        profile=user.worker_profile, title="رابط بلا صورة", media_type="link", url="https://x",
    )
    rows = APIClient().get("/api/v1/freelancers").json()["results"]
    card = next(r for r in rows if r["id"] == user.id)
    assert card["portfolio_count"] == 2
    # only items with a visual thumbnail show in the preview (the image-url item)
    assert [p["thumb"] for p in card["portfolio_preview"]] == ["https://cdn.example/a.jpg"]
