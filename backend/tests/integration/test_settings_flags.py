"""Global settings flags (§22 / BR-19): every flag is editable, the change takes effect server-side
(cache busted on write), public flags are exposed, and the admin edit path logs the change."""
import pytest
from django.contrib.admin.sites import AdminSite
from rest_framework.test import APIClient

from apps.core.admin import GlobalSettingAdmin
from apps.core.models import GlobalSetting, SettingChangeLog
from apps.core.services import DEFAULTS, get_setting, set_setting
from tests.factories import StaffUserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def test_flag_editable_in_both_states():
    set_setting("registration.enabled", False)
    assert get_setting("registration.enabled") is False  # effect is immediate (cache busted)
    set_setting("registration.enabled", True)
    assert get_setting("registration.enabled") is True


def test_public_flags_endpoint_exposes_every_public_key():
    body = APIClient().get("/api/v1/settings/public").json()
    public_keys = [k for k, (_v, _t, _c, is_public) in DEFAULTS.items() if is_public]
    for key in public_keys:
        assert key in body


def test_public_endpoint_reflects_a_change():
    set_setting("jobs.expiry_days", 45)
    assert APIClient().get("/api/v1/settings/public").json()["jobs.expiry_days"] == 45


def test_admin_edit_logs_change_and_busts_cache(admin_request):
    get_setting("registration.enabled")  # warm the cache
    obj = GlobalSetting.objects.get(key="registration.enabled")
    obj.value = False
    GlobalSettingAdmin(GlobalSetting, AdminSite()).save_model(
        admin_request(StaffUserFactory()), obj, form=None, change=True
    )
    assert get_setting("registration.enabled") is False
    assert SettingChangeLog.objects.filter(key="registration.enabled").exists()
