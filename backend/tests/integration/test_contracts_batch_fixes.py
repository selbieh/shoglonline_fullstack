"""Regression tests for contracts batch fixes.

P2-05: a present-but-unparseable new_budget must be rejected as a field error, not silently
       coerced to None and misreported as an empty update.
P2-20: only one OPEN submission may exist per contract — re-submitting while Delivered must fail
       instead of orphaning earlier open submissions.
"""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.contracts import services as svc
from apps.contracts.models import Contract, Submission
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


def test_unparseable_new_budget_is_field_error(fund_wallet):
    """P2-05: garbage new_budget -> 400 keyed on new_budget, not a silent empty update."""
    c = make_active(fund_wallet, budget="100")
    res = auth(c.worker).post(
        f"/api/v1/contracts/{c.pk}/update-requests",
        {"new_budget": "abc", "message": "زيادة"}, format="json",
    )
    assert res.status_code == 400
    assert "new_budget" in res.json().get("fields", {})


def test_only_one_open_submission_per_contract(fund_wallet):
    """P2-20: a second submission while one is still OPEN must be rejected."""
    c = make_active(fund_wallet)
    first = auth(c.worker).post(f"/api/v1/contracts/{c.pk}/submissions", {"notes": "v1"}, format="json")
    assert first.status_code == 201
    assert first.json()["status"] == Contract.Status.DELIVERED

    second = auth(c.worker).post(f"/api/v1/contracts/{c.pk}/submissions", {"notes": "v2"}, format="json")
    assert second.status_code == 400
    assert Submission.objects.filter(contract=c, status=Submission.Status.OPEN).count() == 1
