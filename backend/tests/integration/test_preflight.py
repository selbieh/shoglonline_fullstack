"""Go-live preflight gate (Part 12 steps 4 + 18): a production-like config + seeded DB passes; a
dev-leaning config or an unseeded settings catalog fails loudly with a non-zero exit."""
import pytest
from django.core.management import call_command
from django.test import override_settings

from apps.core.models import GlobalSetting

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

PROD = dict(
    DEBUG=False,
    GOOGLE_AUTH_STUB=False,
    PAYPAL_STUB=False,
    SECRET_KEY="a-genuinely-long-production-secret-value",
    ALLOWED_HOSTS=["shoghlonline.com"],
    EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend",
)


@override_settings(**PROD)
def test_preflight_passes_with_production_config():
    call_command("seed_settings")
    call_command("preflight")  # no SystemExit → green


@override_settings(**PROD)
def test_preflight_strict_fails_on_advisory_warnings():
    call_command("seed_settings")
    # SSL/Sentry/S3 are WARN by default; --strict promotes them to failures
    with pytest.raises(SystemExit):
        call_command("preflight", "--strict")


@override_settings(**{**PROD, "DEBUG": True, "GOOGLE_AUTH_STUB": True})
def test_preflight_fails_on_dev_config():
    call_command("seed_settings")
    with pytest.raises(SystemExit):
        call_command("preflight")


@override_settings(**PROD)
def test_preflight_fails_when_settings_unseeded():
    GlobalSetting.objects.all().delete()
    with pytest.raises(SystemExit):
        call_command("preflight")
