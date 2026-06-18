"""Bid usage history (FR-BID-2): period filters (current month/year/all/custom) + a per-reason
summary (granted/purchased/consumed/refunded/net)."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.bids.models import BidLedger
from tests.factories import UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_summary_and_balance_all_time():
    user = UserFactory()
    BidLedger.objects.create(user=user, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    BidLedger.objects.create(user=user, delta=-1, reason=BidLedger.Reason.CONSUME)
    BidLedger.objects.create(user=user, delta=1, reason=BidLedger.Reason.REFUND_JOB_CLOSED)

    resp = auth(user).get("/api/v1/me/bids/history?period=all")
    assert resp.status_code == 200
    body = resp.json()
    assert body["balance"] == 10
    summary = body["summary"]
    assert summary["granted"] == 10
    assert summary["consumed"] == 1   # reported as a positive count of bids used
    assert summary["refunded"] == 1
    assert summary["net"] == 10


def test_current_year_excludes_old_entries():
    user = UserFactory()
    old = BidLedger.objects.create(user=user, delta=5, reason=BidLedger.Reason.SIGNUP_GRANT)
    BidLedger.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=400))
    BidLedger.objects.create(user=user, delta=3, reason=BidLedger.Reason.PURCHASE)

    resp = auth(user).get("/api/v1/me/bids/history?period=current_year")
    assert resp.json()["summary"]["net"] == 3  # the 400-day-old grant is excluded
    assert resp.json()["balance"] == 8          # balance is all-time, unaffected by the filter


def test_reason_filter():
    user = UserFactory()
    BidLedger.objects.create(user=user, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    BidLedger.objects.create(user=user, delta=-1, reason=BidLedger.Reason.CONSUME)
    resp = auth(user).get("/api/v1/me/bids/history?reason=consume")
    assert len(resp.json()["ledger"]) == 1
    assert resp.json()["ledger"][0]["reason"] == "consume"


def test_custom_period_from_to():
    user = UserFactory()
    inside = BidLedger.objects.create(user=user, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    outside = BidLedger.objects.create(user=user, delta=4, reason=BidLedger.Reason.PURCHASE)
    BidLedger.objects.filter(pk=inside.pk).update(created_at=timezone.now() - timedelta(days=5))
    BidLedger.objects.filter(pk=outside.pk).update(created_at=timezone.now() - timedelta(days=60))

    frm = (timezone.now() - timedelta(days=10)).date().isoformat()
    to = timezone.now().date().isoformat()
    resp = auth(user).get(f"/api/v1/me/bids/history?period=custom&from={frm}&to={to}")
    assert resp.json()["summary"]["net"] == 10  # only the in-window grant counts
