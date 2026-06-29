"""Public SEO worker profile (FR-PROF-4): the detail endpoint exposes cover/city/total_earned/
portfolio/reviews for the SEO page + JSON-LD; offline/inactive profiles are hidden."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.profiles.models import Address, PortfolioItem, WorkerProfile
from tests.factories import UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def test_public_profile_exposes_seo_fields():
    worker = UserFactory(first_name="سعيد")
    profile = WorkerProfileFactory(user=worker, visibility=WorkerProfile.Visibility.ONLINE)
    WorkerProfile.objects.filter(pk=profile.pk).update(
        cover_image="https://cdn/c.jpg", total_earned=Decimal("500"), overview="نبذة"
    )
    Address.objects.create(user=worker, country="KW", city="مدينة الكويت", is_primary=True)
    PortfolioItem.objects.create(profile=profile, title="مشروع", description="وصف")

    resp = APIClient().get(f"/api/v1/freelancers/{worker.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cover_image"] == "https://cdn/c.jpg"
    assert data["city"] == "مدينة الكويت"
    assert Decimal(str(data["total_earned"])) == Decimal("500")
    assert len(data["portfolio"]) == 1 and data["portfolio"][0]["title"] == "مشروع"
    assert "reviews" in data and isinstance(data["reviews"], list)
    assert "rating_avg" in data and "is_verified" in data  # aggregateRating inputs for JSON-LD


def test_offline_profile_is_hidden():
    worker = UserFactory()
    WorkerProfileFactory(user=worker, visibility=WorkerProfile.Visibility.OFFLINE)
    assert APIClient().get(f"/api/v1/freelancers/{worker.id}").status_code == 404


def test_signup_default_profile_is_not_published_as_freelancer():
    """A fresh signup gets a lazily auto-created profile that defaults to DRAFT (rule D-1) — it must
    NOT appear in the public directory or detail until the worker explicitly publishes it."""
    worker = UserFactory(first_name="جديد")
    # Simulate the lazy auto-create (what /me/profile does on first access): all defaults, ONLINE.
    profile = WorkerProfile.objects.create(user=worker)
    assert profile.publish_state == WorkerProfile.PublishState.DRAFT
    assert profile.visibility == WorkerProfile.Visibility.ONLINE  # online presence ≠ published

    # Hidden from both the directory list and the public detail page.
    ids = [r["id"] for r in APIClient().get("/api/v1/freelancers").json()["results"]]
    assert worker.id not in ids
    assert APIClient().get(f"/api/v1/freelancers/{worker.id}").status_code == 404

    # Once published, the same profile becomes publicly discoverable.
    profile.publish_state = WorkerProfile.PublishState.PUBLISHED
    profile.save(update_fields=["publish_state"])
    ids = [r["id"] for r in APIClient().get("/api/v1/freelancers").json()["results"]]
    assert worker.id in ids
    assert APIClient().get(f"/api/v1/freelancers/{worker.id}").status_code == 200


def test_city_blank_when_no_address():
    worker = UserFactory()
    WorkerProfileFactory(user=worker, visibility=WorkerProfile.Visibility.ONLINE)
    data = APIClient().get(f"/api/v1/freelancers/{worker.id}").json()
    assert data["city"] == ""


def test_public_profile_never_leaks_contact():
    """ppt slides 01/25: the public profile must contain NO external contact method. The private
    contact collected at onboarding (slide-02) is stored but must never be serialized publicly,
    and the email must never leak."""
    worker = UserFactory(email="secret@example.com")
    profile = WorkerProfileFactory(user=worker, visibility=WorkerProfile.Visibility.ONLINE)
    WorkerProfile.objects.filter(pk=profile.pk).update(
        private_contact_channel="whatsapp", private_contact_value="+96650000000"
    )

    data = APIClient().get(f"/api/v1/freelancers/{worker.id}").json()

    assert "private_contact_channel" not in data
    assert "private_contact_value" not in data
    assert "email" not in data
    # belt-and-suspenders: the raw values appear nowhere in the serialized payload
    blob = str(data)
    assert "+96650000000" not in blob
    assert "secret@example.com" not in blob
