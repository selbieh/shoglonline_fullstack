"""Email OTP login/signup (FR-AUTH) — passwordless login side-by-side with Google SSO.

Covers: request/verify happy path, account unification across methods (the central guarantee),
single-use, brute-force lockout that survives re-request, rate/daily caps, registration + frozen
gates, the split-brain conflict guard, and the kill-switch. Codes are read from the DB row
(`EmailLoginCode`) — the API never echoes them (no debug_code), and test settings run DEBUG=False.
"""
import pytest

from apps.accounts import services as account_services
from apps.accounts.models import EmailLoginCode, User
from apps.bids.models import BidLedger
from apps.core.services import set_setting
from apps.notifications.models import Notification

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

REQUEST = "/api/v1/auth/email/request-otp"
VERIFY = "/api/v1/auth/email/verify-otp"
GOOGLE = "/api/v1/auth/google"
EMAIL = "sara@example.com"


def _code(email=EMAIL):
    return EmailLoginCode.objects.filter(email__iexact=email).latest("created_at").code


def _request(client, email=EMAIL):
    return client.post(REQUEST, {"email": email}, format="json")


def _verify(client, email=EMAIL, code=None):
    return client.post(VERIFY, {"email": email, "code": code or _code(email)}, format="json")


@pytest.fixture(autouse=True)
def _no_throttle(monkeypatch):
    """Disable the view-level ScopedRateThrottle for logic tests (one test re-enables it)."""
    from apps.accounts.api import views

    monkeypatch.setattr(views.EmailOTPRequestView, "throttle_classes", [])
    monkeypatch.setattr(views.EmailOTPVerifyView, "throttle_classes", [])


@pytest.fixture
def google_login(monkeypatch):
    """Log a user in via the Google path (stubbed token) for a given sub/email."""
    def _login(client, *, sub, email):
        payload = {"sub": sub, "email": email, "email_verified": True,
                   "given_name": "G", "family_name": "U", "picture": ""}
        monkeypatch.setattr(account_services, "verify_google_token", lambda token: payload)
        return client.post(GOOGLE, {"id_token": "x"}, format="json")
    return _login


# --------------------------------------------------------------------------- request
def test_request_is_public_and_uniform(api_client):
    resp = _request(api_client)
    assert resp.status_code == 200
    assert resp.json() == {"sent": True}  # no debug_code, no enumeration
    assert EmailLoginCode.objects.filter(email=EMAIL).count() == 1


def test_code_is_complex_7_chars(api_client):
    """FR-AUTH: code is 7 chars mixing letters, digits and special characters."""
    _request(api_client)
    code = _code()
    assert len(code) == 7
    assert any(c.isdigit() for c in code)
    assert any(c.isalpha() for c in code)
    assert any(not c.isalnum() for c in code)


def test_request_invalid_email(api_client):
    resp = api_client.post(REQUEST, {"email": "not-an-email"}, format="json")
    assert resp.status_code == 400
    assert b"invalid_email" in resp.content


def test_request_resend_gap(api_client):
    assert _request(api_client).status_code == 200
    again = _request(api_client)
    assert again.status_code == 400
    assert b"otp_too_soon" in again.content


def test_disabled_flag_blocks_request_and_verify(api_client):
    set_setting("auth.email_otp_enabled", False)
    r = _request(api_client)
    assert r.status_code == 400 and b"otp_disabled" in r.content
    v = api_client.post(VERIFY, {"email": EMAIL, "code": "000000"}, format="json")
    assert v.status_code == 400 and b"otp_disabled" in v.content


# --------------------------------------------------------------------------- verify (signup)
def test_verify_new_email_signs_up(api_client):
    _request(api_client)
    resp = _verify(api_client)
    assert resp.status_code == 201
    body = resp.json()
    assert body["first_login"] is True
    assert body["access"] and body["refresh"]
    assert body["user"]["email"] == EMAIL

    user = User.objects.get(email=EMAIL)
    assert not user.has_usable_password()              # no passwords for end users
    assert user.terms_accepted_at is not None          # consent stamped
    assert user.google_sub is None                     # OTP signup has no google identity yet
    # exactly one signup grant + a welcome notification
    assert BidLedger.objects.filter(user=user, reason=BidLedger.Reason.SIGNUP_GRANT).count() == 1
    assert Notification.objects.filter(user=user).exists()


def test_code_is_single_use(api_client):
    _request(api_client)
    code = _code()
    assert _verify(api_client, code=code).status_code == 201
    again = _verify(api_client, code=code)
    assert again.status_code == 400 and b"otp_expired" in again.content


def test_verify_without_request_is_expired(api_client):
    resp = api_client.post(VERIFY, {"email": EMAIL, "code": "000000"}, format="json")
    assert resp.status_code == 400 and b"otp_expired" in resp.content


