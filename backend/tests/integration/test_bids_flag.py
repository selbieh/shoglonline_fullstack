"""`bids.enabled` master switch (Part: flag-controlled bid economy).

When the flag is OFF the bid economy disappears with no broken flow: applying to a job is free (no
credit consumed, 0-balance workers can apply), buying bid packages is blocked, signup grants are
skipped, and there are no purchasable plans. The platform still earns via the existing commission.
Refund paths stay safe because they are guarded by `proposal.bid_consumed`.
"""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bids.models import BidLedger, BidPlan
from apps.bids.services import bid_balance, grant_signup_bids
from apps.catalog.models import Category
from apps.core.services import public_settings, set_setting
from apps.jobs import services
from apps.jobs.models import Job, Proposal
from apps.payments import services as pay
from apps.payments.models import Transaction

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


@pytest.fixture()
def category(db):
    return Category.objects.create(name_ar="التصميم", slug="design")


@pytest.fixture()
def employer(db):
    return User.objects.create_user(email="employer@example.com", active_mode="find_worker")


def _published_job(employer, category):
    set_setting("jobs.auto_publish", True)
    job = Job.objects.create(
        employer=employer, title="تصميم هوية", description="وصف مفصّل",
        category=category, budget_min=100, budget_max=200,
    )
    return services.submit_for_publication(job)


# --------------------------------------------------------------------- applying

def test_flag_off_lets_a_zero_balance_worker_apply_free(employer, category):
    set_setting("bids.enabled", False)
    job = _published_job(employer, category)
    broke = User.objects.create_user(email="broke@example.com")  # never granted any bids

    proposal = services.submit_proposal(
        worker=broke, job=job, budget=150, delivery_days=10, description="x", answers={}
    )
    assert proposal.status == Proposal.Status.SUBMITTED
    assert proposal.bid_consumed is False
    assert bid_balance(broke) == 0  # nothing consumed, nothing required


def test_flag_on_still_consumes_one_bid(employer, category):
    set_setting("bids.enabled", True)
    job = _published_job(employer, category)
    worker = User.objects.create_user(email="w@example.com")
    BidLedger.objects.create(user=worker, delta=5, reason=BidLedger.Reason.SIGNUP_GRANT)

    proposal = services.submit_proposal(
        worker=worker, job=job, budget=150, delivery_days=10, description="x", answers={}
    )
    assert proposal.bid_consumed is True
    assert bid_balance(worker) == 4  # FR-BID-1 unchanged when the flag is on


def test_flag_flip_close_job_is_a_safe_noop_refund(employer, category):
    """A free proposal (made while off) carried through job close must not error or over-refund."""
    set_setting("bids.enabled", False)
    job = _published_job(employer, category)
    worker = User.objects.create_user(email="free@example.com")
    proposal = services.submit_proposal(
        worker=worker, job=job, budget=150, delivery_days=10, description="x", answers={}
    )

    services.close_job(job)  # triggers refund_bid for every open proposal

    proposal.refresh_from_db()
    assert proposal.bid_refunded is False  # nothing was consumed → nothing to refund
    assert bid_balance(worker) == 0


# --------------------------------------------------------------------- buying / granting / plans

def test_flag_off_blocks_buying_a_bid_plan(employer, category):
    set_setting("bids.enabled", False)
    buyer = User.objects.create_user(email="buyer@example.com")
    pay.post(pay.get_wallet(buyer), type=Transaction.Type.DEPOSIT,
             bucket=Transaction.Bucket.AVAILABLE, amount=Decimal("50"), note="seed")
    plan = BidPlan.objects.create(name="الباقة", bids_count=20, cost=Decimal("15"))

    res = APIClient()
    res.force_authenticate(buyer)
    out = res.post(f"/api/v1/bid-plans/{plan.pk}/purchase")
    assert out.status_code == 400
    assert "bids_disabled" in str(out.json())
    # no money moved, no bids granted
    assert bid_balance(buyer) == 0
    assert not Transaction.objects.filter(type=Transaction.Type.BID_PURCHASE).exists()


def test_flag_off_skips_signup_grant():
    set_setting("bids.enabled", False)
    user = User.objects.create_user(email="newbie@example.com")
    grant_signup_bids(user)
    assert bid_balance(user) == 0


def test_flag_off_returns_no_purchasable_plans():
    set_setting("bids.enabled", False)
    BidPlan.objects.create(name="الباقة", bids_count=20, cost=Decimal("15"))
    res = APIClient().get("/api/v1/bid-plans")
    assert res.status_code == 200
    assert res.json() == []


# --------------------------------------------------------------------- exposure

def test_flag_is_public():
    assert "bids.enabled" in public_settings()
    res = APIClient().get("/api/v1/settings/public")
    assert "bids.enabled" in res.json()
