"""Funding-timeout sweeper (BR-6a) — fills the gap noted in the QA plan.

`cancel_unfunded_contracts` auto-cancels Pending-Funding contracts whose funding_deadline
has passed; funded/active or still-in-window contracts are left untouched.
"""
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.contracts.models import Contract
from apps.contracts.tasks import cancel_unfunded_contracts
from tests.factories import ContractFactory

pytestmark = [pytest.mark.tasks, pytest.mark.django_db]


def test_unfunded_past_deadline_is_cancelled():
    contract = ContractFactory(funding_deadline=timezone.now() - timedelta(hours=1))

    cancelled = cancel_unfunded_contracts()

    assert cancelled >= 1
    contract.refresh_from_db()
    assert contract.status == Contract.Status.CANCELLED
    assert contract.cancel_reason  # records why


def test_unfunded_within_deadline_is_left_alone():
    contract = ContractFactory(funding_deadline=timezone.now() + timedelta(hours=5))

    cancel_unfunded_contracts()

    contract.refresh_from_db()
    assert contract.status == Contract.Status.PENDING_FUNDING


def test_active_contract_is_never_touched():
    contract = ContractFactory(
        status=Contract.Status.ACTIVE,
        funding_deadline=timezone.now() - timedelta(hours=1),
    )

    cancel_unfunded_contracts()

    contract.refresh_from_db()
    assert contract.status == Contract.Status.ACTIVE
