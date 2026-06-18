"""Affiliate completeness (FR-AFF-1/2/3, AC-10): click tracking, click→registration→transaction
attribution within the window, self-referral void (BR-21), editable+unique slug, share + stats."""
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.affiliate import services as af
from apps.affiliate.models import AffiliateClick, AffiliateCommission, CommissionRule
from apps.contracts.models import Contract
from tests.factories import UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_click_recorded_for_known_slug_only():
    referrer = UserFactory()
    profile = af.get_or_create_profile(referrer)
    ok = APIClient().post("/api/v1/affiliate/click", {"slug": profile.slug}, format="json")
    assert ok.status_code == 200 and ok.json()["recorded"] is True
    assert AffiliateClick.objects.filter(referrer=referrer).count() == 1

    miss = APIClient().post("/api/v1/affiliate/click", {"slug": "does-not-exist"}, format="json")
    assert miss.json()["recorded"] is False


def test_click_to_registration_to_transaction_within_window():
    referrer = UserFactory()
    profile = af.get_or_create_profile(referrer)
    af.record_click(profile.slug)                       # 1. click
    employer = UserFactory()
    assert af.attribute(employer, profile.slug) is not None  # 2. registration attributed
    assert AffiliateClick.objects.get(referrer=referrer).referred_user_id == employer.id  # click converted

    worker = UserFactory()
    contract = Contract.objects.create(
        employer=employer, worker=worker, title="t", budget=Decimal("100"),
        commission_pct=Decimal("10"), commission_amount=Decimal("10"), worker_earning=Decimal("90"),
        status=Contract.Status.COMPLETED, completed_at=timezone.now(),
    )
    CommissionRule.objects.create(applies_to="any", min_amount=0, max_amount=1000, rate_pct=Decimal("20"))
    af.accrue_for_contract(contract)                    # 3. transaction → commission

    assert AffiliateCommission.objects.filter(referrer=referrer).count() == 1
    assert af.stats(referrer)["transactions"] == 1


def test_self_referral_void():
    referrer = UserFactory()
    profile = af.get_or_create_profile(referrer)
    assert af.attribute(referrer, profile.slug) is None  # BR-21


def test_editable_slug_validation_and_uniqueness():
    user, other = UserFactory(), UserFactory()
    af.get_or_create_profile(user)
    other_profile = af.get_or_create_profile(other)

    ok = auth(user).patch("/api/v1/me/affiliate/slug", {"slug": "my-cool-link"}, format="json")
    assert ok.status_code == 200 and ok.json()["slug"] == "my-cool-link"

    assert auth(user).patch("/api/v1/me/affiliate/slug", {"slug": "ab"}, format="json").status_code == 400  # too short
    assert auth(user).patch("/api/v1/me/affiliate/slug", {"slug": "Bad Slug!"}, format="json").status_code == 400
    assert auth(user).patch("/api/v1/me/affiliate/slug", {"slug": "admin"}, format="json").status_code == 400  # reserved
    taken = auth(user).patch("/api/v1/me/affiliate/slug", {"slug": other_profile.slug}, format="json")
    assert taken.status_code == 400 and taken.json()["code"] == "slug_taken"


def test_stats_and_share_links():
    referrer = UserFactory()
    profile = af.get_or_create_profile(referrer)
    af.record_click(profile.slug)
    af.attribute(UserFactory(), profile.slug)

    stats = auth(referrer).get("/api/v1/me/affiliate/stats").json()
    assert stats["clicks"] == 1 and stats["registrations"] == 1
    assert stats["referral_link"].endswith(f"/r/{profile.slug}")
    assert set(stats["share"]) == {"facebook", "x", "whatsapp"}
