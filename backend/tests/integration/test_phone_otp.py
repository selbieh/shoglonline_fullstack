"""Phone OTP verification flow (ppt slide-08) — fills the gap noted in the QA plan.

Covers: operator flag gate (off by default), happy-path request→verify, wrong-code
rejection, and lockout after OTP_MAX_ATTEMPTS. The code is read from `debug_code`,
which the service only returns when settings.DEBUG is on (dev convenience).
"""
import pytest

from apps.accounts.services import OTP_MAX_ATTEMPTS
from apps.core.services import set_setting

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

REQUEST = "/api/v1/auth/phone/request-otp"
VERIFY = "/api/v1/auth/phone/verify-otp"
PHONE = "+96550001234"


def test_request_requires_auth(api_client):
    resp = api_client.post(REQUEST, {"phone": PHONE}, format="json")
    assert resp.status_code in (401, 403)


def test_request_disabled_by_default(as_user, worker):
    """profiles.phone_verification defaults off → request is refused (BR / FR-PROF)."""
    resp = as_user(worker).post(REQUEST, {"phone": PHONE}, format="json")
    assert resp.status_code == 400
    assert b"phone_verification_disabled" in resp.content


def test_invalid_phone_rejected(as_user, worker):
    set_setting("profiles.phone_verification", True)
    resp = as_user(worker).post(REQUEST, {"phone": "123"}, format="json")
    assert resp.status_code == 400
    assert b"invalid_phone" in resp.content


def test_request_then_verify_marks_phone_verified(as_user, worker, settings):
    set_setting("profiles.phone_verification", True)
    settings.DEBUG = True  # so the service echoes debug_code
    client = as_user(worker)

    req = client.post(REQUEST, {"phone": PHONE}, format="json")
    assert req.status_code == 200
    assert req.json()["sent"] is True
    code = req.json()["debug_code"]

    res = client.post(VERIFY, {"code": code}, format="json")
    assert res.status_code == 200
    body = res.json()
    assert body["phone_verified"] is True
    assert body["phone"] == PHONE

    worker.refresh_from_db()
    assert worker.phone_verified is True


def test_wrong_code_then_lockout(as_user, worker, settings):
    set_setting("profiles.phone_verification", True)
    settings.DEBUG = True
    client = as_user(worker)

    real = client.post(REQUEST, {"phone": PHONE}, format="json").json()["debug_code"]
    wrong = "1234" if real != "1234" else "5678"

    for _ in range(OTP_MAX_ATTEMPTS):
        bad = client.post(VERIFY, {"code": wrong}, format="json")
        assert bad.status_code == 400
        assert b"otp_mismatch" in bad.content

    # One attempt past the cap → locked (cache cleared, must re-request).
    locked = client.post(VERIFY, {"code": wrong}, format="json")
    assert locked.status_code == 400
    assert b"otp_locked" in locked.content


def test_verify_without_request_is_expired(as_user, worker, settings):
    set_setting("profiles.phone_verification", True)
    settings.DEBUG = True
    resp = as_user(worker).post(VERIFY, {"code": "0000"}, format="json")
    assert resp.status_code == 400
    assert b"otp_expired" in resp.content
