"""Sensitive-data hygiene (SEC §16): secrets/PANs/tokens never appear in API responses or logs;
DEBUG is off; the security-header set is present on responses."""
import logging

import pytest
from rest_framework.test import APIClient

from apps.core.logfilters import JsonFormatter, RedactingFilter, redact
from tests.factories import UserFactory

pytestmark = [pytest.mark.security]


def test_redact_scrubs_pan_token_secret():
    assert redact("paid with 4242424242424242 today") == "paid with [REDACTED_PAN] today"
    assert "abc.def.ghi" not in redact("Authorization: Bearer abc.def.ghi")
    cleaned = redact('{"secret": "hunter2", "gateway_token": "vault-9"}')
    assert "hunter2" not in cleaned and "vault-9" not in cleaned


def test_redacting_filter_mutates_record():
    rec = logging.LogRecord("x", logging.INFO, __file__, 1, "card 4111111111111111", None, None)
    assert RedactingFilter().filter(rec) is True
    assert "4111111111111111" not in rec.getMessage()


def test_json_formatter_is_valid_json_and_redacted():
    import json
    rec = logging.LogRecord("x", logging.ERROR, __file__, 1, "token=%s", ("s3cr3tvalue",), None)
    out = JsonFormatter().format(rec)
    parsed = json.loads(out)
    assert parsed["level"] == "ERROR"
    assert "s3cr3tvalue" not in out


@pytest.mark.django_db
def test_payment_method_response_never_exposes_the_gateway_token():
    from apps.payments.services import add_payment_method
    user = UserFactory()
    add_payment_method(user, {"type": "paypal", "gateway_token": "vault-secret-xyz", "label": "p"})
    client = APIClient()
    client.force_authenticate(user)
    body = client.get("/api/v1/me/payment-methods").json()
    assert "gateway_token" not in body[0]
    assert "vault-secret-xyz" not in str(body)


@pytest.mark.django_db
def test_security_headers_present_on_responses():
    res = APIClient().get("/api/v1/settings/public")
    assert "frame-ancestors 'none'" in res.headers["Content-Security-Policy"]
    assert res.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in res.headers["Permissions-Policy"]
    assert res.headers["X-Content-Type-Options"] == "nosniff"


def test_debug_is_off(settings):
    assert settings.DEBUG is False  # prod/test never run with DEBUG on (no stack-trace leaks)
