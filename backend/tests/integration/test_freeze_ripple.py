"""Freeze ripple (BR-23 / FR-ADM-5): freezing a mid-flight dual-role user unlists their jobs &
services, suspends their open proposals/invitations, flips conversations read-only, stops affiliate
accrual, and notifies contract counterparts — while leaving escrow holds and the ledger untouched.
Reactivation restores every suspended row to its exact pre-freeze status. (AC-1b)"""
from decimal import Decimal

import pytest

from apps.accounts.models import User
from apps.accounts.services import freeze_user, unfreeze_user
from apps.affiliate.services import get_or_create_profile
from apps.chat.models import Conversation
from apps.contracts import services as contract_svc
from apps.contracts.models import Contract
from apps.gigs.models import Service
from apps.jobs.models import Invitation, Job, Proposal
from apps.notifications.models import Notification
from apps.payments import services as pay
from tests.factories import JobFactory, ServiceFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def _ordered(a, b):
    return (a, b) if a.id < b.id else (b, a)


def _scenario(fund_wallet):
    """A dual-role user with a published job, live service, open proposal, sent invitation,
    a DIRECT conversation, an ACTIVE contract (as employer), and a funded wallet."""
    user = UserFactory()
    other = UserFactory()

    job = JobFactory(employer=user, status=Job.Status.PUBLISHED)              # owned listing
    service = ServiceFactory(worker=user, status=Service.Status.LIVE)          # owned listing

    others_job = JobFactory(employer=other, status=Job.Status.PUBLISHED)
    proposal = Proposal.objects.create(job=others_job, worker=user, budget=Decimal("50"),
                                       delivery_days=3, description="عرض", status=Proposal.Status.SUBMITTED)
    invitation = Invitation.objects.create(job=others_job, employer=other, worker=user,
                                           status=Invitation.Status.SENT)

    a, b = _ordered(user, other)
    conv = Conversation.objects.create(user_a=a, user_b=b, context_type=Conversation.Context.DIRECT,
                                       status=Conversation.Status.ACTIVE)

    # ACTIVE contract with `user` as employer (escrow held from user's wallet).
    commission, earning = contract_svc.compute_commission(Decimal("100"), Decimal("10"))
    contract = Contract.objects.create(employer=user, worker=other, title="عقد", budget=Decimal("100"),
                                       commission_pct=Decimal("10"), commission_amount=commission,
                                       worker_earning=earning, status=Contract.Status.PENDING_FUNDING)
    fund_wallet(user, "100")
    contract_svc.try_fund(contract)
    contract.refresh_from_db()
    assert contract.status == Contract.Status.ACTIVE

    get_or_create_profile(user)  # affiliate profile exists
    return user, other, job, service, proposal, invitation, conv, contract


def test_freeze_applies_every_ripple_and_leaves_escrow_intact(fund_wallet):
    user, other, job, service, proposal, invitation, conv, contract = _scenario(fund_wallet)

    wallet_before = pay.get_wallet(user)
    buckets_before = (wallet_before.available, wallet_before.escrow_held, wallet_before.earnings_pending)
    notes_before = Notification.objects.filter(user=other).count()

    freeze_user(user, reason="abuse")

    user.refresh_from_db()
    assert user.status == User.Status.FROZEN
    assert user.is_active is False  # already-issued access tokens are rejected immediately

    # listings unlisted, proposal/invitation suspended (prev preserved)
    for obj in (job, service, proposal, invitation, conv):
        obj.refresh_from_db()
    assert job.status == Job.Status.SUSPENDED and job.frozen_prev_status == Job.Status.PUBLISHED
    assert service.status == Service.Status.PAUSED and service.frozen_prev_status == Service.Status.LIVE
    assert proposal.status == Proposal.Status.SUSPENDED and proposal.frozen_prev_status == Proposal.Status.SUBMITTED
    assert invitation.status == Invitation.Status.SUSPENDED and invitation.frozen_prev_status == Invitation.Status.SENT
    assert conv.status == Conversation.Status.READ_ONLY

    # affiliate accrual stopped
    assert get_or_create_profile(user).is_frozen is True

    # contract untouched; counterpart notified of options
    contract.refresh_from_db()
    assert contract.status == Contract.Status.ACTIVE
    assert Notification.objects.filter(user=other).count() == notes_before + 1

    # ESCROW / ledger untouched by the freeze (BR-23)
    wallet_after = pay.get_wallet(user)
    assert (wallet_after.available, wallet_after.escrow_held, wallet_after.earnings_pending) == buckets_before
    assert wallet_after.escrow_held == Decimal("100")


