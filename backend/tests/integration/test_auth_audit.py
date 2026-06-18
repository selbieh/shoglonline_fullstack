"""Auth audit (FR-AUTH-7): sign-up / login / logout / refresh / failure events are recorded to
AuditLog consistently."""
import pytest
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.models import AuditLog
from tests.factories import UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


@override_settings(GOOGLE_AUTH_STUB=True)
def test_signup_and_login_are_audited():
    client = APIClient()
    signup = client.post("/api/v1/auth/google", {"id_token": "stub:new@example.com"}, format="json")
    assert signup.status_code == 201
    assert AuditLog.objects.filter(action="auth.google_signup").exists()

    login = client.post("/api/v1/auth/google", {"id_token": "stub:new@example.com"}, format="json")
    assert login.status_code == 200
    assert AuditLog.objects.filter(action="auth.google_login").exists()


def test_failed_login_is_audited():
    # GOOGLE_AUTH_STUB is off in test settings → a bogus token is rejected and audited
    resp = APIClient().post("/api/v1/auth/google", {"id_token": "bogus"}, format="json")
    assert resp.status_code in (401, 403)
    assert AuditLog.objects.filter(action="auth.login_failed").exists()


def test_logout_is_audited():
    user = UserFactory()
    refresh = str(RefreshToken.for_user(user))
    client = APIClient()
    client.force_authenticate(user)
    resp = client.post("/api/v1/auth/logout", {"refresh": refresh}, format="json")
    assert resp.status_code == 204
    assert AuditLog.objects.filter(action="auth.logout", actor=user).exists()


def test_refresh_is_audited():
    user = UserFactory()
    refresh = str(RefreshToken.for_user(user))
    resp = APIClient().post("/api/v1/auth/refresh", {"refresh": refresh}, format="json")
    assert resp.status_code == 200
    assert AuditLog.objects.filter(action="auth.refresh", actor=user).exists()
