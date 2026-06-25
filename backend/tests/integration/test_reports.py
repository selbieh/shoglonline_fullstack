"""Report-to-admin flow for public entities (core.Report): file a report → admin removes the
reported item. Mirrors the in-chat ChatReport coverage in test_chat_reports.py."""
import pytest
from rest_framework.test import APIClient

from apps.core.models import AuditLog, Report
from apps.core.admin import ReportAdmin
from apps.gigs.models import Service
from tests.factories import CategoryFactory, ServiceFactory, UserFactory


@pytest.fixture
def auth():
    def _login(user):
        c = APIClient()
        c.force_authenticate(user)
        return c
    return _login


@pytest.fixture
def live_service():
    return ServiceFactory(worker=UserFactory(), category=CategoryFactory(),
                          base_price=100, status=Service.Status.LIVE)


def test_report_requires_auth(live_service):
    resp = APIClient().post("/api/v1/reports",
                            {"kind": "service", "object_id": live_service.pk, "reason": "scam"},
                            format="json")
    assert resp.status_code == 401


def test_file_report_creates_open_row(auth, live_service):
    resp = auth(UserFactory()).post(
        "/api/v1/reports",
        {"kind": "service", "object_id": live_service.pk, "reason": "scam", "detail": "نصب"},
        format="json")
    assert resp.status_code == 201
    report = Report.objects.get()
    assert report.kind == "service" and report.object_id == live_service.pk
    assert report.status == Report.Status.OPEN


def test_reason_is_required(auth, live_service):
    resp = auth(UserFactory()).post(
        "/api/v1/reports", {"kind": "service", "object_id": live_service.pk, "reason": ""},
        format="json")
    assert resp.status_code == 400


def test_unknown_target_rejected(auth):
    resp = auth(UserFactory()).post(
        "/api/v1/reports", {"kind": "service", "object_id": 999999, "reason": "spam"},
        format="json")
    assert resp.status_code == 400


def test_cannot_report_own_item(auth, live_service):
    resp = auth(live_service.worker).post(
        "/api/v1/reports", {"kind": "service", "object_id": live_service.pk, "reason": "spam"},
        format="json")
    assert resp.status_code == 400
    assert Report.objects.count() == 0


def test_reporting_twice_reuses_open_report(auth, live_service):
    client = auth(UserFactory())
    body = {"kind": "service", "object_id": live_service.pk, "reason": "spam"}
    first = client.post("/api/v1/reports", body, format="json")
    second = client.post("/api/v1/reports", {**body, "reason": "scam"}, format="json")
    assert first.status_code == second.status_code == 201
    assert Report.objects.filter(reporter__isnull=False).count() == 1


@pytest.mark.django_db
def test_admin_remove_item_archives_service(staff, live_service):
    report = Report.objects.create(kind="service", object_id=live_service.pk,
                                   reporter=UserFactory(), reason="scam")

    class _Req:  # minimal request stand-in for the admin action
        user = staff
        def __init__(self): self._messages = []

    request = _Req()
    admin = ReportAdmin(Report, None)
    admin.message_user = lambda *a, **k: None  # no message framework in tests
    admin.remove_item(request, Report.objects.filter(pk=report.pk))

    live_service.refresh_from_db()
    report.refresh_from_db()
    assert live_service.status == Service.Status.ARCHIVED
    assert report.status == Report.Status.ACTIONED and report.resolution == "removed"
    assert AuditLog.objects.filter(action="admin.report_remove").exists()


@pytest.mark.django_db
def test_remove_collapses_sibling_open_reports(staff, live_service):
    # two users flag the same service; removing it should resolve both reports at once
    r1 = Report.objects.create(kind="service", object_id=live_service.pk,
                               reporter=UserFactory(), reason="scam")
    r2 = Report.objects.create(kind="service", object_id=live_service.pk,
                               reporter=UserFactory(), reason="spam")

    class _Req:
        user = staff

    admin = ReportAdmin(Report, None)
    admin.message_user = lambda *a, **k: None
    admin.remove_item(_Req(), Report.objects.filter(pk=r1.pk))

    r1.refresh_from_db(); r2.refresh_from_db()
    assert r1.status == Report.Status.ACTIONED
    assert r2.status == Report.Status.ACTIONED  # sibling collapsed, not left dangling open