def test_reactivate_restores_exact_prior_status(fund_wallet):
    user, other, job, service, proposal, invitation, conv, contract = _scenario(fund_wallet)
    freeze_user(user)
    unfreeze_user(user)

    for obj in (user, job, service, proposal, invitation, conv):
        obj.refresh_from_db()

    assert user.status == User.Status.ACTIVE
    assert user.is_active is True  # auth re-enabled on reactivation
    assert job.status == Job.Status.PUBLISHED and job.frozen_prev_status == ""
    assert service.status == Service.Status.LIVE and service.frozen_prev_status == ""
    assert proposal.status == Proposal.Status.SUBMITTED and proposal.frozen_prev_status == ""
    assert invitation.status == Invitation.Status.SENT and invitation.frozen_prev_status == ""
    assert conv.status == Conversation.Status.ACTIVE
    assert get_or_create_profile(user).is_frozen is False


def test_freeze_is_idempotent_and_only_touches_owned_rows(fund_wallet):
    user, other, *_ = _scenario(fund_wallet)
    # a second LIVE service owned by `other` must NOT be paused by freezing `user`
    others_service = ServiceFactory(worker=other, status=Service.Status.LIVE)
    freeze_user(user)
    freeze_user(user)  # idempotent — no crash, no double effect
    others_service.refresh_from_db()
    assert others_service.status == Service.Status.LIVE
    assert others_service.frozen_prev_status == ""


def test_unfreeze_keeps_terminated_contract_conversation_read_only(fund_wallet):
    """If a contract completes during the freeze, its conversation must stay read-only on unfreeze."""
    user, other = UserFactory(), UserFactory()
    commission, earning = contract_svc.compute_commission(Decimal("100"), Decimal("10"))
    contract = Contract.objects.create(employer=user, worker=other, title="عقد", budget=Decimal("100"),
                                       commission_pct=Decimal("10"), commission_amount=commission,
                                       worker_earning=earning, status=Contract.Status.PENDING_FUNDING)
    fund_wallet(user, "100")
    contract_svc.try_fund(contract)  # creates the contract conversation (ACTIVE)
    conv = contract.conversations.first()
    assert conv.status == Conversation.Status.ACTIVE

    freeze_user(user)
    conv.refresh_from_db()
    assert conv.status == Conversation.Status.READ_ONLY  # locked by the freeze

    # contract terminates while the user is frozen
    Contract.objects.filter(pk=contract.pk).update(
        status=Contract.Status.COMPLETED, funds_released=True
    )
    unfreeze_user(user)

    conv.refresh_from_db()
    assert conv.status == Conversation.Status.READ_ONLY  # NOT reactivated (BR-10)
    assert conv.frozen_prev_status == ""  # tracking cleared either way


def test_unfreeze_noop_on_active_user():
    user = UserFactory()
    assert unfreeze_user(user).status == User.Status.ACTIVE  # no-op, no crash


def test_freeze_guards_block_new_commitments(fund_wallet):
    """assert_active blocks a frozen party at every pre-contract transaction (BR-23)."""
    from rest_framework.exceptions import PermissionDenied

    from apps.gigs import services as gig_svc
    from apps.gigs.models import BuyingRequest, Service
    from apps.jobs import services as job_svc

    frozen = UserFactory()
    active = UserFactory()
    freeze_user(frozen)

    # frozen worker cannot submit a proposal
    job = JobFactory(employer=active, status=Job.Status.PUBLISHED)
    with pytest.raises(PermissionDenied):
        job_svc.submit_proposal(worker=frozen, job=job, budget=10, delivery_days=2,
                                description="x", answers={})

    # cannot invite a frozen worker
    with pytest.raises(PermissionDenied):
        job_svc.invite_worker(employer=active, job=job, worker=frozen)

    # frozen employer cannot buy a service
    service = ServiceFactory(worker=active, status=Service.Status.LIVE)
    with pytest.raises(PermissionDenied):
        gig_svc.request_service(employer=frozen, service=service)

    # a request from a frozen buyer cannot be accepted by an active seller
    active_buyer = UserFactory()
    req = gig_svc.request_service(employer=active_buyer, service=service)
    freeze_user(active_buyer)
    with pytest.raises(PermissionDenied):
        gig_svc.accept_request(BuyingRequest.objects.get(pk=req.pk), active)


def test_frozen_worker_proposal_cannot_be_accepted(fund_wallet):
    """A still-suspended proposal can never be awarded → no contract with a frozen party (BR-23)."""
    from apps.jobs import services as job_svc

    employer = UserFactory()
    worker = UserFactory()
    job = JobFactory(employer=employer, status=Job.Status.PUBLISHED)
    proposal = Proposal.objects.create(job=job, worker=worker, budget=Decimal("50"),
                                       delivery_days=3, description="عرض", status=Proposal.Status.SUBMITTED)
    freeze_user(worker)
    proposal.refresh_from_db()
    assert proposal.status == Proposal.Status.SUSPENDED

    from rest_framework.exceptions import ValidationError
    with pytest.raises(ValidationError):
        job_svc.accept_proposal(proposal)
    assert not Contract.objects.filter(worker=worker).exists()
