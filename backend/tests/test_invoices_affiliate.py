"""Phase 8 — Invoices (FR-PAY-7) & Affiliate (FR-AFF, BR-18, AC-10)."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.affiliate import services as af
from apps.affiliate.models import AffiliateCommission, CommissionRule
from apps.bids.models import BidLedger
from apps.catalog.models import Category
from apps.contracts import services as cs
from apps.contracts.models import Contract
from apps.contracts.tasks import release_due_warranties
from apps.core.services import set_setting
from apps.invoices import services as inv
from apps.invoices.models import InvoiceRequest
from apps.jobs import services as js
from apps.jobs.models import Job
from apps.payments import services as pay
from apps.payments.models import Transaction


@pytest.fixture(autouse=True)
def _flags(db):
    set_setting("jobs.auto_publish", True)
    set_setting("payments.commission_pct", 10)
    set_setting("contracts.warranty_days", 60)
    set_setting("affiliate.cookie_days", 30)


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


def completed_contract(employer, worker, category, budget="100"):
    job = Job.objects.create(employer=employer, title="مهمة", description="وصف", category=category,
                             budget_min=10, budget_max=500, status=Job.Status.PUBLISHED,
                             published_at=timezone.now())
    proposal = js.submit_proposal(worker=worker, job=job, budget=Decimal(budget),
                                  delivery_days=7, description="عرض", answers={})
    pay.post(pay.get_wallet(employer), type=Transaction.Type.DEPOSIT,
             bucket=Transaction.Bucket.AVAILABLE, amount=Decimal(budget) + Decimal("50"), note="seed")
    contract = js.accept_proposal(proposal)
    sub = cs.submit_deliverable(contract, worker, notes="done")
    cs.accept_submission(sub, employer)
    contract.refresh_from_db()
    return contract


def end_warranty(contract):
    Contract.objects.filter(pk=contract.pk).update(warranty_ends_at=timezone.now() - timedelta(days=1))
    release_due_warranties()


# ------------------------------------------------------------------ invoices
@pytest.mark.django_db
class TestInvoices:
    def test_request_gathers_period_contracts(self, employer, worker, category):
        completed_contract(employer, worker, category, "100")
        invoice = inv.create_invoice_request(worker=worker, employer=employer, period_type="month")
        assert invoice.total == Decimal("90")  # worker earning (100 - 10% commission)
        assert invoice.lines.count() == 1
        assert invoice.number.startswith("INV-")

    def test_empty_period_rejected(self, employer, worker, category):
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            inv.create_invoice_request(worker=worker, employer=employer, period_type="month")

    def test_confirm_generates_pdf(self, employer, worker, category):
        completed_contract(employer, worker, category)
        invoice = inv.create_invoice_request(worker=worker, employer=employer, period_type="month")
        inv.confirm_invoice(invoice, employer)
        invoice.refresh_from_db()
        assert invoice.status == InvoiceRequest.Status.CONFIRMED
        assert invoice.pdf_url.endswith(".pdf")

    def test_only_employer_confirms(self, employer, worker, category):
        completed_contract(employer, worker, category)
        invoice = inv.create_invoice_request(worker=worker, employer=employer, period_type="month")
        from rest_framework.exceptions import PermissionDenied
        with pytest.raises(PermissionDenied):
            inv.confirm_invoice(invoice, worker)

    def test_reject(self, employer, worker, category):
        completed_contract(employer, worker, category)
        invoice = inv.create_invoice_request(worker=worker, employer=employer, period_type="month")
        inv.reject_invoice(invoice, employer, "تفاوت في القيمة")
        invoice.refresh_from_db()
        assert invoice.status == InvoiceRequest.Status.REJECTED

    def test_no_double_invoice_same_contract(self, employer, worker, category):
        """Regression: a contract already on a REQUESTED/CONFIRMED invoice can't be billed again."""
        from rest_framework.exceptions import ValidationError
        completed_contract(employer, worker, category, "100")
        inv.create_invoice_request(worker=worker, employer=employer, period_type="month")
        # the only completed contract is already invoiced → nothing left to bill
        with pytest.raises(ValidationError):
            inv.create_invoice_request(worker=worker, employer=employer, period_type="month")

    def test_rejected_invoice_frees_its_contracts(self, employer, worker, category):
        """A rejected invoice releases its contracts so a corrected invoice can include them again."""
        completed_contract(employer, worker, category, "100")
        first = inv.create_invoice_request(worker=worker, employer=employer, period_type="month")
        inv.reject_invoice(first, employer, "خطأ")
        again = inv.create_invoice_request(worker=worker, employer=employer, period_type="month")
        assert again.lines.count() == 1


