"""Email change flow (FR-AUTH / ppt slide-31) — fills the gap noted in the QA plan.

request-change caches a token + pending address (the email only switches on confirm, so a
typo can't lock the user out); confirm swaps it. `debug_token` is only returned under DEBUG.
"""
import pytest

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

REQUEST = "/api/v1/auth/me/email/request-change"
CONFIRM = "/api/v1/auth/me/email/confirm"


def test_request_requires_auth(api_client):
    assert api_client.post(REQUEST, {"email": "x@example.com"}, format="json").status_code in (401, 403)


def test_request_invalid_email(as_user, worker):
    res = as_user(worker).post(REQUEST, {"email": "not-an-email"}, format="json")
    assert res.status_code == 400
    assert b"invalid_email" in res.content


def test_request_same_email_rejected(as_user, worker):
    res = as_user(worker).post(REQUEST, {"email": worker.email}, format="json")
    assert res.status_code == 400
    assert b"same_email" in res.content


def test_request_taken_email_rejected(as_user, worker, employer):
    res = as_user(worker).post(REQUEST, {"email": employer.email}, format="json")
    assert res.status_code == 400
    assert b"email_taken" in res.content


def test_request_then_confirm_changes_email(as_user, worker, settings):
    settings.DEBUG = True  # so the service echoes debug_token
    client = as_user(worker)

    req = client.post(REQUEST, {"email": "new@example.com"}, format="json")
    assert req.status_code == 200
    assert req.json()["sent"] is True
    token = req.json()["debug_token"]

    res = client.post(CONFIRM, {"token": token}, format="json")
    assert res.status_code == 200
    assert res.json()["email"] == "new@example.com"

    worker.refresh_from_db()
    assert worker.email == "new@example.com"


def test_confirm_wrong_token_rejected(as_user, worker, settings):
    settings.DEBUG = True
    client = as_user(worker)
    client.post(REQUEST, {"email": "new2@example.com"}, format="json")

    res = client.post(CONFIRM, {"token": "wrong-token"}, format="json")
    assert res.status_code == 400
    assert b"token_mismatch" in res.content
    worker.refresh_from_db()
    assert worker.email != "new2@example.com"  # unchanged until a valid confirm


def test_confirm_without_request_is_expired(as_user, worker):
    res = as_user(worker).post(CONFIRM, {"token": "anything"}, format="json")
    assert res.status_code == 400
    assert b"token_expired" in res.content
