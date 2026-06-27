"""P2-09: a proposal's budget must sit inside the job's [budget_min, budget_max] band.

Regression for the gap where the range was only a UI hint and the backend accepted any value.
"""
from decimal import Decimal

import pytest
from rest_framework.exceptions import ValidationError

from apps.bids.models import BidLedger
from apps.jobs import services
from apps.jobs.models import Job, Proposal
from tests.factories import JobFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


@pytest.fixture
def worker_with_bids():
    u = UserFactory()
    BidLedger.objects.create(user=u, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    return u


def _job():
    return JobFactory(budget_min=100, budget_max=200, status=Job.Status.PUBLISHED)


def test_budget_below_min_rejected(worker_with_bids):
    job = _job()
    with pytest.raises(ValidationError) as exc:
        services.submit_proposal(
            worker=worker_with_bids, job=job, budget=Decimal("50"),
            delivery_days=10, description="x", answers={},
        )
    assert "budget" in exc.value.detail
    assert not Proposal.objects.filter(job=job).exists()


def test_budget_above_max_rejected(worker_with_bids):
    job = _job()
    with pytest.raises(ValidationError) as exc:
        services.submit_proposal(
            worker=worker_with_bids, job=job, budget=Decimal("250"),
            delivery_days=10, description="x", answers={},
        )
    assert "budget" in exc.value.detail
    assert not Proposal.objects.filter(job=job).exists()


def test_budget_within_range_accepted(worker_with_bids):
    job = _job()
    proposal = services.submit_proposal(
        worker=worker_with_bids, job=job, budget=Decimal("150"),
        delivery_days=10, description="x", answers={},
    )
    assert proposal.pk and proposal.budget == Decimal("150")
