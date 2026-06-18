"""NFR-REL-3 (Part 12 step 5): the periodic sweepers survive failure injection. A single poisoned
row is logged and skipped — it never aborts the batch — and stays in its pre-run state so the next
beat tick (an at-least-once retry) reprocesses it. Paired with the idempotency guards proven in
tests/test_payments.py + tests/tasks/test_contracts_tasks.py, this covers the AC-5 'idempotent +
retried background jobs with dead-letter handling' acceptance row.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contracts import services as csvc
from apps.contracts.models import Contract
from apps.contracts.tasks import release_due_warranties
from apps.payments import paypal
from apps.payments.models import Transaction
from apps.payments.tasks import reconcile_pending_deposits
from config.celery_app import app
from tests.factories import ContractFactory, UserFactory

pytestmark = [pytest.mark.tasks, pytest.mark.django_db]


def _completed_due(fund_wallet) -> Contract:
    """An active funded contract carried to COMPLETED with its warranty already lapsed."""
    employer, worker = UserFactory(), UserFactory()
    commission, earning = csvc.compute_commission(Decimal("100"), Decimal("10"))
    c = ContractFactory(employer=employer, worker=worker, budget=Decimal("100"),
                        commission_pct=Decimal("10"), commission_amount=commission, worker_earning=earning)
    fund_wallet(employer, "100")
    c = csvc.try_fund(c)
    sub = csvc.submit_deliverable(c, c.worker)
    csvc.accept_submission(sub, c.employer)
    Contract.objects.filter(pk=c.pk).update(warranty_ends_at=timezone.now() - timedelta(minutes=1))
    return Contract.objects.get(pk=c.pk)


def test_release_due_warranties_isolates_a_poisoned_row(fund_wallet, monkeypatch):
    bad = _completed_due(fund_wallet)
    good = _completed_due(fund_wallet)

    real = csvc.release_warranty

    def flaky(contract):
        if contract.pk == bad.pk:
            raise RuntimeError("simulated release failure")
        return real(contract)

    monkeypatch.setattr(csvc, "release_warranty", flaky)

    # the healthy contract still releases; the poisoned one is skipped, not raised
    assert release_due_warranties() == 1
    bad.refresh_from_db()
    good.refresh_from_db()
    assert bad.funds_released is False  # left for the next tick
    assert good.funds_released is True


def _stale_pending(amount: str) -> str:
    """A PENDING paypal deposit older than the 5-min reconcile cutoff; returns its gateway_ref."""
    client = APIClient()
    client.force_authenticate(UserFactory())
    order_id = client.post("/api/v1/wallet/charge", {"amount": amount}, format="json").json()["order_id"]
    Transaction.objects.filter(gateway_ref=order_id).update(created_at=timezone.now() - timedelta(hours=1))
    return order_id


def test_reconcile_isolates_a_failing_gateway_poll(monkeypatch):
    good_ref = _stale_pending("30")
    bad_ref = _stale_pending("40")

    real = paypal.get_order_status

    def flaky(ref):
        if ref == bad_ref:
            raise RuntimeError("gateway timeout")
        return real(ref)

    monkeypatch.setattr(paypal, "get_order_status", flaky)

    # only the reachable row settles; the unreachable one is logged and stays PENDING for the next tick
    assert reconcile_pending_deposits() == 1
    assert Transaction.objects.get(gateway_ref=bad_ref).status == Transaction.Status.PENDING
    assert Transaction.objects.get(gateway_ref=good_ref).status == Transaction.Status.SUCCEEDED


def test_celery_is_configured_for_resilient_redelivery():
    """The reliability knobs NFR-REL-3 leans on must actually be in effect."""
    conf = app.conf
    assert conf.task_acks_late is True
    assert conf.task_reject_on_worker_lost is True
    assert conf.worker_prefetch_multiplier == 1
    assert conf.broker_transport_options.get("visibility_timeout")
