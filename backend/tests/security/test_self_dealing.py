"""BR-21 self-dealing guards: a user can never transact with themselves — blocked at the API
(Arabic error) and, for contracts, by a DB CHECK constraint as a last line of defense."""
from decimal import Decimal

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.core.services import set_setting
from apps.gigs.models import Service
from tests.factories import (
    CategoryFactory,
    ContractFactory,
    JobFactory,
    ServiceFactory,
    UserFactory,
)

pytestmark = [pytest.mark.security, pytest.mark.django_db, pytest.mark.srs("BR-21")]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_employer_cannot_bid_on_own_job():
    set_setting("proposals.auto_publish", True)
    from apps.bids.models import BidLedger
    employer = UserFactory()
    BidLedger.objects.create(user=employer, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    job = JobFactory(employer=employer)
    res = auth(employer).post(
        f"/api/v1/jobs/{job.pk}/proposals",
        {"budget": "150", "delivery_days": 5, "description": "x"}, format="json",
    )
    assert res.status_code == 403  # BR-21


def test_worker_cannot_buy_own_service():
    worker = UserFactory()
    service = ServiceFactory(worker=worker, category=CategoryFactory(), status=Service.Status.LIVE)
    res = auth(worker).post(f"/api/v1/services/{service.pk}/requests", {"quantity": 1}, format="json")
    assert res.status_code == 403  # BR-21


def test_contract_self_dealing_blocked_by_db_constraint():
    u = UserFactory()
    with pytest.raises(IntegrityError):
        ContractFactory(employer=u, worker=u, budget=Decimal("100"))
