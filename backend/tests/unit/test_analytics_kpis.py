"""Admin dashboard KPIs/widgets (ADM-2/9): activity segments are activity-based (incl. dual-active),
liabilities split by bucket, the date-range selector resizes the charts, and ADM-9 widgets compute."""
from decimal import Decimal

import pytest

from apps.core.analytics import _chart_data, analytics_widgets, compute_kpis
from apps.jobs.models import Job, Proposal
from tests.factories import JobFactory, UserFactory

pytestmark = [pytest.mark.unit, pytest.mark.django_db]


def test_dual_active_segment_is_activity_based():
    user = UserFactory()
    JobFactory(employer=user, status=Job.Status.PUBLISHED)          # employer activity
    other_job = JobFactory(status=Job.Status.PUBLISHED)
    Proposal.objects.create(job=other_job, worker=user, budget=10, delivery_days=2,
                            description="x", status=Proposal.Status.SUBMITTED)  # worker activity

    kpis = compute_kpis()
    assert kpis["users_dual_active"] >= 1
    assert kpis["users_with_worker_activity"] >= 1
    assert kpis["users_with_employer_activity"] >= 1


def test_liabilities_split_by_bucket(fund_wallet):
    user = UserFactory()
    fund_wallet(user, "120")
    kpis = compute_kpis()
    assert kpis["wallet_available"] == Decimal("120")
    assert set(kpis) >= {"wallet_available", "wallet_escrow_held", "wallet_earnings_pending"}


def test_kpis_cover_every_user_input_content_type():
    """The admin report must surface a count for every user-input item type — offers, jobs,
    gallery, services, requests, reviews + the moderation queues (ID checks, chat reports)."""
    kpis = compute_kpis()
    assert {
        "total_jobs", "active_jobs",
        "total_services", "live_services",
        "total_proposals", "open_proposals",
        "total_buying_requests", "pending_buying_requests",
        "total_portfolio_items",
        "total_reviews",
        "pending_jobs", "pending_services",
        "pending_id_verifications", "open_chat_reports", "open_reports",
    } <= set(kpis)


def test_date_range_resizes_charts():
    assert len(_chart_data(7)["trend"]["labels"]) == 7
    assert len(_chart_data(30)["trend"]["labels"]) == 30
    assert len(_chart_data(1000)["trend"]["labels"]) == 90  # clamped


def test_widgets_compute():
    widgets = analytics_widgets()
    assert set(widgets) >= {"top_workers", "top_employers", "affiliate_funnel",
                            "jobs_by_category", "signup_funnel"}
    assert set(widgets["affiliate_funnel"]) == {"clicks", "registrations", "transactions"}
