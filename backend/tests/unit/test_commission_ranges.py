"""Platform commission ranges (FR-PAY-6 / §4.15): the rate is selected by contract amount, frozen
on the contract, and the BR-24 invariant (budget = worker_earning + commission) holds across ranges."""
from decimal import Decimal

import pytest

from apps.contracts.services import compute_commission, create_contract_from_proposal
from apps.jobs.models import Job, Proposal
from apps.payments.models import CommissionTier
from apps.payments.services import commission_rate_for
from tests.factories import JobFactory, UserFactory

pytestmark = [pytest.mark.unit, pytest.mark.django_db]


def test_rate_selected_by_amount():
    CommissionTier.objects.create(min_amount=0, max_amount=100, rate_pct=Decimal("15"))
    CommissionTier.objects.create(min_amount=100, max_amount=100000, rate_pct=Decimal("8"))
    assert commission_rate_for(Decimal("50")) == Decimal("15")
    assert commission_rate_for(Decimal("500")) == Decimal("8")


def test_fallback_to_flat_setting_when_no_tier():
    # no tiers configured → the flat payments.commission_pct (seeded default 10)
    assert commission_rate_for(Decimal("50")) == Decimal("10")


def test_specific_applies_to_beats_any():
    CommissionTier.objects.create(applies_to="any", min_amount=0, max_amount=1000, rate_pct=Decimal("10"))
    CommissionTier.objects.create(applies_to="worker", min_amount=0, max_amount=1000, rate_pct=Decimal("5"))
    assert commission_rate_for(Decimal("100"), applies_to="worker") == Decimal("5")
    assert commission_rate_for(Decimal("100")) == Decimal("10")  # default ANY


def test_tier_frozen_on_contract_and_immune_to_later_edits():
    employer, worker = UserFactory(), UserFactory()
    job = JobFactory(employer=employer, status=Job.Status.PUBLISHED)
    CommissionTier.objects.create(min_amount=0, max_amount=100000, rate_pct=Decimal("12.50"))
    proposal = Proposal.objects.create(job=job, worker=worker, budget=Decimal("200"),
                                       delivery_days=3, description="x", status=Proposal.Status.SUBMITTED)

    contract = create_contract_from_proposal(proposal)
    assert contract.commission_pct == Decimal("12.50")
    assert contract.commission_amount + contract.worker_earning == contract.budget  # BR-24

    CommissionTier.objects.all().update(rate_pct=Decimal("1"))  # editing tiers later…
    contract.refresh_from_db()
    assert contract.commission_pct == Decimal("12.50")  # …never changes a frozen contract


@pytest.mark.parametrize("budget", ["10", "33.33", "100", "999.99", "12345.67"])
def test_invariant_holds_across_ranges(budget):
    commission, earning = compute_commission(Decimal(budget), Decimal("12.5"))
    assert commission + earning == Decimal(budget)  # no sub-cent leakage