# ------------------------------------------------------------------ affiliate
@pytest.mark.django_db
class TestAffiliate:
    def test_attribution_and_self_referral_void(self, employer, worker, category):
        referrer = User.objects.create_user(email="ref@example.com")
        profile = af.get_or_create_profile(referrer)
        # self-referral void (BR-21)
        assert af.attribute(referrer, profile.slug) is None
        # valid attribution
        assert af.attribute(employer, profile.slug) is not None
        # attribution happens once
        assert af.attribute(employer, profile.slug) is None

    def test_accrual_at_warranty_not_acceptance(self, employer, worker, category):
        referrer = User.objects.create_user(email="ref@example.com")
        profile = af.get_or_create_profile(referrer)
        af.attribute(employer, profile.slug)
        CommissionRule.objects.create(applies_to="any", min_amount=0, max_amount=1000, rate_pct=Decimal("20"))

        contract = completed_contract(employer, worker, category, "100")  # commission = 10
        # at acceptance (completed, pre-warranty) nothing accrued yet
        assert AffiliateCommission.objects.filter(referrer=referrer).count() == 0
        end_warranty(contract)
        commission = AffiliateCommission.objects.get(referrer=referrer)
        assert commission.amount == Decimal("2.00")  # 20% of platform commission (10)
        assert pay.get_wallet(referrer).available == Decimal("2.00")

    def test_dispute_split_accrues_affiliate(self, employer, worker, category):
        """Regression: a dispute-split settlement must still credit the referrer (BR-18), on the
        commission actually collected — not skip accrual the way the terminal split path used to."""
        referrer = User.objects.create_user(email="ref@example.com")
        af.attribute(employer, af.get_or_create_profile(referrer).slug)
        CommissionRule.objects.create(applies_to="any", min_amount=0, max_amount=1000, rate_pct=Decimal("20"))

        job = Job.objects.create(employer=employer, title="مهمة", description="وصف", category=category,
                                 budget_min=10, budget_max=500, status=Job.Status.PUBLISHED,
                                 published_at=timezone.now())
        proposal = js.submit_proposal(worker=worker, job=job, budget=Decimal("100"),
                                      delivery_days=7, description="عرض", answers={})
        pay.post(pay.get_wallet(employer), type=Transaction.Type.DEPOSIT,
                 bucket=Transaction.Bucket.AVAILABLE, amount=Decimal("150"), note="seed")
        contract = js.accept_proposal(proposal)
        cs.submit_deliverable(contract, worker, notes="partial")
        cs.open_dispute(contract, employer, reason="x")
        cs.resolve_dispute(contract, outcome="split", refund_pct=Decimal("40"))

        # split: payout_gross 60 → commission 6 (10%); affiliate 20% of the collected 6 = 1.20
        commission = AffiliateCommission.objects.get(referrer=referrer)
        assert commission.amount == Decimal("1.20")
        assert pay.get_wallet(referrer).available == Decimal("1.20")

    def test_frozen_affiliate_earns_nothing(self, employer, worker, category):
        referrer = User.objects.create_user(email="ref@example.com")
        af.get_or_create_profile(referrer)
        af.attribute(employer, af.get_or_create_profile(referrer).slug)
        af.set_frozen(referrer, True)
        CommissionRule.objects.create(applies_to="any", min_amount=0, max_amount=1000, rate_pct=Decimal("20"))
        contract = completed_contract(employer, worker, category)
        end_warranty(contract)
        assert AffiliateCommission.objects.filter(referrer=referrer).count() == 0

    def test_range_rule_selection(self, employer, worker, category):
        referrer = User.objects.create_user(email="ref@example.com")
        af.attribute(employer, af.get_or_create_profile(referrer).slug)
        # commission base = 10 → only the 0–5 rule would NOT match; use a matching high range
        CommissionRule.objects.create(applies_to="any", min_amount=0, max_amount=5, rate_pct=Decimal("50"))
        CommissionRule.objects.create(applies_to="any", min_amount=5, max_amount=1000, rate_pct=Decimal("10"))
        contract = completed_contract(employer, worker, category, "100")  # commission 10
        end_warranty(contract)
        commission = AffiliateCommission.objects.get(referrer=referrer)
        assert commission.rate_pct == Decimal("10")  # the 5–1000 band
        assert commission.amount == Decimal("1.00")

    def test_clawback_reverses(self, employer, worker, category):
        referrer = User.objects.create_user(email="ref@example.com")
        af.attribute(employer, af.get_or_create_profile(referrer).slug)
        CommissionRule.objects.create(applies_to="any", min_amount=0, max_amount=1000, rate_pct=Decimal("20"))
        contract = completed_contract(employer, worker, category)
        end_warranty(contract)
        commission = AffiliateCommission.objects.get(referrer=referrer)
        af.clawback(commission)
        commission.refresh_from_db()
        assert commission.status == AffiliateCommission.Status.CLAWED_BACK
        assert pay.get_wallet(referrer).available == Decimal("0")  # reversed

    def test_accrual_idempotent(self, employer, worker, category):
        referrer = User.objects.create_user(email="ref@example.com")
        af.attribute(employer, af.get_or_create_profile(referrer).slug)
        CommissionRule.objects.create(applies_to="any", min_amount=0, max_amount=1000, rate_pct=Decimal("20"))
        contract = completed_contract(employer, worker, category)
        af.accrue_for_contract(contract)
        af.accrue_for_contract(contract)  # replay
        assert AffiliateCommission.objects.filter(contract=contract).count() == 1


# ------------------------------------------------------------------ API smoke
@pytest.mark.django_db
class TestPhase8API:
    def test_affiliate_summary(self, employer):
        client = APIClient()
        client.force_authenticate(employer)
        res = client.get("/api/v1/me/affiliate")
        assert res.status_code == 200
        assert "slug" in res.json()

    def test_invoice_flow_over_api(self, employer, worker, category):
        completed_contract(employer, worker, category)
        wclient, eclient = APIClient(), APIClient()
        wclient.force_authenticate(worker)
        eclient.force_authenticate(employer)
        res = wclient.post("/api/v1/invoices", {"employer_id": employer.id, "period": "month"}, format="json")
        assert res.status_code == 201
        iid = res.json()["id"]
        conf = eclient.post(f"/api/v1/invoices/{iid}/confirm", format="json")
        assert conf.status_code == 200
        assert conf.json()["status"] == "confirmed"
