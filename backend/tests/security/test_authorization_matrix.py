"""Relationship-based authorization (FR-MODE-4): protected endpoints reject anonymous callers
(401) and non-parties (404/403) on money-sensitive actions — you can only act on your own."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.contracts import services as svc
from tests.factories import ContractFactory, UserFactory

pytestmark = [pytest.mark.security, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


# endpoints that must reject an anonymous caller with 401
ANON_PROTECTED = [
    ("get", "/api/v1/me/wallet"),
    ("get", "/api/v1/me/transactions"),
    ("get", "/api/v1/me/contracts"),
    ("get", "/api/v1/me/notifications"),
    ("get", "/api/v1/me/jobs"),
    ("get", "/api/v1/me/proposals"),
    ("post", "/api/v1/me/withdrawals"),
]


@pytest.mark.parametrize("method,path", ANON_PROTECTED)
def test_anonymous_is_rejected(method, path):
    res = getattr(APIClient(), method)(path)
    assert res.status_code == 401, f"{method} {path} -> {res.status_code}"


def make_active(fund_wallet, budget="100"):
    employer, worker = UserFactory(), UserFactory()
    commission, earning = svc.compute_commission(Decimal(budget), Decimal("10"))
    c = ContractFactory(employer=employer, worker=worker, budget=Decimal(budget),
                        commission_pct=Decimal("10"), commission_amount=commission, worker_earning=earning)
    fund_wallet(employer, budget)
    return svc.try_fund(c)


def test_stranger_cannot_read_or_act_on_a_contract(fund_wallet):
    c = make_active(fund_wallet)
    stranger = auth(UserFactory())
    # existence is hidden from non-parties (404, not 403)
    assert stranger.get(f"/api/v1/contracts/{c.pk}").status_code == 404
    assert stranger.post(f"/api/v1/contracts/{c.pk}/fund", format="json").status_code == 404
    assert stranger.post(f"/api/v1/contracts/{c.pk}/dispute", format="json").status_code == 404


def test_worker_cannot_fund_contract(fund_wallet):
    c = make_active(fund_wallet)
    # the worker IS a party, but funding is an employer-only action → 403, not 404
    res = auth(c.worker).post(f"/api/v1/contracts/{c.pk}/fund", format="json")
    assert res.status_code == 403


def test_non_employer_cannot_accept_proposal(fund_wallet):
    """Accepting someone else's proposal is invisible (404 via owner-scoped queryset)."""
    from apps.bids.models import BidLedger
    from apps.core.services import set_setting
    from apps.jobs import services as jobs_svc
    from tests.factories import CategoryFactory, JobFactory
    set_setting("jobs.auto_publish", True)
    set_setting("proposals.auto_publish", True)
    job = JobFactory(employer=UserFactory(), category=CategoryFactory())
    worker = UserFactory()
    BidLedger.objects.create(user=worker, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    proposal = jobs_svc.submit_proposal(worker=worker, job=job, budget=Decimal("150"),
                                        delivery_days=5, description="x", answers={})
    res = auth(UserFactory()).post(f"/api/v1/proposals/{proposal.pk}/accept", format="json")
    assert res.status_code == 404
