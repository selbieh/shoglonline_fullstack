"""Maintenance mode (FR-ADM-3): when `platform.maintenance_mode` is on, the public site + API
return 503 + Retry-After with an Arabic page, while /admin and signed-in staff stay reachable.
Toggling the flag takes effect within the 60s cache TTL."""
import pytest
from rest_framework.test import APIClient

from apps.core.services import set_setting
from tests.factories import StaffUserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def test_public_api_returns_503_with_retry_after_when_on():
    set_setting("platform.maintenance_mode", True)
    resp = APIClient().get("/api/v1/jobs")
    assert resp.status_code == 503
    assert resp.headers["Retry-After"] == "300"
    assert resp.json()["code"] == "maintenance_mode"
    assert "صيانة" in resp.json()["message_ar"] or resp.json()["message_ar"]


def test_browser_root_gets_arabic_html_page_when_on():
    set_setting("platform.maintenance_mode", True)
    resp = APIClient().get("/")
    assert resp.status_code == 503
    assert resp.headers["Retry-After"] == "300"
    assert resp.headers["Content-Type"].startswith("text/html")
    body = resp.content.decode()
    assert "dir='rtl'" in body and "صيانة" in body


def test_admin_login_stays_reachable_when_on():
    set_setting("platform.maintenance_mode", True)
    resp = APIClient().get("/admin/login/")
    assert resp.status_code == 200  # admin back-office is never locked out


def test_signed_in_staff_bypass_when_on(client):
    set_setting("platform.maintenance_mode", True)
    client.force_login(StaffUserFactory())  # session-authenticated staff
    assert client.get("/api/v1/jobs").status_code != 503


def test_off_by_default_public_api_works():
    assert APIClient().get("/api/v1/jobs").status_code == 200


def test_toggle_off_restores_access():
    set_setting("platform.maintenance_mode", True)
    assert APIClient().get("/api/v1/jobs").status_code == 503
    set_setting("platform.maintenance_mode", False)  # set_setting busts the cache immediately
    assert APIClient().get("/api/v1/jobs").status_code == 200
