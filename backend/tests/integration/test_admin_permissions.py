"""Admin access control (ADM-1/8): /admin and /admin/stats are staff-only; normal users + anon
are blocked from the console and the KPI endpoint."""
import pytest
from django.test import Client
from rest_framework.test import APIClient

from tests.factories import StaffUserFactory, SuperUserFactory, UserFactory

pytestmark = [pytest.mark.security, pytest.mark.django_db]


def test_admin_index_is_staff_only():
    assert Client().get("/admin/").status_code == 302  # anon → login

    normal = Client()
    normal.force_login(UserFactory())
    assert normal.get("/admin/").status_code == 302  # non-staff → bounced

    staff = Client()
    staff.force_login(SuperUserFactory())
    assert staff.get("/admin/").status_code == 200  # staff reach the admin with password login


def test_model_changelist_is_staff_only():
    normal = Client()
    normal.force_login(UserFactory())
    assert normal.get("/admin/jobs/job/").status_code == 302


def test_stats_endpoint_permissions():
    assert APIClient().get("/api/v1/admin/stats").status_code in (401, 403)  # anon

    normal = APIClient()
    normal.force_authenticate(UserFactory())
    assert normal.get("/api/v1/admin/stats").status_code == 403  # not staff

    staff = APIClient()
    staff.force_authenticate(StaffUserFactory())
    assert staff.get("/api/v1/admin/stats").status_code == 200


def test_stats_widgets_flag():
    staff = APIClient()
    staff.force_authenticate(StaffUserFactory())
    body = staff.get("/api/v1/admin/stats?widgets=1").json()
    assert "widgets" in body and "affiliate_funnel" in body["widgets"]
