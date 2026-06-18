"""Global settings exposure (BR-19) + profile lazy creation (SRS §10.1)."""
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.services import get_setting, set_setting


@pytest.fixture()
def auth_client():
    user = User.objects.create_user(email="w@example.com", active_mode="find_job")
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
class TestPublicSettings:
    def test_public_flags_exposed(self):
        res = APIClient().get("/api/v1/settings/public")
        assert res.status_code == 200
        body = res.json()
        assert body["registration.enabled"] is True
        assert body["contracts.warranty_days"] == 60
        # non-public keys must never leak (BR-19)
        assert "proposals.auto_publish" not in body

    def test_setting_change_visible(self):
        set_setting("platform.maintenance_mode", True)
        assert get_setting("platform.maintenance_mode") is True
        res = APIClient().get("/api/v1/settings/public")
        assert res.json()["platform.maintenance_mode"] is True


@pytest.mark.django_db
class TestWorkerProfile:
    def test_lazy_creation_and_patch(self, auth_client):
        res = auth_client.get("/api/v1/me/profile")
        assert res.status_code == 200
        assert res.json()["completeness_pct"] == 0
        res = auth_client.patch(
            "/api/v1/me/profile",
            {"bio_title": "مصمم UI/UX", "expertise_level": "expert", "hourly_rate": "15.00"},
            format="json",
        )
        assert res.status_code == 200
        assert res.json()["bio_title"] == "مصمم UI/UX"
        assert res.json()["completeness_pct"] > 0

    def test_profile_requires_auth(self):
        assert APIClient().get("/api/v1/me/profile").status_code == 401
