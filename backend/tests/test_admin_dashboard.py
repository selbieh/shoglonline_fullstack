"""Admin dashboard (ADM-2): stat boxes + charts render on /admin/."""
import pytest
from django.test import Client

from apps.accounts.models import User
from apps.core.analytics import _chart_data, dashboard_callback


@pytest.mark.django_db
def test_chart_data_shape():
    cd = _chart_data()
    assert set(cd) == {"trend", "contract_status"}
    assert len(cd["trend"]["labels"]) == 14


@pytest.mark.django_db
def test_dashboard_callback_context():
    ctx = dashboard_callback(None, {})
    assert ctx["stat_boxes"] and "chart_data_json" in ctx and "kpis" in ctx


@pytest.mark.django_db
def test_admin_index_renders_dashboard():
    staff = User.objects.create_user(email="admin@a.com", is_staff=True, is_superuser=True)
    c = Client()
    c.force_login(staff)
    res = c.get("/admin/")
    assert res.status_code == 200
    body = res.content.decode()
    assert "📊 Dashboard" in body
    assert "shTrend" in body and "shStatus" in body
    assert "Total users" in body and "GMV" in body
