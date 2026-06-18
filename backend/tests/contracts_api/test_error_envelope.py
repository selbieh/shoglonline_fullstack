"""Every API error renders the SAME envelope (TESTING_STRATEGY §13): {code, message_ar},
with field errors under `fields`. The frontend parses one shape — no regex-scraping."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.contracts import services as csvc
from apps.contracts.models import Contract
from apps.gigs.models import Service
from tests.factories import ContractFactory, ServiceFactory, UserFactory

pytestmark = [pytest.mark.contracts_api, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _assert_envelope(res, *, status, code):
    assert res.status_code == status, res.content
    body = res.json()
    assert body["code"] == code
    assert isinstance(body.get("message_ar"), str) and body["message_ar"]


def test_401_unauthenticated_envelope():
    _assert_envelope(APIClient().get("/api/v1/me/wallet"), status=401, code="not_authenticated")


def test_404_not_found_envelope():
    res = auth(UserFactory()).get("/api/v1/contracts/999999")
    _assert_envelope(res, status=404, code="not_found")


def test_403_permission_denied_domain_envelope(fund_wallet):
    # worker is a party but funding is employer-only → domain PermissionDenied({code, message_ar})
    employer, worker = UserFactory(), UserFactory()
    commission, earning = csvc.compute_commission(Decimal("100"), Decimal("10"))
    c = ContractFactory(employer=employer, worker=worker, budget=Decimal("100"),
                        commission_pct=Decimal("10"), commission_amount=commission, worker_earning=earning)
    fund_wallet(employer, "100")
    c = csvc.try_fund(c)
    assert c.status == Contract.Status.ACTIVE
    _assert_envelope(auth(worker).post(f"/api/v1/contracts/{c.pk}/fund", format="json"),
                     status=403, code="not_a_party")


def test_400_domain_validation_envelope():
    # below-minimum withdrawal → domain ValidationError({code, message_ar})
    res = auth(UserFactory()).post("/api/v1/me/withdrawals", {"amount": "5"}, format="json")
    _assert_envelope(res, status=400, code="below_minimum")


def test_400_manual_error_now_uses_envelope():
    # a previously ad-hoc Response({...}, 400) is now raised through the handler
    res = auth(UserFactory()).post("/api/v1/wallet/charge", {"amount": "0"}, format="json")
    _assert_envelope(res, status=400, code="invalid_amount")


def test_unknown_action_envelope():
    worker = UserFactory()
    svc = ServiceFactory(worker=worker, status=Service.Status.LIVE)
    res = auth(worker).post(f"/api/v1/me/services/{svc.pk}/teleport", format="json")
    _assert_envelope(res, status=400, code="unknown_action")


def test_serializer_field_errors_go_under_fields():
    res = auth(UserFactory()).post("/api/v1/me/jobs", {}, format="json")
    assert res.status_code == 400
    body = res.json()
    assert body["code"] == "validation_error"
    assert isinstance(body["message_ar"], str) and body["message_ar"]
    assert "fields" in body and isinstance(body["fields"], dict)
    assert body["fields"]  # at least one missing-field error reported
