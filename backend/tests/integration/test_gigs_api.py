"""Gig service management + buying-request actions over the API (FR-SVC). Targets the view
branches the service-level suite skips: status actions, favorites, request reject/cancel, lists."""
import pytest
from rest_framework.test import APIClient

from apps.core.services import set_setting
from apps.gigs.models import BuyingRequest, Service
from tests.factories import CategoryFactory, ServiceFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture(autouse=True)
def _flags():
    set_setting("services.auto_publish", True)
    set_setting("payments.commission_pct", 10)


@pytest.fixture
def worker():
    return UserFactory()


@pytest.fixture
def service(worker):
    return ServiceFactory(worker=worker, category=CategoryFactory(), base_price=100, status=Service.Status.LIVE)


def test_service_status_actions(worker, service):
    c = auth(worker)
    assert c.post(f"/api/v1/me/services/{service.pk}/pause", format="json").json()["status"] == Service.Status.PAUSED
    assert c.post(f"/api/v1/me/services/{service.pk}/resume", format="json").json()["status"] == Service.Status.LIVE
    assert c.post(f"/api/v1/me/services/{service.pk}/archive", format="json").json()["status"] == Service.Status.ARCHIVED
    assert c.post(f"/api/v1/me/services/{service.pk}/teleport", format="json").status_code == 400


def test_my_services_list_and_detail(worker, service):
    c = auth(worker)
    assert c.get("/api/v1/me/services").json()["count"] == 1
    assert c.get(f"/api/v1/me/services/{service.pk}").json()["id"] == service.pk
    patched = c.patch(f"/api/v1/me/services/{service.pk}", {"title": "عنوان جديد"}, format="json")
    assert patched.status_code == 200
    service.refresh_from_db()
    assert service.title == "عنوان جديد"


def test_favorites_put_get_delete(service):
    buyer = auth(UserFactory())
    assert buyer.put(f"/api/v1/me/favorites/{service.pk}").status_code == 204
    assert len(buyer.get("/api/v1/me/favorites").json()) == 1
    assert buyer.delete(f"/api/v1/me/favorites/{service.pk}").status_code == 204
    assert len(buyer.get("/api/v1/me/favorites").json()) == 0


def test_request_lists_outgoing_and_incoming(worker, service, fund_wallet):
    employer = UserFactory()
    fund_wallet(employer, "200")
    req = auth(employer).post(f"/api/v1/services/{service.pk}/requests", {"quantity": 1}, format="json")
    assert req.status_code == 201

    assert auth(employer).get("/api/v1/me/requests").json()["count"] == 1       # outgoing
    assert auth(worker).get("/api/v1/me/service-requests").json()["count"] == 1  # incoming


def test_request_reject_requires_reason_then_rejects(worker, service):
    employer = UserFactory()
    rid = auth(employer).post(f"/api/v1/services/{service.pk}/requests", {"quantity": 1}, format="json").json()["id"]
    assert auth(worker).post(f"/api/v1/requests/{rid}/reject", {}, format="json").status_code == 400
    ok = auth(worker).post(f"/api/v1/requests/{rid}/reject", {"reason": "خارج نطاقي"}, format="json")
    assert ok.status_code == 200
    assert BuyingRequest.objects.get(pk=rid).status == BuyingRequest.Status.REJECTED


def test_request_cancel_by_employer_and_unknown_action(worker, service):
    employer = UserFactory()
    rid = auth(employer).post(f"/api/v1/services/{service.pk}/requests", {"quantity": 1}, format="json").json()["id"]
    assert auth(employer).post(f"/api/v1/requests/{rid}/cancel", format="json").status_code == 200
    assert BuyingRequest.objects.get(pk=rid).status == BuyingRequest.Status.CANCELLED
    # unknown action → 400
    rid2 = auth(employer).post(f"/api/v1/services/{service.pk}/requests", {"quantity": 1}, format="json").json()["id"]
    assert auth(worker).post(f"/api/v1/requests/{rid2}/frobnicate", format="json").status_code == 400
