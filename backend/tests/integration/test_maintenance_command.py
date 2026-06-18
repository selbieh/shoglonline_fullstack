"""The `maintenance` command flips platform.maintenance_mode through the audited settings service
(Part 12 step 3)."""
import pytest
from django.core.management import call_command

from apps.core.models import SettingChangeLog
from apps.core.services import get_setting

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

KEY = "platform.maintenance_mode"


def test_maintenance_on_off_round_trip():
    call_command("maintenance", "on")
    assert get_setting(KEY) is True
    call_command("maintenance", "off")
    assert get_setting(KEY) is False
    # both flips are audited
    assert SettingChangeLog.objects.filter(key=KEY).count() == 2
