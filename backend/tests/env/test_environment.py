"""Environment & startup validation (SRS §20/§22.1).

Guarantees, enforced in CI:
  1. `.env.example` documents every variable the settings actually read (no silent drift).
  2. Production settings FAIL FAST when required secrets are missing.
  3. The Global Settings catalog seeds cleanly (the app's runtime config source).
"""
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]      # backend/
REPO = BACKEND.parent                               # repo root
ENV_EXAMPLE = REPO / ".env.example"


def _env_keys_used() -> set[str]:
    text = (BACKEND / "config/settings/base.py").read_text()
    return set(re.findall(r'env(?:\.\w+)?\("([A-Z_]+)"', text))


def _documented_keys() -> set[str]:
    return set(re.findall(r"^([A-Z_]+)=", ENV_EXAMPLE.read_text(), re.M))


def test_env_example_exists():
    assert ENV_EXAMPLE.exists(), ".env.example must exist so `cp .env.example .env` works"


def test_env_example_documents_every_used_var():
    missing = _env_keys_used() - _documented_keys()
    assert not missing, f".env.example is missing documented vars: {sorted(missing)}"


def test_production_fails_fast_without_secret_key():
    """config.settings.production has no SECRET_KEY default — setup must error out."""
    env = {k: v for k, v in os.environ.items() if k != "DJANGO_SECRET_KEY"}
    env.pop("DJANGO_ALLOWED_HOSTS", None)
    env["DJANGO_SETTINGS_MODULE"] = "config.settings.production"
    result = subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"],
        cwd=str(BACKEND), env=env, capture_output=True, text=True,
    )
    assert result.returncode != 0, "production settings must fail fast without DJANGO_SECRET_KEY"


@pytest.mark.django_db
def test_seed_settings_command_runs():
    """The startup seeder (entrypoint.sh) populates the §22.1 catalog without error."""
    from django.core.management import call_command

    from apps.core.models import GlobalSetting
    call_command("seed_settings")
    assert GlobalSetting.objects.exists()


@pytest.mark.django_db
def test_public_settings_endpoint_smoke(client):
    """A clean app exposes public flags (used by the frontend for UI gating)."""
    res = client.get("/api/v1/settings/public")
    assert res.status_code == 200
    assert "platform.currency" in res.json()
