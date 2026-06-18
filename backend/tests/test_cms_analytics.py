"""Phase 9 — CMS pages/FAQ + admin analytics (SRS ADM-2, ADM-6)."""
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bids.models import BidLedger
from apps.catalog.models import Category
from apps.cms.models import ContentPage, FAQItem
from apps.contracts import services as cs
from apps.core.analytics import compute_kpis
from apps.core.services import set_setting
from apps.jobs import services as js
from apps.jobs.models import Job
from apps.payments import services as pay
from apps.payments.models import Transaction


@pytest.fixture(autouse=True)
def _flags(db):
    set_setting("jobs.auto_publish", True)
    set_setting("payments.commission_pct", 10)


# ------------------------------------------------------------------ CMS
@pytest.mark.django_db
class TestCMS:
    def test_published_page_public(self, db):
        ContentPage.objects.create(slug="about", title="من نحن", body="نص", is_published=True)
        ContentPage.objects.create(slug="draft", title="مسودة", body="x", is_published=False)
        client = APIClient()
        assert client.get("/api/v1/pages/about").status_code == 200
        assert client.get("/api/v1/pages/draft").status_code == 404  # unpublished hidden
        assert client.get("/api/v1/pages").json()["count"] == 1

    def test_faqs_public(self, db):
        FAQItem.objects.create(question="كيف أبدأ؟", answer="سجّل دخولك", is_published=True)
        FAQItem.objects.create(question="مخفي", answer="x", is_published=False)
        res = APIClient().get("/api/v1/faqs")
        assert res.status_code == 200
        assert res.json()["count"] == 1


# ------------------------------------------------------------------ analytics
@pytest.mark.django_db
class TestAnalytics:
    def test_kpis_reflect_state(self, db):
        emp = User.objects.create_user(email="emp@example.com")
        wk = User.objects.create_user(email="wk@example.com")
        BidLedger.objects.create(user=wk, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
        cat = Category.objects.create(name_ar="برمجة", name_en="Dev", slug="dev")
        job = Job.objects.create(employer=emp, title="مهمة", description="و", category=cat,
                                 budget_min=10, budget_max=500, status=Job.Status.PUBLISHED,
                                 published_at=timezone.now())
        proposal = js.submit_proposal(worker=wk, job=job, budget=Decimal("100"),
                                      delivery_days=5, description="x", answers={})
        pay.post(pay.get_wallet(emp), type=Transaction.Type.DEPOSIT,
                 bucket=Transaction.Bucket.AVAILABLE, amount=Decimal("150"), note="seed")
        contract = js.accept_proposal(proposal)
        sub = cs.submit_deliverable(contract, wk, notes="done")
        cs.accept_submission(sub, emp)

        kpis = compute_kpis()
        assert kpis["users_total"] == 2
        assert kpis["platform_commission"] == Decimal("10")  # 10% of 100
        assert kpis["wallet_earnings_pending"] == Decimal("90")
        assert kpis["active_contracts"] == 0  # completed, no longer "open"
        assert kpis["gmv"] == Decimal("100")

    def test_stats_endpoint_staff_only(self, db):
        staff = User.objects.create_user(email="admin@example.com", is_staff=True)
        normal = User.objects.create_user(email="user@example.com")
        admin_client = APIClient()
        admin_client.force_authenticate(staff)
        assert admin_client.get("/api/v1/admin/stats").status_code == 200
        user_client = APIClient()
        user_client.force_authenticate(normal)
        assert user_client.get("/api/v1/admin/stats").status_code == 403  # not staff
