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


def test_directory_filters_by_skill():
    """`?skill=<name_ar>` narrows the freelancer directory to workers who hold that catalog skill
    (the shared skill param used by the gallery / jobs filters too)."""
    from apps.catalog.models import Skill
    from apps.profiles.models import WorkerSkill

    react = Skill.objects.create(name_ar="React", slug="react")
    figma = Skill.objects.create(name_ar="Figma", slug="figma")

    dev = UserFactory(first_name="مبرمج")
    dev_profile = WorkerProfileFactory(user=dev, visibility=WorkerProfile.Visibility.ONLINE)
    WorkerSkill.objects.create(profile=dev_profile, skill=react)

    designer = UserFactory(first_name="مصمم")
    designer_profile = WorkerProfileFactory(user=designer, visibility=WorkerProfile.Visibility.ONLINE)
    WorkerSkill.objects.create(profile=designer_profile, skill=figma)

    ids = [r["id"] for r in APIClient().get("/api/v1/freelancers?skill=React").json()["results"]]
    assert ids == [dev.id]


def test_owner_preview_shows_unpublished_profile():
    """The owner can preview their own profile through the PUBLIC serializer even while it's a
    draft — rule D-1 keeps a draft off /freelancers/<id>, but the owner needs to see the employer
    view before publishing. Auth-scoped: it only ever returns the requesting user's own profile."""
    worker = UserFactory(first_name="سعيد")
    profile = WorkerProfile.objects.create(user=worker, bio_title="مطوّر")  # model default = DRAFT
    assert profile.publish_state == WorkerProfile.PublishState.DRAFT

    # The public detail endpoint hides the draft…
    assert APIClient().get(f"/api/v1/freelancers/{worker.id}").status_code == 404

    # …while the owner's authenticated preview returns it with the same public field shape the
    # employer profile page (and its JSON-LD) consumes.
    client = APIClient()
    client.force_authenticate(worker)
    resp = client.get("/api/v1/me/profile/preview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == worker.id
    assert data["bio_title"] == "مطوّر"
    for key in ("skills", "languages", "educations", "employments", "portfolio",
                "certificates", "reviews", "rating_avg", "is_verified"):
        assert key in data


def test_preview_requires_authentication():
    assert APIClient().get("/api/v1/me/profile/preview").status_code in (401, 403)


def test_preview_lazily_creates_profile_for_fresh_account():
    """A user who never opened /me/profile still gets a 200 (lazy get_or_create), not a 404."""
    worker = UserFactory()
    assert not WorkerProfile.objects.filter(user=worker).exists()
    client = APIClient()
    client.force_authenticate(worker)
    resp = client.get("/api/v1/me/profile/preview")
    assert resp.status_code == 200
    assert resp.json()["id"] == worker.id
    assert WorkerProfile.objects.filter(user=worker).exists()


def test_preview_never_leaks_contact():
    """The preview reuses the public serializer, so the private contact / email stay hidden even
    in the owner's own preview (mirrors the public-profile contact guarantee)."""
    worker = UserFactory(email="secret@example.com")
    profile = WorkerProfile.objects.create(user=worker)
    WorkerProfile.objects.filter(pk=profile.pk).update(
        private_contact_channel="whatsapp", private_contact_value="+96650000000"
    )
    client = APIClient()
    client.force_authenticate(worker)
    data = client.get("/api/v1/me/profile/preview").json()
    assert "private_contact_value" not in data
    assert "email" not in data
    blob = str(data)
    assert "+96650000000" not in blob
    assert "secret@example.com" not in blob


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
