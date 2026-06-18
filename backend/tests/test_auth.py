"""Auth slice tests — Google SSO only (FR-AUTH-1..6), mode toggle (FR-MODE)."""
import pytest
from rest_framework.test import APIClient

from apps.accounts import services as account_services
from apps.accounts.models import User
from apps.core.services import set_setting

GOOGLE_PAYLOAD = {
    "sub": "g-123",
    "email": "ahmed@example.com",
    "email_verified": True,
    "given_name": "أحمد",
    "family_name": "السالم",
    "picture": "https://lh3.example/p.jpg",
}


@pytest.fixture()
def client():
    return APIClient()


@pytest.fixture()
def mock_google(monkeypatch):
    monkeypatch.setattr(account_services, "verify_google_token", lambda token: GOOGLE_PAYLOAD)


@pytest.mark.django_db
class TestGoogleAuth:
    def test_first_login_creates_account(self, client, mock_google):
        res = client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        assert res.status_code == 201
        body = res.json()
        assert body["first_login"] is True
        assert body["access"] and body["refresh"]
        user = User.objects.get(email="ahmed@example.com")
        assert user.google_sub == "g-123"
        assert not user.has_usable_password()  # FR-AUTH-1: no passwords for end users

    def test_second_login_same_account(self, client, mock_google):
        client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        res = client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        assert res.status_code == 200
        assert User.objects.filter(email="ahmed@example.com").count() == 1  # BR-1

    def test_registration_flag_blocks_new_users_only(self, client, mock_google):
        set_setting("registration.enabled", False)
        res = client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        assert res.status_code == 403  # FR-AUTH-5: new users blocked
        set_setting("registration.enabled", True)
        client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        set_setting("registration.enabled", False)
        res = client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        assert res.status_code == 200  # existing users still sign in

    def test_frozen_account_blocked(self, client, mock_google):
        client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        User.objects.filter(email="ahmed@example.com").update(status=User.Status.FROZEN)
        res = client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        assert res.status_code == 403  # FR-ADM-5


@pytest.mark.django_db
class TestMode:
    def _login(self, client, mock_google):
        res = client.post("/api/v1/auth/google", {"id_token": "x"}, format="json")
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.json()['access']}")

    def test_mode_toggle(self, client, mock_google):
        self._login(client, mock_google)
        res = client.patch("/api/v1/auth/me/mode", {"mode": "find_job"}, format="json")
        assert res.status_code == 200
        res = client.patch("/api/v1/auth/me/mode", {"mode": "find_worker"}, format="json")
        assert res.json()["active_mode"] == "find_worker"  # FR-MODE-2: instant, lossless

    def test_invalid_mode_rejected(self, client, mock_google):
        self._login(client, mock_google)
        res = client.patch("/api/v1/auth/me/mode", {"mode": "admin"}, format="json")
        assert res.status_code == 400

    def test_me_requires_auth(self, client):
        assert client.get("/api/v1/auth/me").status_code == 401
