"""Public works gallery (معرض الأعمال): GET /api/v1/freelancers/portfolio aggregates every
portfolio item from online, active workers for the global gallery page. Each tile carries the
owning freelancer's identity (so it can link to the single-work showcase) and the endpoint mirrors
the portfolio-media visibility gate — offline / inactive workers' items are hidden."""
import pytest
from rest_framework.test import APIClient

from apps.catalog.models import Category
from apps.profiles.models import PortfolioItem, WorkerProfile
from tests.factories import UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

URL = "/api/v1/freelancers/portfolio"


def online_worker(category=None, **kwargs):
    user = UserFactory(**kwargs)
    WorkerProfileFactory(
        user=user, visibility=WorkerProfile.Visibility.ONLINE, main_category=category
    )
    return user


def test_gallery_lists_items_with_worker_identity():
    user = online_worker(first_name="سعيد", last_name="ا")
    item = PortfolioItem.objects.create(
        profile=user.worker_profile, title="عمل بصورة", media_type="image",
        url="https://cdn.example/a.jpg", project_type="تصميم", skills=["Figma"],
    )

    rows = APIClient().get(URL).json()["results"]
    row = next(r for r in rows if r["id"] == item.id)
    assert row["title"] == "عمل بصورة"
    assert row["thumb"] == "https://cdn.example/a.jpg"   # image item → external url is the thumbnail
    assert row["worker_id"] == user.id                   # → /freelancers/<worker_id>/portfolio/<id>
    assert row["worker_name"] == "سعيد ا"
    assert row["skills"] == ["Figma"]
    assert row["category"] is None                       # no discipline set → null (not an error)


def test_gallery_filters_by_category():
    design = Category.objects.create(name_ar="تصميم", slug="design")
    dev = Category.objects.create(name_ar="برمجة", slug="dev")
    d_user = online_worker(category=design)
    v_user = online_worker(category=dev)
    d_item = PortfolioItem.objects.create(profile=d_user.worker_profile, title="هوية بصرية")
    PortfolioItem.objects.create(profile=v_user.worker_profile, title="واجهة برمجية")

    rows = APIClient().get(f"{URL}?category={design.id}").json()["results"]
    assert [r["id"] for r in rows] == [d_item.id]
    assert rows[0]["category"] == {"id": design.id, "name": "تصميم", "slug": "design"}


def test_gallery_filters_by_skill():
    user = online_worker()
    react = PortfolioItem.objects.create(
        profile=user.worker_profile, title="تطبيق", skills=["React", "Node"]
    )
    PortfolioItem.objects.create(profile=user.worker_profile, title="تصميم", skills=["Figma"])

    rows = APIClient().get(f"{URL}?skill=React").json()["results"]
    assert [r["id"] for r in rows] == [react.id]


def test_gallery_hides_offline_workers():
    offline = UserFactory()
    WorkerProfileFactory(user=offline, visibility=WorkerProfile.Visibility.OFFLINE)
    PortfolioItem.objects.create(profile=offline.worker_profile, title="مخفي")

    assert APIClient().get(URL).json()["results"] == []  # the only item belongs to an offline worker


def test_gallery_filters_by_media_type_and_search():
    user = online_worker()
    img = PortfolioItem.objects.create(
        profile=user.worker_profile, title="لوحة فنية", media_type="image", url="https://cdn/x.jpg"
    )
    link = PortfolioItem.objects.create(
        profile=user.worker_profile, title="متجر إلكتروني", media_type="link", url="https://shop"
    )

    only_images = APIClient().get(f"{URL}?media_type=image").json()["results"]
    assert [r["id"] for r in only_images] == [img.id]

    found = APIClient().get(f"{URL}?search=متجر").json()["results"]
    assert [r["id"] for r in found] == [link.id]


def test_gallery_is_public_and_orders_by_views():
    user = online_worker()
    low = PortfolioItem.objects.create(profile=user.worker_profile, title="أقل", views_count=2)
    high = PortfolioItem.objects.create(profile=user.worker_profile, title="أكثر", views_count=50)

    resp = APIClient().get(f"{URL}?ordering=-views_count")  # unauthenticated visitor
    assert resp.status_code == 200
    assert [r["id"] for r in resp.json()["results"]] == [high.id, low.id]
