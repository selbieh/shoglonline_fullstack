"""Contract sweepers with a frozen/relative clock (SRS §23): funding-timeout cancel (BR-6a),
warranty release (BR-10), overdue notifier (FR-TASK-9). Also asserts every beat task imports."""
import importlib
from datetime import timedelta
from decimal import Decimal

import pytest
from django.conf import settings
from django.utils import timezone

from apps.contracts import services as svc
from apps.contracts.models import Contract, Submission
from apps.contracts.tasks import (
    cancel_unfunded_contracts,
    notify_overdue_contracts,
    release_due_warranties,
)
from apps.payments import services as pay
from config.celery_app import app
from tests.factories import ContractFactory, UserFactory

pytestmark = [pytest.mark.tasks, pytest.mark.django_db]


def make_active(fund_wallet, budget="100"):
    employer, worker = UserFactory(), UserFactory()
    commission, earning = svc.compute_commission(Decimal(budget), Decimal("10"))
    c = ContractFactory(employer=employer, worker=worker, budget=Decimal(budget),
                        commission_pct=Decimal("10"), commission_amount=commission, worker_earning=earning)
    fund_wallet(employer, budget)
    return svc.try_fund(c)


def test_cancel_unfunded_past_deadline():
    c = ContractFactory(status=Contract.Status.PENDING_FUNDING,
                        funding_deadline=timezone.now() - timedelta(hours=1))
    assert cancel_unfunded_contracts() == 1
    c.refresh_from_db()
    assert c.status == Contract.Status.CANCELLED
    # a contract still within its window is untouched
    ContractFactory(status=Contract.Status.PENDING_FUNDING,
                    funding_deadline=timezone.now() + timedelta(hours=5))
    assert cancel_unfunded_contracts() == 0


def test_release_due_warranties(fund_wallet):
    c = make_active(fund_wallet)
    sub = svc.submit_deliverable(c, c.worker)
    svc.accept_submission(sub, c.employer)  # → COMPLETED, earnings_pending funded
    Contract.objects.filter(pk=c.pk).update(warranty_ends_at=timezone.now() - timedelta(minutes=1))

    assert release_due_warranties() == 1
    c.refresh_from_db()
    assert c.funds_released is True
    w = pay.get_wallet(c.worker)
    w.refresh_from_db()
    assert w.earnings_pending == Decimal("0")
    assert w.available == Decimal("90")  # 100 − 10% commission
    # idempotent: a second sweep releases nothing
    assert release_due_warranties() == 0


def test_notify_overdue_skips_open_submission_and_is_once(fund_wallet):
    overdue = make_active(fund_wallet)
    Contract.objects.filter(pk=overdue.pk).update(deadline=timezone.now().date() - timedelta(days=1))

    # a second contract that's overdue BUT has an open submission must be skipped
    with_sub = make_active(fund_wallet)
    Contract.objects.filter(pk=with_sub.pk).update(deadline=timezone.now().date() - timedelta(days=1))
    Submission.objects.create(contract=with_sub, status=Submission.Status.OPEN)

    assert notify_overdue_contracts() == 1  # only `overdue`
    overdue.refresh_from_db()
    assert overdue.overdue_notified_at is not None
    # notified-once: re-running flags nobody new
    assert notify_overdue_contracts() == 0


def test_every_beat_task_is_registered():
    """Guards against a scheduled task name drifting from an actual importable @shared_task."""
    for name, entry in settings.CELERY_BEAT_SCHEDULE.items():
        module_path, func_name = entry["task"].rsplit(".", 1)
        module = importlib.import_module(module_path)
        task = getattr(module, func_name, None)
        assert task is not None, f"beat job '{name}': {entry['task']} does not exist"
        # importing the module registers the shared_task with the app
        assert entry["task"] in app.tasks, f"beat job '{name}': {entry['task']} is not a celery task"
