"""End-to-end freelancer job lifecycle over the real DRF API (the whole money + work narrative
in one ordered test).

This walks the complete happy path a real client and freelancer take — onboarding, a published
profile/service/portfolio, a posted job, a proposal, a funded wallet, acceptance, the escrow
freeze, the auto-opened chat, delivery + approval, the escrow split, the warranty release, and the
chat closure — asserting the DB state, status transitions, ledger invariants, and notifications at
every step. The per-app suites (test_jobs_api, test_contracts_api, test_chat) cover each phase in
isolation; this proves they compose into one consistent system across UI-facing endpoints, wallet
buckets, and the notification fan-out.

Key behaviours this pins (and where they diverge from a naive reading of the flow):
  * Chat opens when the contract becomes ACTIVE (funded) — `try_fund` auto-creates the conversation
    inside accept, not at the proposal stage.
  * Payment is two-phase: accepting the delivery splits escrow into the worker's `earnings_pending`
    + commission (contract COMPLETED, warranty starts); the worker's money only reaches withdrawable
    `available` at warranty end via `release_due_warranties`.
  * Chat closure (read-only) happens at warranty end, bundled into the warranty release.

Run: docker compose exec backend python -m pytest tests/integration/test_full_lifecycle.py -v --no-cov
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.chat.models import Conversation
from apps.contracts.models import Contract, Submission
from apps.contracts.tasks import release_due_warranties
from apps.core.services import set_setting
from apps.jobs.models import Job, Proposal
from apps.notifications.models import Notification
from apps.payments import services as pay
from apps.payments.models import Transaction
from apps.profiles.models import Education, Employment, WorkerProfile

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

BUDGET = Decimal("150")  # the proposal/contract budget that flows through escrow
DEPOSIT = Decimal("500")  # the client tops up more than the budget (leftover stays available)


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def _bucket_total(wallet, bucket):
    """The true balance of a wallet bucket = sum of its succeeded ledger rows (the BR-9 invariant
    the denormalized field must always equal)."""
    rows = Transaction.objects.filter(
        wallet=wallet, bucket=bucket, status=Transaction.Status.SUCCEEDED
    )
    return sum((t.amount for t in rows), Decimal("0"))


def _assert_wallet_invariant(user):
    """Every denormalized bucket balance must equal the sum of its succeeded ledger rows."""
    wallet = pay.get_wallet(user)
    for bucket in (Transaction.Bucket.AVAILABLE, Transaction.Bucket.ESCROW_HELD,
                   Transaction.Bucket.EARNINGS_PENDING):
        field = {"available": "available", "escrow_held": "escrow_held",
                 "earnings_pending": "earnings_pending"}[bucket]
        assert getattr(wallet, field) == _bucket_total(wallet, bucket), (
            f"{user.email} {bucket} denorm != ledger sum"
        )


def test_full_freelancer_job_lifecycle(employer, worker, category, fund_wallet):
    # ---------------------------------------------------------------------------------------------
    # Phase 0 — deterministic flags so published/live objects land directly (no admin-review detour)
    # ---------------------------------------------------------------------------------------------
    set_setting("profiles.auto_publish", True)
    set_setting("services.auto_publish", True)
    set_setting("jobs.auto_publish", True)
    set_setting("proposals.auto_publish", True)
    set_setting("payments.commission_pct", 10)
    set_setting("contracts.warranty_days", 60)

    # =============================================================================================
    # Phase 1 — Freelancer onboarding: complete the profile (≥70%) and publish it
    # =============================================================================================
    profile, _ = WorkerProfile.objects.get_or_create(user=worker)
    profile.bio_title = "مطوّر برمجيات"
    profile.overview = "نبذة كافية عن الخبرة والمشاريع السابقة"
    profile.expertise_level = WorkerProfile.ExpertiseLevel.EXPERT
    profile.hourly_rate = 20
    profile.save()
    Education.objects.create(profile=profile, school="جامعة")
    Employment.objects.create(profile=profile, company="شركة", job_title="مطوّر")
    assert profile.completeness_pct >= 70  # 6/8 of the completeness checks = 75%

    pub = auth(worker).post("/api/v1/me/profile/publish", format="json")
    assert pub.status_code == 200, pub.content
    profile.refresh_from_db()
    assert profile.publish_state == WorkerProfile.PublishState.PUBLISHED  # auto_publish ON → live now

    # ---- 1b. Create a service → goes live immediately (services.auto_publish ON) ----
    svc = auth(worker).post(
        "/api/v1/me/services",
        {"title": "تصميم واجهات احترافية", "description": "أصمّم واجهات ويب حديثة ومتجاوبة بدقة عالية",
         "category": category.pk, "base_price": "120", "delivery_days": 5},
        format="json",
    )
    assert svc.status_code == 201, svc.content
    assert svc.json()["status"] == "live"

    # ---- 1c. Add a portfolio item (public gallery entry) ----
    port = auth(worker).post(
        "/api/v1/me/portfolio",
        {"title": "مشروع متجر إلكتروني", "description": "واجهة متجر", "media_type": "link",
         "url": "https://example.com/work"},
        format="json",
    )
    assert port.status_code == 201, port.content

    # =============================================================================================
    # Phase 2 — Client posts a job → PUBLISHED and visible in the public marketplace
    # =============================================================================================
    created = auth(employer).post(
        "/api/v1/me/jobs",
        {"title": "بناء موقع تعريفي", "description": "وصف تفصيلي للوظيفة المطلوبة وكامل المتطلبات",
         "category": category.pk, "budget_min": "100", "budget_max": "300"},
        format="json",
    )
    assert created.status_code == 201, created.content
    job = created.json()
    assert job["status"] == Job.Status.PUBLISHED

    # public, anonymous detail by slug works (the job is discoverable)
    assert APIClient().get(f"/api/v1/jobs/{job['slug']}").status_code == 200

    # =============================================================================================
    # Phase 3 — Freelancer applies: a proposal is created and one bid is consumed
    # =============================================================================================
    from apps.bids.services import bid_balance
    bids_before = bid_balance(worker)
    sub = auth(worker).post(
        f"/api/v1/jobs/{job['id']}/proposals",
        {"budget": str(BUDGET), "delivery_days": 10, "description": "خطة تنفيذ مفصّلة للمشروع"},
        format="json",
    )
    assert sub.status_code == 201, sub.content
    pid = sub.json()["id"]
    assert Proposal.objects.get(pk=pid).status == Proposal.Status.SUBMITTED
    assert bid_balance(worker) == bids_before - 1  # exactly one bid consumed
    assert Job.objects.get(pk=job["id"]).proposals_count == 1
    # the employer is notified of the incoming proposal
    assert Notification.objects.filter(user=employer, kind=Notification.Kind.PROPOSAL).exists()

    # =============================================================================================
    # Phase 4 — Client funds the wallet (PayPal-stub deposit, posted via the real ledger)
    # =============================================================================================
    fund_wallet(employer, str(DEPOSIT))
    employer_wallet = pay.get_wallet(employer)
    assert employer_wallet.available == DEPOSIT
    assert Transaction.objects.filter(
        wallet=employer_wallet, type=Transaction.Type.DEPOSIT, status=Transaction.Status.SUCCEEDED
    ).exists()
    _assert_wallet_invariant(employer)

    # =============================================================================================
    # Phase 5 — Client accepts the proposal → contract is created and auto-funds to ACTIVE
    # =============================================================================================
    acc = auth(employer).post(f"/api/v1/proposals/{pid}/accept", format="json")
    assert acc.status_code == 200, acc.content
    assert acc.json()["contract"]["status"] == "active"

    contract = Contract.objects.get(worker=worker, employer=employer)
    assert Proposal.objects.get(pk=pid).status == Proposal.Status.ACCEPTED
    assert contract.status == Contract.Status.ACTIVE
    assert Job.objects.get(pk=job["id"]).status == Job.Status.IN_PROGRESS

    # =============================================================================================
    # Phase 6 — Escrow freeze: the budget is held; commission + earning == budget exactly (BR-24)
    # =============================================================================================
    employer_wallet.refresh_from_db()
    assert employer_wallet.escrow_held == BUDGET
    assert employer_wallet.available == DEPOSIT - BUDGET  # leftover stays spendable
    # two contract_hold legs: available − budget, escrow + budget
    holds = Transaction.objects.filter(wallet=employer_wallet, type=Transaction.Type.CONTRACT_HOLD)
    assert holds.filter(bucket=Transaction.Bucket.AVAILABLE, amount=-BUDGET).exists()
    assert holds.filter(bucket=Transaction.Bucket.ESCROW_HELD, amount=BUDGET).exists()
    assert contract.commission_amount + contract.worker_earning == contract.budget == BUDGET
    _assert_wallet_invariant(employer)

    # =============================================================================================
    # Phase 7 — Chat opens automatically on funding; messages round-trip both directions over REST
    # =============================================================================================
    conv = contract.conversations.first()
    assert conv is not None and conv.status == Conversation.Status.ACTIVE
    assert conv.has_member(employer) and conv.has_member(worker)

    # both parties see the conversation in their list
    assert auth(employer).get("/api/v1/me/conversations").json()["count"] == 1
    assert auth(worker).get("/api/v1/me/conversations").json()["count"] == 1

    # employer → worker
    m1 = auth(employer).post(
        f"/api/v1/conversations/{conv.pk}/messages", {"body": "مرحبًا، لنبدأ العمل"}, format="json")
    assert m1.status_code == 201, m1.content
    # worker → employer (reply)
    m2 = auth(worker).post(
        f"/api/v1/conversations/{conv.pk}/messages", {"body": "تمام، سأبدأ الآن"}, format="json")
    assert m2.status_code == 201, m2.content

    # the worker reads the thread (GET marks read) → their unread clears
    listing = auth(worker).get(f"/api/v1/conversations/{conv.pk}/messages")
    assert listing.status_code == 200
    assert len(listing.json()["messages"]) == 2
    worker_conv = auth(worker).get("/api/v1/me/conversations").json()["results"][0]
    assert worker_conv["unread"] == 0
    # each party was notified of the other's message
    assert Notification.objects.filter(user=worker, kind=Notification.Kind.CHAT_MESSAGE).exists()
    assert Notification.objects.filter(user=employer, kind=Notification.Kind.CHAT_MESSAGE).exists()

    # =============================================================================================
    # Phase 8 — Delivery & approval: worker delivers → employer accepts → contract COMPLETED
    # =============================================================================================
    deliver = auth(worker).post(
        f"/api/v1/contracts/{contract.pk}/submissions", {"notes": "تم تسليم العمل كاملًا"}, format="json")
    assert deliver.status_code == 201, deliver.content
    contract.refresh_from_db()
    assert contract.status == Contract.Status.DELIVERED
    # contract-lifecycle events all fan out as kind="contract"; pin the delivery one by its title
    assert Notification.objects.filter(
        user=employer, kind=Notification.Kind.CONTRACT, title="تم تسليم العمل").exists()

    submission = Submission.objects.get(contract=contract)
    approve = auth(employer).post(f"/api/v1/submissions/{submission.pk}/accept", format="json")
    assert approve.status_code == 200, approve.content
    contract.refresh_from_db()
    assert contract.status == Contract.Status.COMPLETED
    assert contract.warranty_ends_at is not None
    assert Job.objects.get(pk=job["id"]).status == Job.Status.COMPLETED

    # =============================================================================================
    # Phase 9 — Escrow split (at acceptance): money moves but is not yet withdrawable by the worker
    # =============================================================================================
    employer_wallet.refresh_from_db()
    worker_wallet = pay.get_wallet(worker)
    assert employer_wallet.escrow_held == 0  # released out of escrow
    assert worker_wallet.earnings_pending == contract.worker_earning  # held during warranty
    assert worker_wallet.available == 0  # nothing withdrawable yet
    _assert_wallet_invariant(employer)
    _assert_wallet_invariant(worker)

    # =============================================================================================
    # Phase 9b — Warranty release: advance the clock, run the beat task → worker earnings unlock
    # =============================================================================================
    assert release_due_warranties() == 0  # not due yet
    Contract.objects.filter(pk=contract.pk).update(
        warranty_ends_at=timezone.now() - timedelta(days=1))
    assert release_due_warranties() == 1  # exactly this contract releases

    contract.refresh_from_db()
    worker_wallet.refresh_from_db()
    assert contract.funds_released is True
    assert worker_wallet.earnings_pending == 0
    assert worker_wallet.available == contract.worker_earning  # now withdrawable
    # the worker is told their earnings were released (the "released" contract event)
    assert Notification.objects.filter(
        user=worker, kind=Notification.Kind.CONTRACT, title="حُرّرت أرباح العقد إلى رصيدك").exists()
    _assert_wallet_invariant(worker)

    # =============================================================================================
    # Phase 10 — Chat closure: the conversation flips read-only and rejects new sends
    # =============================================================================================
    conv.refresh_from_db()
    assert conv.status == Conversation.Status.READ_ONLY
    blocked = auth(employer).post(
        f"/api/v1/conversations/{conv.pk}/messages", {"body": "رسالة متأخرة"}, format="json")
    assert blocked.status_code == 400
    assert blocked.json()["code"] == "conversation_read_only"
    # reading is still allowed (read-only, not invisible)
    assert auth(worker).get(f"/api/v1/conversations/{conv.pk}/messages").status_code == 200

    # =============================================================================================
    # Cross-cutting — a notification exists for each key lifecycle event the two parties care about
    # =============================================================================================
    assert Notification.objects.filter(user=employer, kind=Notification.Kind.PROPOSAL).exists()
    assert Notification.objects.filter(user=worker, kind=Notification.Kind.CONTRACT).exists()
    assert Notification.objects.filter(user=worker, kind=Notification.Kind.CHAT_MESSAGE).exists()
    # contract lifecycle milestones (created/funded/delivered/accepted/released) all land as
    # kind="contract"; the worker should have several by the end
    assert Notification.objects.filter(user=worker, kind=Notification.Kind.CONTRACT).count() >= 3
