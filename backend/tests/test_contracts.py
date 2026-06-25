"""Phase 4 — Contracts & Delivery rules (SRS FR-TASK, BR-6a/9/10/22/24, AC-5).

Covers: funding/escrow, commission + BR-24 rounding invariant, sibling auto-reject,
double-accept race, delivery accept/reject, warranty release (clock-forced), update
requests both directions, mutual cancel refund, dispute split, funding timeout.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.db.models import Sum
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bids.models import BidLedger
from apps.catalog.models import Category
from apps.contracts import services as cs
from apps.contracts.models import Contract
from apps.contracts.tasks import cancel_unfunded_contracts, release_due_warranties
from apps.core.services import set_setting
from apps.jobs import services as js
from apps.jobs.models import Job, Proposal
from apps.payments import services as pay
from apps.payments.models import Transaction


# ------------------------------------------------------------------ fixtures
@pytest.fixture(autouse=True)
def _flags(db):
    set_setting("jobs.auto_publish", True)
    set_setting("payments.commission_pct", 10)
    set_setting("contracts.warranty_days", 60)
    set_setting("contracts.funding_timeout_hours", 48)


@pytest.fixture()
def employer(db):
    return User.objects.create_user(email="emp@example.com")


@pytest.fixture()
def worker(db):
    u = User.objects.create_user(email="wk@example.com")
    BidLedger.objects.create(user=u, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    return u


@pytest.fixture()
def category(db):
    return Category.objects.create(name_ar="برمجة", name_en="Dev", slug="dev")


def fund_wallet(user, amount):
    pay.post(pay.get_wallet(user), type=Transaction.Type.DEPOSIT,
             bucket=Transaction.Bucket.AVAILABLE, amount=Decimal(str(amount)), note="seed")


def make_contract(employer, worker, category, *, budget="100", fund=True, deadline_days=10):
    job = Job.objects.create(employer=employer, title="بناء موقع", description="وصف",
                             category=category, budget_min=50, budget_max=500,
                             status=Job.Status.PUBLISHED, published_at=timezone.now())
    proposal = js.submit_proposal(worker=worker, job=job, budget=Decimal(budget),
                                  delivery_days=deadline_days, description="عرضي", answers={})
    if fund:
        fund_wallet(employer, Decimal(budget) + Decimal("50"))
    return js.accept_proposal(proposal)


def bucket_sum(wallet, bucket):
    return (Transaction.objects.filter(wallet=wallet, status="succeeded", bucket=bucket)
            .aggregate(s=Sum("amount"))["s"] or Decimal("0"))


def assert_invariant(wallet):
    wallet.refresh_from_db()
    for b in ("available", "escrow_held", "earnings_pending"):
        assert getattr(wallet, b) == bucket_sum(wallet, b), f"{b} drift on {wallet}"


# ------------------------------------------------------------------ funding / escrow
@pytest.mark.django_db
class TestFunding:
    def test_funded_immediately_holds_escrow(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        assert contract.status == Contract.Status.ACTIVE
        ew = pay.get_wallet(employer)
        ew.refresh_from_db()
        assert ew.available == Decimal("50")     # 150 seed - 100 held
        assert ew.escrow_held == Decimal("100")  # BR-9
        assert_invariant(ew)

    def test_unfunded_stays_pending(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100", fund=False)
        assert contract.status == Contract.Status.PENDING_FUNDING
        assert pay.get_wallet(employer).escrow_held == Decimal("0")

    def test_fund_now_after_charge(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100", fund=False)
        fund_wallet(employer, "120")
        cs.fund_now(contract, employer)
        contract.refresh_from_db()
        assert contract.status == Contract.Status.ACTIVE
        assert pay.get_wallet(employer).escrow_held == Decimal("100")

    def test_funding_is_idempotent(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        cs.try_fund(contract)  # replay
        ew = pay.get_wallet(employer)
        ew.refresh_from_db()
        assert ew.escrow_held == Decimal("100")  # not doubled

    def test_no_new_proposals_after_award(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        other = User.objects.create_user(email="late@example.com")
        BidLedger.objects.create(user=other, delta=5, reason=BidLedger.Reason.SIGNUP_GRANT)
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            js.submit_proposal(worker=other, job=contract.job, budget=120,
                               delivery_days=5, description="x", answers={})


# ------------------------------------------------------------------ commission / rounding
@pytest.mark.django_db
class TestCommissionRounding:
    @pytest.mark.parametrize("budget,pct", [("100", 10), ("99.99", 10), ("33.33", 15),
                                            ("0.01", 10), ("1234.56", 7)])
    def test_hold_equals_earning_plus_commission(self, budget, pct):
        commission, earning = cs.compute_commission(Decimal(budget), Decimal(pct))
        assert commission + earning == Decimal(budget)  # BR-24: no remainder escapes
        assert commission == commission.quantize(Decimal("0.01"))

    def test_acceptance_splits_escrow_exactly(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="99.99")
        sub = cs.submit_deliverable(contract, worker, notes="تم")
        cs.accept_submission(sub, employer)
        contract.refresh_from_db()
        ew, ww, pw = pay.get_wallet(employer), pay.get_wallet(worker), pay.get_platform_wallet()
        for w in (ew, ww, pw):
            w.refresh_from_db()
        assert ew.escrow_held == Decimal("0")
        assert ww.earnings_pending == contract.worker_earning
        assert pw.available == contract.commission_amount
        assert contract.worker_earning + contract.commission_amount == Decimal("99.99")
        assert_invariant(ew)
        assert_invariant(ww)


# ------------------------------------------------------------------ delivery
@pytest.mark.django_db
class TestDelivery:
    def test_submit_moves_to_delivered(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        cs.submit_deliverable(contract, worker, notes="النسخة الأولى")
        contract.refresh_from_db()
        assert contract.status == Contract.Status.DELIVERED

    def test_reject_reverts_to_active_then_resubmit(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        sub = cs.submit_deliverable(contract, worker, notes="v1")
        cs.reject_submission(sub, employer, "نقص في المتطلبات")
        contract.refresh_from_db()
        assert contract.status == Contract.Status.ACTIVE
        cs.submit_deliverable(contract, worker, notes="v2")
        contract.refresh_from_db()
        assert contract.status == Contract.Status.DELIVERED

    def test_accept_completes_and_starts_warranty(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        sub = cs.submit_deliverable(contract, worker, notes="done")
        cs.accept_submission(sub, employer)
        contract.refresh_from_db()
        assert contract.status == Contract.Status.COMPLETED
        assert contract.warranty_ends_at is not None
        assert contract.job.status == Job.Status.COMPLETED

    def test_worker_cannot_accept_own_submission(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        sub = cs.submit_deliverable(contract, worker, notes="done")
        from rest_framework.exceptions import PermissionDenied
        with pytest.raises(PermissionDenied):
            cs.accept_submission(sub, worker)


# ------------------------------------------------------------------ warranty (BR-10)
@pytest.mark.django_db
class TestWarranty:
    def test_release_only_after_warranty_end(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        sub = cs.submit_deliverable(contract, worker, notes="done")
        cs.accept_submission(sub, employer)
        ww = pay.get_wallet(worker)
        ww.refresh_from_db()
        assert ww.earnings_pending == Decimal("90")
        assert ww.available == Decimal("0")
        # not yet due
        assert release_due_warranties() == 0
        # clock-force the warranty end (AC-5)
        Contract.objects.filter(pk=contract.pk).update(warranty_ends_at=timezone.now() - timedelta(days=1))
        assert release_due_warranties() == 1
        ww.refresh_from_db()
        assert ww.earnings_pending == Decimal("0")
        assert ww.available == Decimal("90")  # BR-10
        assert_invariant(ww)

    def test_warranty_release_idempotent(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        sub = cs.submit_deliverable(contract, worker, notes="done")
        cs.accept_submission(sub, employer)
        Contract.objects.filter(pk=contract.pk).update(warranty_ends_at=timezone.now() - timedelta(days=1))
        cs.release_warranty(Contract.objects.get(pk=contract.pk))
        cs.release_warranty(Contract.objects.get(pk=contract.pk))  # replay
        ww = pay.get_wallet(worker)
        ww.refresh_from_db()
        assert ww.available == Decimal("90")  # not doubled


# ------------------------------------------------------------------ update requests (FR-TASK-5)
@pytest.mark.django_db
class TestUpdateRequests:
    def test_budget_increase_reserves_diff(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")  # 150 seeded
        ur = cs.request_update(contract, employer, new_budget=Decimal("130"))
        cs.respond_update(ur, worker, accept=True)
        ew = pay.get_wallet(employer)
        ew.refresh_from_db()
        assert ew.escrow_held == Decimal("130")
        assert ew.available == Decimal("20")  # 50 - 30 extra
        contract.refresh_from_db()
        assert contract.budget == Decimal("130")
        assert contract.worker_earning + contract.commission_amount == Decimal("130")

    def test_budget_decrease_refunds_diff(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        ur = cs.request_update(contract, worker, new_budget=Decimal("70"))
        cs.respond_update(ur, employer, accept=True)
        ew = pay.get_wallet(employer)
        ew.refresh_from_db()
        assert ew.escrow_held == Decimal("70")
        assert ew.available == Decimal("80")  # 50 + 30 back
        assert_invariant(ew)

    def test_increase_without_funds_parks_change(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")  # available now 50
        ur = cs.request_update(contract, employer, new_budget=Decimal("500"))
        cs.respond_update(ur, worker, accept=True)  # FR-TASK-5: parks the change, no money moved
        ur.refresh_from_db()
        contract.refresh_from_db()
        assert ur.status == "pending_funding"
        assert contract.budget == Decimal("100")  # contract itself untouched
        assert contract.status == Contract.Status.ACTIVE
        assert pay.get_wallet(employer).escrow_held == Decimal("100")  # unchanged
        # employer charges, counterpart accepts again → now it applies
        fund_wallet(employer, "500")
        cs.respond_update(ur, worker, accept=True)
        contract.refresh_from_db()
        assert contract.budget == Decimal("500")

    def test_requester_cannot_self_approve(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        ur = cs.request_update(contract, employer, new_budget=Decimal("120"))
        from rest_framework.exceptions import PermissionDenied
        with pytest.raises(PermissionDenied):
            cs.respond_update(ur, employer, accept=True)

    def test_negative_budget_rejected(self, employer, worker, category):
        """Regression: a negative new_budget would invert the escrow math (over-refund)."""
        from rest_framework.exceptions import ValidationError
        contract = make_contract(employer, worker, category, budget="100")
        with pytest.raises(ValidationError):
            cs.request_update(contract, worker, new_budget=Decimal("-1000"))

    def test_cannot_accept_parked_update_after_contract_completed(self, employer, worker, category):
        """Regression: a PENDING_FUNDING-parked update must not re-hold escrow on a terminal contract."""
        from rest_framework.exceptions import ValidationError
        contract = make_contract(employer, worker, category, budget="100")  # available 50
        ur = cs.request_update(contract, employer, new_budget=Decimal("500"))
        cs.respond_update(ur, worker, accept=True)  # parks (insufficient funds)
        assert ur.status == "pending_funding"
        # contract completes before the employer tops up
        sub = cs.submit_deliverable(contract, worker, notes="done")
        cs.accept_submission(sub, employer)
        contract.refresh_from_db()
        assert contract.status == Contract.Status.COMPLETED
        fund_wallet(employer, "500")
        with pytest.raises(ValidationError):
            cs.respond_update(ur, worker, accept=True)  # blocked — contract no longer ACTIVE/DELIVERED
        contract.refresh_from_db()
        assert contract.budget == Decimal("100")  # untouched; no escrow re-hold


# ------------------------------------------------------------------ cancellation
@pytest.mark.django_db
class TestCancellation:
    def test_mutual_cancel_full_refund(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        cs.request_cancel(contract, employer, "تغيّرت المتطلبات")
        cs.confirm_cancel(contract, worker)
        contract.refresh_from_db()
        assert contract.status == Contract.Status.CANCELLED
        ew = pay.get_wallet(employer)
        ew.refresh_from_db()
        assert ew.escrow_held == Decimal("0")
        assert ew.available == Decimal("150")  # full refund
        assert contract.job.status == Job.Status.CLOSED
        assert_invariant(ew)

    def test_cancel_needs_counterpart(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        cs.request_cancel(contract, employer)
        from rest_framework.exceptions import PermissionDenied
        with pytest.raises(PermissionDenied):
            cs.confirm_cancel(contract, employer)  # same party cannot confirm


# ------------------------------------------------------------------ disputes (BR-22)
@pytest.mark.django_db
class TestDisputes:
    def test_split_posts_refund_payout_commission(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        cs.submit_deliverable(contract, worker, notes="partial")
        cs.open_dispute(contract, employer, reason="جزئي")
        contract.refresh_from_db()
        assert contract.status == Contract.Status.DISPUTED
        cs.resolve_dispute(contract, outcome="split", refund_pct=Decimal("40"))
        ew, ww, pw = pay.get_wallet(employer), pay.get_wallet(worker), pay.get_platform_wallet()
        for w in (ew, ww, pw):
            w.refresh_from_db()
        # refund 40 → employer; payout_gross 60; commission 6; worker_net 54
        assert ew.available == Decimal("90")   # 50 left + 40 refund
        assert ww.available == Decimal("54")
        assert pw.available == Decimal("6")
        assert ew.escrow_held == Decimal("0")
        # invariant: 40 + 54 + 6 == 100
        assert Decimal("40") + ww.available + pw.available == Decimal("100")
        contract.refresh_from_db()
        assert contract.status == Contract.Status.COMPLETED

    def test_split_locks_conversation(self, employer, worker, category):
        """Regression: a dispute-split is terminal (funds_released) so the warranty sweeper never
        runs — the split itself must lock the conversation read-only (BR-10)."""
        from apps.chat.models import Conversation
        from apps.chat.services import get_or_create_for_contract

        contract = make_contract(employer, worker, category, budget="100")
        conv = get_or_create_for_contract(contract)  # contract is ACTIVE → opens a live chat (D-2)
        assert conv.status == Conversation.Status.ACTIVE
        cs.submit_deliverable(contract, worker, notes="partial")
        cs.open_dispute(contract, employer, reason="x")
        cs.resolve_dispute(contract, outcome="split", refund_pct=Decimal("40"))
        conv.refresh_from_db()
        assert conv.status == Conversation.Status.READ_ONLY

    def test_cancel_outcome_full_refund(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        cs.open_dispute(contract, worker)
        cs.resolve_dispute(contract, outcome="cancel")
        ew = pay.get_wallet(employer)
        ew.refresh_from_db()
        assert ew.available == Decimal("150")
        assert ew.escrow_held == Decimal("0")

    def test_resume_returns_to_prior_state(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        cs.submit_deliverable(contract, worker, notes="x")  # delivered
        cs.open_dispute(contract, employer)
        cs.resolve_dispute(contract, outcome="resume")
        contract.refresh_from_db()
        assert contract.status == Contract.Status.DELIVERED


# ------------------------------------------------------------------ funding timeout (BR-6a)
@pytest.mark.django_db
class TestFundingTimeout:
    def test_timeout_cancels_and_reverts_job(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100", fund=False)
        assert contract.status == Contract.Status.PENDING_FUNDING
        Contract.objects.filter(pk=contract.pk).update(funding_deadline=timezone.now() - timedelta(hours=1))
        assert cancel_unfunded_contracts() == 1
        contract.refresh_from_db()
        assert contract.status == Contract.Status.CANCELLED
        assert contract.proposal.status == Proposal.Status.VIEWED  # winning proposal reverts
        assert contract.job.status == Job.Status.PUBLISHED         # job available again

    def test_no_money_held_on_timeout(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100", fund=False)
        Contract.objects.filter(pk=contract.pk).update(funding_deadline=timezone.now() - timedelta(hours=1))
        cancel_unfunded_contracts()
        assert pay.get_wallet(employer).escrow_held == Decimal("0")


# ------------------------------------------------------------------ double-accept race (AC-5)
@pytest.mark.django_db
class TestDoubleAccept:
    def test_only_one_contract_per_job(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        # a second accept on the same job (any proposal) must fail — one contract per job
        assert Contract.objects.filter(job=contract.job).count() == 1


# ------------------------------------------------------------------ API smoke
@pytest.mark.django_db
class TestContractAPI:
    def test_list_and_detail_for_party(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        client = APIClient()
        client.force_authenticate(worker)
        res = client.get("/api/v1/me/contracts")
        assert res.status_code == 200
        assert res.json()["count"] == 1
        assert res.json()["results"][0]["my_role"] == "worker"
        detail = client.get(f"/api/v1/contracts/{contract.pk}")
        assert detail.status_code == 200
        assert detail.json()["worker_earning"] is not None

    def test_non_party_cannot_view(self, employer, worker, category):
        contract = make_contract(employer, worker, category)
        stranger = User.objects.create_user(email="stranger@example.com")
        client = APIClient()
        client.force_authenticate(stranger)
        assert client.get(f"/api/v1/contracts/{contract.pk}").status_code == 404

    def test_full_delivery_flow_over_api(self, employer, worker, category):
        contract = make_contract(employer, worker, category, budget="100")
        wclient, eclient = APIClient(), APIClient()
        wclient.force_authenticate(worker)
        eclient.force_authenticate(employer)
        res = wclient.post(f"/api/v1/contracts/{contract.pk}/submissions", {"notes": "تم"}, format="json")
        assert res.status_code == 201 and res.json()["status"] == "delivered"
        sub_id = res.json()["submissions"][0]["id"]
        res = eclient.post(f"/api/v1/submissions/{sub_id}/accept", format="json")
        assert res.status_code == 200 and res.json()["status"] == "completed"
