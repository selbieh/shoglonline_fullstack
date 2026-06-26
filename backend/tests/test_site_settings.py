"""Admin-controlled footer settings (FR-CMS): public /site-settings, singleton, hide-if-blank."""
import pytest
from rest_framework.test import APIClient

from apps.cms.models import SiteSettings


@pytest.mark.django_db
def test_site_settings_public_seeds_defaults():
    """First GET auto-creates the singleton with sensible defaults (good shape for testing)."""
    res = APIClient().get("/api/v1/site-settings")
    assert res.status_code == 200
    data = res.json()
    assert data["contact_email"] == "support@shoglonline.com"
    assert data["facebook_url"].startswith("https://")
    assert data["app_store_url"].startswith("https://")
    # Only one row ever exists.
    assert SiteSettings.objects.count() == 1


@pytest.mark.django_db
def test_blank_fields_returned_empty_so_frontend_hides_them():
    s = SiteSettings.load()
    s.contact_phone = ""
    s.twitter_url = ""
    s.google_play_url = ""
    s.save()
    data = APIClient().get("/api/v1/site-settings").json()
    assert data["contact_phone"] == ""
    assert data["twitter_url"] == ""
    assert data["google_play_url"] == ""
    # Untouched fields keep their values.
    assert data["contact_email"] == "support@shoglonline.com"


@pytest.mark.django_db
def test_singleton_save_pins_pk():
    a = SiteSettings.load()
    a.contact_email = "a@x.com"
    a.save()
    b = SiteSettings()  # a second instance...
    b.contact_email = "b@x.com"
    b.save()
    # ...overwrites the same row rather than creating a new one.
    assert SiteSettings.objects.count() == 1
    assert SiteSettings.load().contact_email == "b@x.com"


@pytest.mark.django_db
def test_public_endpoint_needs_no_auth():
    res = APIClient().get("/api/v1/site-settings")
    assert res.status_code == 200
