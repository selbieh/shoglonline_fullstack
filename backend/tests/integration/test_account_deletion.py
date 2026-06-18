"""Account deletion (BR-2/3 / FR-PROF-7): DELETE /me is blocked per each BR-2 condition with the
exact blockers + settlement paths; a clean deletion soft-deletes, anonymizes public content and
expires listings while retaining the financial ledger immutably."""
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.contracts import services as contract_svc
from apps.contracts.models import Contract
from apps.gigs.models import BuyingRequest, Service
from apps.jobs.models import Job
from apps.payments import services as pay
from apps.payments.models import Transaction
from tests.factories import JobFactory, ServiceFactory, UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _delete(user, reason="leaving"):
    return auth(user).delete("/api/v1/auth/me", {"reason": reason}, format="json")


def _blocker_codes(resp):
    return {b["code"] for b in resp.json()["blockers"]}


def test_blocked_by_open_contract(fund_wallet):
    user, worker = UserFactory(), UserFactory()
    commission, earning = contract_svc.compute_commission(Decimal("100"), Decimal("10"))
    c = Contract.objects.create(employer=user, worker=worker, title="عقد", budget=Decimal("100"),
                                commission_pct=Decimal("10"), commission_amount=commission,
                                worker_earning=earning, status=Contract.Status.PENDING_FUNDING)
    fund_wallet(user, "100")
    contract_svc.try_fund(c)

    resp = _delete(user)
    assert resp.status_code == 409
    assert "open_contracts" in _blocker_codes(resp)
    user.refresh_from_db()
    assert user.status == User.Status.ACTIVE  # not deleted


def test_blocked_by_wallet_balance(fund_wallet):
    user = UserFactory()
    fund_wallet(user, "50")
    resp = _delete(user)
    assert resp.status_code == 409
    assert "wallet_not_empty" in _blocker_codes(resp)


def test_blocked_by_unsettled_withdrawal(fund_wallet):
    user = UserFactory()
    fund_wallet(user, "50")
    pay.request_withdrawal(user, Decimal("50"), "p@p.com")  # debits available → 0, withdrawal REQUESTED
    resp = _delete(user)
    assert resp.status_code == 409
    codes = _blocker_codes(resp)
    assert "withdrawal_in_progress" in codes
    assert "wallet_not_empty" not in codes  # available is already held to 0


def test_blocked_by_pending_service_request():
    buyer = UserFactory()
    seller = UserFactory()
    service = ServiceFactory(worker=seller, status=Service.Status.LIVE)
    BuyingRequest.objects.create(service=service, employer=buyer, status=BuyingRequest.Status.PENDING)
    resp = _delete(buyer)
    assert resp.status_code == 409
    assert "pending_service_requests" in _blocker_codes(resp)


def test_each_blocker_lists_a_settlement_path(fund_wallet):
    user = UserFactory()
    fund_wallet(user, "50")
    resp = _delete(user)
    assert all(b.get("settlement") and b.get("message_ar") for b in resp.json()["blockers"])


def test_clean_delete_soft_deletes_anonymizes_and_retains_ledger(fund_wallet):
    user = UserFactory(email="real@example.com", first_name="حقيقي")
    WorkerProfileFactory(user=user, bio_title="مطوّر", is_verified=True)
    job = JobFactory(employer=user, status=Job.Status.PUBLISHED)

    # produce ledger history that nets to a zero balance (deposit then a fully-paid withdrawal)
    fund_wallet(user, "30")
    wd = pay.request_withdrawal(user, Decimal("30"), "p@p.com")
    pay.process_withdrawal(wd, paid=True)
    wallet = pay.get_wallet(user)
    assert wallet.available == Decimal("0")

    resp = _delete(user, reason="not_needed")
    assert resp.status_code == 204

    user.refresh_from_db()
    assert user.status == User.Status.DELETED
    assert user.email != "real@example.com" and user.email.endswith("@deleted.invalid")
    assert user.first_name == "" and user.google_sub is None and user.is_active is False

    job.refresh_from_db()
    assert job.status == Job.Status.CLOSED  # listing unpublished

    from apps.profiles.models import WorkerProfile
    wp = WorkerProfile.objects.get(user=user)
    assert wp.bio_title == "" and wp.is_verified is False

    # ledger retained immutably (BR-3)
    assert Transaction.objects.filter(wallet=wallet).exists()


def test_deleted_account_cannot_be_deleted_again(fund_wallet):
    user = UserFactory()
    assert _delete(user).status_code == 204
    # the user is now anonymized + inactive; a second call still authenticates via force_auth
    # but delete_account is idempotent at the service layer
    from apps.accounts.services import delete_account
    again = delete_account(user)
    assert again.status == User.Status.DELETED


def test_clean_delete_locks_active_conversations():
    from apps.chat.models import Conversation

    user, other = UserFactory(), UserFactory()
    a, b = (user, other) if user.id < other.id else (other, user)
    conv = Conversation.objects.create(user_a=a, user_b=b, context_type=Conversation.Context.DIRECT,
                                       status=Conversation.Status.ACTIVE)
    assert _delete(user).status_code == 204
    conv.refresh_from_db()
    assert conv.status == Conversation.Status.READ_ONLY


def test_delete_account_service_raises_with_blockers(fund_wallet):
    """Direct service call (race path) refuses when a blocker is present."""
    from rest_framework.exceptions import ValidationError

    from apps.accounts.services import delete_account
    user = UserFactory()
    fund_wallet(user, "5")
    with pytest.raises(ValidationError):
        delete_account(user, reason="x")
    user.refresh_from_db()
    assert user.status == User.Status.ACTIVE
