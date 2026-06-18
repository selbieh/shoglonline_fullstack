"""Contract & delivery lifecycle over the API (FR-TASK-*). Relationship-based authz: only a
party can act; the counterpart gates accept/confirm/respond."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.contracts import services as svc
from apps.contracts.models import Contract, Submission, UpdateRequest
from tests.factories import ContractFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def make_active(fund_wallet, budget="100", pct="10"):
    employer, worker = UserFactory(), UserFactory()
    commission, earning = svc.compute_commission(Decimal(budget), Decimal(pct))
    c = ContractFactory(employer=employer, worker=worker, budget=Decimal(budget),
                        commission_pct=Decimal(pct), commission_amount=commission, worker_earning=earning)
    fund_wallet(employer, budget)
    return svc.try_fund(c)


def test_list_and_detail_party_only(fund_wallet):
    c = make_active(fund_wallet)
    assert auth(c.employer).get("/api/v1/me/contracts").json()["count"] == 1
    assert auth(c.worker).get(f"/api/v1/contracts/{c.pk}").status_code == 200
    # a stranger cannot read the contract (404, not 403 — existence hidden)
    assert auth(UserFactory()).get(f"/api/v1/contracts/{c.pk}").status_code == 404


def test_role_filter(fund_wallet):
    c = make_active(fund_wallet)
    emp = auth(c.employer)
    assert emp.get("/api/v1/me/contracts?role=employer").json()["count"] == 1
    assert emp.get("/api/v1/me/contracts?role=worker").json()["count"] == 0


def test_deliver_then_accept_over_api(fund_wallet):
    c = make_active(fund_wallet)
    res = auth(c.worker).post(f"/api/v1/contracts/{c.pk}/submissions", {"notes": "تم"}, format="json")
    assert res.status_code == 201
    assert res.json()["status"] == Contract.Status.DELIVERED

    sub = Submission.objects.get(contract=c)
    acc = auth(c.employer).post(f"/api/v1/submissions/{sub.pk}/accept", format="json")
    assert acc.status_code == 200
    assert acc.json()["status"] == Contract.Status.COMPLETED


def test_reject_submission_over_api(fund_wallet):
    c = make_active(fund_wallet)
    auth(c.worker).post(f"/api/v1/contracts/{c.pk}/submissions", {"notes": "v1"}, format="json")
    sub = Submission.objects.get(contract=c)
    res = auth(c.employer).post(f"/api/v1/submissions/{sub.pk}/reject", {"reason": "ينقص"}, format="json")
    assert res.status_code == 200
    assert res.json()["status"] == Contract.Status.ACTIVE


def test_update_request_and_respond(fund_wallet):
    c = make_active(fund_wallet, budget="100")
    # worker proposes a deadline change
    res = auth(c.worker).post(
        f"/api/v1/contracts/{c.pk}/update-requests",
        {"new_deadline": "2030-01-01", "message": "أحتاج وقتًا"}, format="json",
    )
    assert res.status_code == 201
    upd = UpdateRequest.objects.get(contract=c)
    # the same party cannot self-approve
    assert auth(c.worker).post(f"/api/v1/update-requests/{upd.pk}/respond",
                               {"accept": True}, format="json").status_code == 403
    ok = auth(c.employer).post(f"/api/v1/update-requests/{upd.pk}/respond", {"accept": True}, format="json")
    assert ok.status_code == 200
    assert UpdateRequest.objects.get(pk=upd.pk).status == UpdateRequest.Status.ACCEPTED


def test_mutual_cancel_over_api(fund_wallet):
    c = make_active(fund_wallet, budget="100")
    auth(c.employer).post(f"/api/v1/contracts/{c.pk}/cancel", {"reason": "تغيّر النطاق"}, format="json")
    # requester cannot confirm their own request
    assert auth(c.employer).post(f"/api/v1/contracts/{c.pk}/cancel/confirm", format="json").status_code == 403
    ok = auth(c.worker).post(f"/api/v1/contracts/{c.pk}/cancel/confirm", format="json")
    assert ok.status_code == 200
    assert ok.json()["status"] == Contract.Status.CANCELLED


def test_open_dispute_over_api(fund_wallet):
    c = make_active(fund_wallet)
    res = auth(c.worker).post(f"/api/v1/contracts/{c.pk}/dispute", {"reason": "خلاف"}, format="json")
    assert res.status_code == 200
    assert res.json()["status"] == Contract.Status.DISPUTED


def test_fund_endpoint_activates_after_deposit(fund_wallet):
    employer, worker = UserFactory(), UserFactory()
    commission, earning = svc.compute_commission(Decimal("100"), Decimal("10"))
    c = ContractFactory(employer=employer, worker=worker, budget=Decimal("100"),
                        commission_pct=Decimal("10"), commission_amount=commission,
                        worker_earning=earning, status=Contract.Status.PENDING_FUNDING)
    # unfunded → 400
    assert auth(employer).post(f"/api/v1/contracts/{c.pk}/fund", format="json").status_code == 400
    fund_wallet(employer, "100")
    ok = auth(employer).post(f"/api/v1/contracts/{c.pk}/fund", format="json")
    assert ok.status_code == 200
    assert ok.json()["status"] == Contract.Status.ACTIVE
