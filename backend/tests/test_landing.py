"""CMS-controlled landing (FR-CMS): public /landing returns active sections + cards."""
import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.cms.models import LandingSection


@pytest.mark.django_db
def test_landing_public_after_seed():
    call_command("seed_landing")
    res = APIClient().get("/api/v1/landing")
    assert res.status_code == 200
    sections = res.json()["sections"]
    keys = {s["key"] for s in sections}
    assert {"hero", "features", "categories", "steps", "cta"} <= keys
    hero = next(s for s in sections if s["key"] == "hero")
    assert hero["cta_primary_link"] == "/jobs"
    feats = next(s for s in sections if s["key"] == "features")
    assert len(feats["cards"]) == 4


@pytest.mark.django_db
def test_inactive_section_hidden():
    call_command("seed_landing")
    LandingSection.objects.filter(key="cta").update(is_active=False)
    keys = {s["key"] for s in APIClient().get("/api/v1/landing").json()["sections"]}
    assert "cta" not in keys
