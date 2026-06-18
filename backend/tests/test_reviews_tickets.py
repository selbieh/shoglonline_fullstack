"""Phase 6 — Reviews & Tickets (SRS FR-REV, FR-TKT, BR-13/22, AC-7/9)."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bids.models import BidLedger
from apps.catalog.models import Category
from apps.contracts import services as cs
from apps.contracts.models import Contract
from apps.contracts.tasks import release_due_warranties
from apps.core.services import set_setting
from apps.jobs import services as js
from apps.jobs.models import Job
from apps.payments import services as pay
from apps.payments.models import Transaction
from apps.reviews import services as rv
from apps.reviews.models import Review
from apps.tickets import services as tk
from apps.tickets.models import Ticket, TicketType
from apps.tickets.tasks import auto_close_tickets, auto_solve_tickets


@pytest.fixture(autouse=True)
def _flags(db):
    set_setting("jobs.auto_publish", True)
    set_setting("payments.commission_pct", 10)
    set_setting("contracts.warranty_days", 60)
    set_setting("tickets.auto_solve_days", 7)
    set_setting("tickets.auto_close_days", 7)


@pytest.fixture()
def employer(db):
    return User.objects.create_user(email="emp@example.com", first_name="رب")


@pytest.fixture()
def worker(db):
    u = User.objects.create_user(email="wk@example.com", first_name="عامل")
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


def active_contract(employer, worker, category, budget="100"):
    job = Job.objects.create(employer=employer, title="مهمة2", description="وصف", category=category,
                             budget_min=10, budget_max=500, status=Job.Status.PUBLISHED,
                             published_at=timezone.now())
    proposal = js.submit_proposal(worker=worker, job=job, budget=Decimal(budget),
                                  delivery_days=7, description="عرض", answers={})
    pay.post(pay.get_wallet(employer), type=Transaction.Type.DEPOSIT,
             bucket=Transaction.Bucket.AVAILABLE, amount=Decimal(budget) + Decimal("50"), note="seed")
    return js.accept_proposal(proposal)


# ------------------------------------------------------------------ reviews
@pytest.mark.django_db
class TestReviews:
    def test_only_after_completion(self, employer, worker, category):
        contract = active_contract(employer, worker, category)
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            rv.leave_review(contract, employer, rating=5)

    def test_one_per_party_both_sides(self, employer, worker, category):
        contract = completed_contract(employer, worker, category)
        rv.leave_review(contract, employer, rating=5, comment="ممتاز")
        rv.leave_review(contract, worker, rating=4, comment="جيد")
        assert Review.objects.filter(contract=contract).count() == 2
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            rv.leave_review(contract, employer, rating=3)  # duplicate

    def test_subject_is_counterpart(self, employer, worker, category):
        contract = completed_contract(employer, worker, category)
        review = rv.leave_review(contract, employer, rating=5)
        assert review.subject_id == worker.id

    def test_edit_in_warranty_then_locked(self, employer, worker, category):
        contract = completed_contract(employer, worker, category)
        review = rv.leave_review(contract, employer, rating=3)
        rv.edit_review(review, employer, rating=5, comment="حسّنت رأيي")
        review.refresh_from_db()
        assert review.rating == 5
        # warranty ends → release locks reviews (BR-13)
        Contract.objects.filter(pk=contract.pk).update(warranty_ends_at=timezone.now() - timedelta(days=1))
        release_due_warranties()
        review.refresh_from_db()
        assert review.is_locked
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            rv.edit_review(review, employer, rating=1)

    def test_aggregates_update_on_profile(self, employer, worker, category):
        c1 = completed_contract(employer, worker, category)
        rv.leave_review(c1, employer, rating=4)  # employer → worker
        worker.refresh_from_db()
        assert worker.worker_profile.rating_count == 1
        assert worker.worker_profile.rating_avg == Decimal("4.00")

    def test_review_after_warranty_is_born_locked(self, employer, worker, category):
        contract = completed_contract(employer, worker, category)
        Contract.objects.filter(pk=contract.pk).update(
            warranty_ends_at=timezone.now() - timedelta(days=1), funds_released=True
        )
        contract.refresh_from_db()
        review = rv.leave_review(contract, employer, rating=5)
        assert review.is_locked


# ------------------------------------------------------------------ tickets
@pytest.mark.django_db
class TestTickets:
    def test_status_machine_reply_solve_close(self, employer, db):
        t_type = TicketType.objects.create(name_ar="عام", slug="general")
        ticket = tk.create_ticket(employer, ticket_type=t_type, title="استفسار", message="سؤال")
        assert ticket.status == Ticket.Status.OPEN
        tk.reply(ticket, employer, "تذكير", is_staff=True)
        ticket.refresh_from_db()
        assert ticket.status == Ticket.Status.ANSWERED
        tk.solve(ticket)
        ticket.refresh_from_db()
        assert ticket.status == Ticket.Status.SOLVED
        tk.close(ticket)
        ticket.refresh_from_db()
        assert ticket.status == Ticket.Status.CLOSED

    def test_closed_is_read_only(self, employer, db):
        t_type = TicketType.objects.create(name_ar="عام", slug="general")
        ticket = tk.create_ticket(employer, ticket_type=t_type, title="x", message="y")
        tk.close(ticket)
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            tk.reply(ticket, employer, "بعد الإغلاق")

    def test_dispute_ticket_flags_contract(self, employer, worker, category):
        contract = active_contract(employer, worker, category)
        t_type = TicketType.objects.create(name_ar="نزاع", slug="dispute", is_dispute=True)
        tk.create_ticket(employer, ticket_type=t_type, title="مشكلة", message="تفاصيل", contract=contract)
        contract.refresh_from_db()
        assert contract.status == Contract.Status.DISPUTED  # BR-22 coupling

    def test_cannot_close_until_dispute_resolved(self, employer, worker, category):
        contract = active_contract(employer, worker, category)
        t_type = TicketType.objects.create(name_ar="نزاع", slug="dispute", is_dispute=True)
        ticket = tk.create_ticket(employer, ticket_type=t_type, title="م", message="ت", contract=contract)
        from rest_framework.exceptions import ValidationError
        with pytest.raises(ValidationError):
            tk.close(ticket)  # blocked while contract Disputed (BR-22)
        cs.resolve_dispute(contract, outcome="cancel")  # admin resolves
        tk.close(ticket)  # now allowed
        ticket.refresh_from_db()
        assert ticket.status == Ticket.Status.CLOSED

    def test_auto_solve_then_auto_close(self, employer, db):
        t_type = TicketType.objects.create(name_ar="عام", slug="general")
        ticket = tk.create_ticket(employer, ticket_type=t_type, title="x", message="y")
        Ticket.objects.filter(pk=ticket.pk).update(last_activity_at=timezone.now() - timedelta(days=10))
        assert auto_solve_tickets() == 1
        ticket.refresh_from_db()
        assert ticket.status == Ticket.Status.SOLVED
        Ticket.objects.filter(pk=ticket.pk).update(last_activity_at=timezone.now() - timedelta(days=10))
        assert auto_close_tickets() == 1
        ticket.refresh_from_db()
        assert ticket.status == Ticket.Status.CLOSED


# ------------------------------------------------------------------ API smoke
@pytest.mark.django_db
class TestPhase6API:
    def test_review_flow_over_api(self, employer, worker, category):
        contract = completed_contract(employer, worker, category)
        client = APIClient()
        client.force_authenticate(employer)
        res = client.post(f"/api/v1/contracts/{contract.pk}/reviews",
                          {"rating": 5, "comment": "رائع"}, format="json")
        assert res.status_code == 201
        # public profile reviews
        pub = APIClient().get(f"/api/v1/users/{worker.id}/reviews")
        assert pub.status_code == 200
        assert pub.json()["summary"]["count"] == 1

    def test_ticket_flow_over_api(self, employer, db):
        TicketType.objects.create(name_ar="عام", slug="general")
        client = APIClient()
        client.force_authenticate(employer)
        t_type = client.get("/api/v1/ticket-types").json()["results"][0]
        res = client.post("/api/v1/tickets",
                          {"type_id": t_type["id"], "title": "سؤال", "message": "نص"}, format="json")
        assert res.status_code == 201
        tid = res.json()["id"]
        rep = client.post(f"/api/v1/tickets/{tid}/replies", {"message": "إضافة"}, format="json")
        assert rep.status_code == 201
        assert len(rep.json()["replies"]) == 1
