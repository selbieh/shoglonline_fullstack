"""Google token verification + provisioning branches (FR-AUTH-3/5/6, BR-1) that the
endpoint suite skips by monkeypatching verify_google_token."""
import pytest
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

from apps.accounts import services as svc
from apps.accounts.models import User
from tests.factories import UserFactory

pytestmark = [pytest.mark.unit, pytest.mark.django_db, pytest.mark.srs("FR-AUTH-3")]

REAL_PAYLOAD = {
    "sub": "g-real-1", "email": "real@example.com", "email_verified": True,
    "given_name": "حقيقي", "family_name": "مستخدم", "picture": "",
}


# ------------------------------------------------------------- verify_google_token
def test_stub_token_accepted_when_stub_enabled(settings):
    settings.GOOGLE_AUTH_STUB = True
    payload = svc.verify_google_token("stub:dev@example.com")
    assert payload["email"] == "dev@example.com"
    assert payload["sub"] == "stub-dev@example.com"
    assert payload["email_verified"] is True


def test_real_token_verified_via_google(settings, mocker):
    settings.GOOGLE_AUTH_STUB = False
    settings.GOOGLE_OAUTH_CLIENT_ID = "client-123"
    mocker.patch("google.oauth2.id_token.verify_oauth2_token", return_value=REAL_PAYLOAD)
    assert svc.verify_google_token("real-token")["email"] == "real@example.com"


def test_unverified_email_is_rejected(settings, mocker):
    settings.GOOGLE_AUTH_STUB = False
    settings.GOOGLE_OAUTH_CLIENT_ID = "client-123"
    mocker.patch("google.oauth2.id_token.verify_oauth2_token",
                 return_value={**REAL_PAYLOAD, "email_verified": False})
    with pytest.raises(AuthenticationFailed):
        svc.verify_google_token("real-token")


def test_bad_signature_is_rejected(settings, mocker):
    settings.GOOGLE_AUTH_STUB = False
    settings.GOOGLE_OAUTH_CLIENT_ID = "client-123"
    mocker.patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("bad aud"))
    with pytest.raises(AuthenticationFailed):
        svc.verify_google_token("tampered")


def test_missing_client_id_raises(settings):
    settings.GOOGLE_AUTH_STUB = False
    settings.GOOGLE_OAUTH_CLIENT_ID = ""
    with pytest.raises(AuthenticationFailed):
        svc.verify_google_token("anything")


# ------------------------------------------------------- authenticate_google_user
def test_deleted_account_cannot_sign_in(mocker):
    UserFactory(email="real@example.com", status=User.Status.DELETED)
    mocker.patch.object(svc, "verify_google_token", return_value=REAL_PAYLOAD)
    with pytest.raises(PermissionDenied):
        svc.authenticate_google_user("real-token")


def test_existing_account_without_sub_gets_linked(mocker):
    UserFactory(email="real@example.com", google_sub=None)
    mocker.patch.object(svc, "verify_google_token", return_value=REAL_PAYLOAD)
    user, created = svc.authenticate_google_user("real-token")
    assert created is False
    user.refresh_from_db()
    assert user.google_sub == "g-real-1"  # staff identity linked on first SSO