# --------------------------------------------------------------------------- unification (core)
def test_otp_then_google_is_one_account(api_client, google_login):
    _request(api_client)
    _verify(api_client)
    uid = User.objects.get(email=EMAIL).id

    res = google_login(api_client, sub="g-sara", email=EMAIL)
    assert res.status_code == 200                       # returning user, not a new signup
    assert User.objects.filter(email=EMAIL).count() == 1
    user = User.objects.get(email=EMAIL)
    assert user.id == uid and user.google_sub == "g-sara"   # linked, not duplicated


def test_google_then_otp_is_one_account(api_client, google_login):
    google_login(api_client, sub="g-sara", email=EMAIL)
    uid = User.objects.get(email=EMAIL).id

    _request(api_client)
    res = _verify(api_client)
    assert res.status_code == 200                       # existing account, no second signup
    assert res.json()["first_login"] is True            # google signup never picked a mode
    assert User.objects.filter(email=EMAIL).count() == 1
    user = User.objects.get(email=EMAIL)
    assert user.id == uid
    # no second signup grant; a security notice was raised for OTP-into-Google-account
    assert BidLedger.objects.filter(user=user, reason=BidLedger.Reason.SIGNUP_GRANT).count() == 1
    assert Notification.objects.filter(user=user, title__icontains="رمز البريد").exists()


def test_mixed_case_email_unifies(api_client, google_login):
    google_login(api_client, sub="g-sara", email=EMAIL)
    # request with a differently-cased address must resolve to the same row/account
    api_client.post(REQUEST, {"email": "Sara@Example.com"}, format="json")
    res = api_client.post(
        VERIFY, {"email": "Sara@Example.com", "code": _code(EMAIL)}, format="json"
    )
    assert res.status_code == 200
    assert User.objects.filter(email__iexact=EMAIL).count() == 1


def test_split_brain_conflict_is_refused(db):
    """Google sub and email pointing at DIFFERENT rows must never duplicate or mis-link."""
    from rest_framework.exceptions import PermissionDenied

    User.objects.create_user(email="a@x.com", google_sub="g2")
    User.objects.create_user(email="b@x.com")  # no google_sub
    with pytest.raises(PermissionDenied) as exc:
        account_services.get_or_provision_user("b@x.com", google_sub="g2", ip="127.0.0.1")
    assert exc.value.detail["code"] == "account_conflict"


# --------------------------------------------------------------------------- brute force / gates
def test_wrong_code_locks_and_survives_resend(api_client):
    from django.core.cache import cache

    _request(api_client)
    real = _code()
    wrong = "Zz9@xKq" if real != "Zz9@xKq" else "Aa2#yLp"  # complex, guaranteed != real
    max_attempts = 5

    for _ in range(max_attempts):
        bad = _verify(api_client, code=wrong)
        assert bad.status_code == 400
        assert b"otp_mismatch" in bad.content or b"otp_locked" in bad.content

    # locked now — and re-requesting a fresh code must NOT reset the lock
    locked = _verify(api_client, code=wrong)
    assert locked.status_code == 400 and b"otp_locked" in locked.content

    # clear only the resend gap so a new request is allowed, then confirm the lock still holds
    cache.delete(f"email_otp_gap:{EMAIL}")
    _request(api_client)
    still = _verify(api_client, code=_code())
    assert still.status_code == 400 and b"otp_locked" in still.content


def test_registration_closed_blocks_new_but_not_existing(api_client, google_login):
    # existing user keeps working
    google_login(api_client, sub="g-sara", email=EMAIL)
    set_setting("registration.enabled", False)
    _request(api_client)
    assert _verify(api_client).status_code == 200

    # brand-new email: request is uniform but creates no code row (dead-end avoided)
    new_email = "newcomer@example.com"
    resp = api_client.post(REQUEST, {"email": new_email}, format="json")
    assert resp.json() == {"sent": True}
    assert not EmailLoginCode.objects.filter(email=new_email).exists()


def test_frozen_account_blocked(api_client):
    _request(api_client)
    _verify(api_client)
    User.objects.filter(email=EMAIL).update(status=User.Status.FROZEN)
    from django.core.cache import cache
    cache.delete(f"email_otp_gap:{EMAIL}")
    _request(api_client)
    resp = _verify(api_client)
    assert resp.status_code == 403 and b"account_frozen" in resp.content


# --------------------------------------------------------------------------- throttle (opt-in)
def test_request_is_ip_throttled(api_client, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    from apps.accounts.api import views
    monkeypatch.setattr(views.EmailOTPRequestView, "throttle_classes", [ScopedRateThrottle])

    # distinct emails dodge the per-email resend gap; the per-IP otp_request bucket is 5/min
    for i in range(5):
        assert api_client.post(REQUEST, {"email": f"u{i}@example.com"}, format="json").status_code == 200
    sixth = api_client.post(REQUEST, {"email": "u5@example.com"}, format="json")
    assert sixth.status_code == 429
