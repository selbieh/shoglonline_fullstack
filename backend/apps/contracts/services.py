"""Contract domain services — every state/money transition from SRS §9.4 lives here.

All transitions are atomic with row locks. Money never moves outside payments.services.post
(double-entry ledger). The escrow legs satisfy BR-9/10 and the BR-24 rounding invariant:
    funding:    employer available  → employer escrow_held        (= budget)
    acceptance: employer escrow_held → worker earnings_pending     (= worker_earning)
                                     → platform available          (= commission)
    warranty:   worker earnings_pending → worker available        (= worker_earning)
    cancel:     employer escrow_held → employer available          (= budget, full refund)
    split:      escrow_held → employer available (refund) + worker available (net) + platform (commission)

Invariant asserted in tests: hold (budget) == worker_earning + commission, exactly.
"""
from datetime import timedelta
from decimal import ROUND_HALF_EVEN, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.services import get_setting
from apps.payments import services as pay
from apps.payments.models import Transaction

from .models import Contract, ContractEvent, Submission, UpdateRequest

CENT = Decimal("0.01")

ERR = {
    "not_party": {"code": "not_a_party", "message_ar": "لست طرفًا في هذا العقد"},
    "bad_state": {"code": "bad_contract_state", "message_ar": "لا يمكن تنفيذ هذا الإجراء في حالة العقد الحالية"},
    "funds": {"code": "insufficient_funds", "message_ar": "الرصيد المتاح لا يغطي قيمة العقد — اشحن محفظتك"},
    "reason": {"code": "reason_required", "message_ar": "السبب إلزامي"},
    "no_open_submission": {"code": "no_open_submission", "message_ar": "لا يوجد تسليم مفتوح للمراجعة"},
    "submission_open": {"code": "submission_open", "message_ar": "يوجد تسليم مفتوح بانتظار المراجعة بالفعل"},
}


def q2(value: Decimal) -> Decimal:
    """Banker's rounding to 2 decimals (BR-24)."""
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_EVEN)


def compute_commission(budget: Decimal, pct: Decimal) -> tuple[Decimal, Decimal]:
    """Return (commission, worker_earning) where commission + worker_earning == budget exactly.
    The commission row absorbs the sub-cent remainder (BR-24)."""
    commission = q2(budget * pct / Decimal("100"))
    worker_earning = budget - commission  # exact complement — no remainder ever escapes
    return commission, worker_earning


# Arabic titles for the contract events both parties are notified about (FR-TASK-7).
_EVENT_TITLES = {
    "created": "أُنشئ عقد جديد",
    "funded": "تم تمويل العقد وأصبح نشطًا",
    "delivered": "تم تسليم العمل",
    "accepted": "قُبل التسليم — بدأت فترة الضمان",
    "rejected": "رُفض التسليم — يلزم إعادة الإرسال",
    "updated": "تم تعديل شروط العقد",
    "cancel_requested": "طلب إلغاء العقد بالتراضي",
    "cancelled": "أُلغي العقد",
    "disputed": "فُتح نزاع على العقد",
    "resolved": "صدر قرار تسوية النزاع",
    "released": "حُرّرت أرباح العقد إلى رصيدك",
    "overdue": "تجاوز العقد موعده النهائي",
}


def _event(contract: Contract, kind: str, actor=None, detail: str = "") -> None:
    ContractEvent.objects.create(contract=contract, kind=kind, actor=actor, detail=detail)
    # Side-effect fan-out only — never money (SRS §23). Notify both parties (FR-TASK-7).
    from apps.notifications.services import notify_both  # noqa: PLC0415 (avoid import cycle)

    notify_both(
        contract.employer, contract.worker,
        kind="contract", title=_EVENT_TITLES.get(kind, "تحديث على العقد"),
        body=detail or contract.title, deep_link=f"/contracts/{contract.pk}",
    )


# ====================================================================== creation
@transaction.atomic
def create_contract_from_proposal(proposal) -> Contract:
    """FR-TASK-1/2: accepting a proposal binds a contract and tries to fund it at once.

    Commission is frozen now (FR-PAY-6). With sufficient employer balance the contract
    activates immediately; otherwise it waits in Pending Funding until the timeout (BR-6a).
    """
    job = proposal.job
    budget = Decimal(proposal.budget)
    pct = pay.commission_rate_for(budget)  # FR-PAY-6: admin tier by amount, else flat setting
    commission, worker_earning = compute_commission(budget, pct)
    timeout_h = int(get_setting("contracts.funding_timeout_hours", 48))

    deadline = job.deadline
    if deadline is None and proposal.delivery_days:
        deadline = (timezone.now() + timedelta(days=int(proposal.delivery_days))).date()

    contract = Contract.objects.create(
        job=job,
        proposal=proposal,
        employer=job.employer,
        worker=proposal.worker,
        title=job.title,
        scope=proposal.description or job.description,
        budget=budget,
        deadline=deadline,
        commission_pct=pct,
        commission_amount=commission,
        worker_earning=worker_earning,
        status=Contract.Status.PENDING_FUNDING,
        funding_deadline=timezone.now() + timedelta(hours=timeout_h),
    )
    _event(contract, "created", actor=job.employer, detail=f"قيمة العقد {budget}")
    return try_fund(contract)  # activates immediately if the employer is already funded


@transaction.atomic
def create_contract_from_request(buying_request) -> Contract:
    """Service flow (FR-SVC-7): accepting a buying request binds a contract that runs
    through the same escrow/delivery layer. Commission frozen now (FR-PAY-6)."""
    service = buying_request.service
    budget = Decimal(buying_request.total_price)
    pct = pay.commission_rate_for(budget)  # FR-PAY-6: admin tier by amount, else flat setting
    commission, worker_earning = compute_commission(budget, pct)
    timeout_h = int(get_setting("contracts.funding_timeout_hours", 48))

    contract = Contract.objects.create(
        service=service,
        buying_request=buying_request,
        employer=buying_request.employer,
        worker=service.worker,
        title=service.title,
        scope=buying_request.description or service.description,
        budget=budget,
        deadline=(timezone.now() + timedelta(days=int(buying_request.delivery_days or service.delivery_days))).date(),
        commission_pct=pct,
        commission_amount=commission,
        worker_earning=worker_earning,
        status=Contract.Status.PENDING_FUNDING,
        funding_deadline=timezone.now() + timedelta(hours=timeout_h),
    )
    _event(contract, "created", actor=buying_request.employer, detail=f"قيمة العقد {budget}")
    return try_fund(contract)


# ====================================================================== funding
@transaction.atomic
def try_fund(contract: Contract) -> Contract:
    """Reserve the budget from the employer's available balance (BR-9). Idempotent.

    On success the contract becomes Active: siblings auto-reject (BR-6) and the job
    moves to In Progress. With insufficient balance it stays Pending Funding (no error).
    """
    contract = Contract.objects.select_for_update().get(pk=contract.pk)
    if contract.status != Contract.Status.PENDING_FUNDING:
        return contract  # already funded / cancelled — idempotent

    employer_wallet = pay.Wallet.objects.select_for_update().get(pk=pay.get_wallet(contract.employer).pk)
    if employer_wallet.available < contract.budget:
        return contract  # wait for the employer to charge their wallet

    pay.post(employer_wallet, type=Transaction.Type.CONTRACT_HOLD, bucket=Transaction.Bucket.AVAILABLE,
             amount=-contract.budget, idempotency_key=f"contract:{contract.pk}:hold:available",
             note=f"حجز ضمان للعقد #{contract.pk}")
    pay.post(employer_wallet, type=Transaction.Type.CONTRACT_HOLD, bucket=Transaction.Bucket.ESCROW_HELD,
             amount=contract.budget, idempotency_key=f"contract:{contract.pk}:hold:escrow",
             note=f"حجز ضمان للعقد #{contract.pk}")

    contract.status = Contract.Status.ACTIVE
    contract.activated_at = timezone.now()
    contract.save(update_fields=["status", "activated_at"])
    _activate_side_effects(contract)
    # Open the contract conversation so both parties can chat freely (BR-11).
    from apps.chat.services import get_or_create_for_contract  # noqa: PLC0415 (avoid cycle)
    get_or_create_for_contract(contract)
    _event(contract, "funded", detail="فُعّل العقد بعد حجز الضمان")
    return contract


def _activate_side_effects(contract: Contract) -> None:
    """BR-6/6a: on Active, the job stops accepting proposals, siblings auto-reject,
    open invitations expire. No-op for service contracts (a gig has many concurrent contracts)."""
    if not contract.job_id:
        return
    from apps.jobs.models import Invitation, Job, Proposal

    job = contract.job
    Job.objects.filter(pk=job.pk).update(status=Job.Status.IN_PROGRESS)
    (Proposal.objects
        .filter(job=job, status__in=Proposal.OPEN_STATUSES)
        .exclude(pk=contract.proposal_id)
        .update(status=Proposal.Status.REJECTED,
                reject_reason="رُسّيت الوظيفة على متقدّم آخر"))
    job.invitations.filter(status=Invitation.Status.SENT).update(status=Invitation.Status.EXPIRED)


@transaction.atomic
def fund_now(contract: Contract, actor) -> Contract:
    """Employer-triggered funding after charging the wallet (FR-TASK-2)."""
    if actor.id != contract.employer_id:
        raise PermissionDenied(ERR["not_party"])
    contract = try_fund(contract)
    if contract.status == Contract.Status.PENDING_FUNDING:
        raise ValidationError(ERR["funds"])
    return contract


# ====================================================================== delivery
@transaction.atomic
def submit_deliverable(contract: Contract, worker, *, notes: str = "", files=None,
                       attachment_ids=None) -> Submission:
    """FR-TASK-3: worker submits; the first open submission moves the contract to Delivered."""
    if worker.id != contract.worker_id:
        raise PermissionDenied(ERR["not_party"])
    contract = Contract.objects.select_for_update().get(pk=contract.pk)
    if contract.status not in (Contract.Status.ACTIVE, Contract.Status.DELIVERED):
        raise ValidationError(ERR["bad_state"])
    if contract.submissions.filter(status=Submission.Status.OPEN).exists():
        raise ValidationError(ERR["submission_open"])
    submission = Submission.objects.create(contract=contract, notes=notes, files=files or [])
    if attachment_ids:
        from apps.attachments.services import attach  # noqa: PLC0415 (avoid import cycle)
        attach(attachment_ids, submission, worker)
    if contract.status == Contract.Status.ACTIVE:
        contract.status = Contract.Status.DELIVERED
        contract.delivered_at = timezone.now()
        contract.save(update_fields=["status", "delivered_at"])
    _event(contract, "delivered", actor=worker, detail=f"تسليم #{submission.pk}")
    return submission


@transaction.atomic
def accept_submission(submission: Submission, employer) -> Contract:
    """FR-TASK-4 / FR-PAY-5: completes the contract, splits escrow, starts the warranty (BR-10)."""
    contract = Contract.objects.select_for_update().get(pk=submission.contract_id)
    if employer.id != contract.employer_id:
        raise PermissionDenied(ERR["not_party"])
    if contract.status != Contract.Status.DELIVERED or submission.status != Submission.Status.OPEN:
        raise ValidationError(ERR["bad_state"])

    _post_completion_legs(contract)

    submission.status = Submission.Status.ACCEPTED
    submission.decided_at = timezone.now()
    submission.save(update_fields=["status", "decided_at"])

    warranty_days = int(get_setting("contracts.warranty_days", 60))
    contract.status = Contract.Status.COMPLETED
    contract.completed_at = timezone.now()
    contract.warranty_ends_at = contract.completed_at + timedelta(days=warranty_days)
    contract.save(update_fields=["status", "completed_at", "warranty_ends_at"])

    from apps.jobs.models import Job
    Job.objects.filter(pk=contract.job_id).update(status=Job.Status.COMPLETED)
    _event(contract, "accepted", actor=employer, detail="قُبل التسليم — بدأت فترة الضمان")
    return contract


def _post_completion_legs(contract: Contract) -> None:
    """escrow_held → worker earnings_pending (minus commission → platform). BR-9/24."""
    employer_wallet = pay.get_wallet(contract.employer)
    worker_wallet = pay.get_wallet(contract.worker)
    pay.post(employer_wallet, type=Transaction.Type.CONTRACT_RELEASE, bucket=Transaction.Bucket.ESCROW_HELD,
             amount=-contract.budget, idempotency_key=f"contract:{contract.pk}:release:escrow",
             note=f"تحرير ضمان العقد #{contract.pk}")
    pay.post(worker_wallet, type=Transaction.Type.EARNING, bucket=Transaction.Bucket.EARNINGS_PENDING,
             amount=contract.worker_earning, idempotency_key=f"contract:{contract.pk}:release:earning",
             note=f"أرباح العقد #{contract.pk} (قيد الضمان)")
    if contract.commission_amount > 0:
        pay.post(pay.get_platform_wallet(), type=Transaction.Type.COMMISSION, bucket=Transaction.Bucket.AVAILABLE,
                 amount=contract.commission_amount, idempotency_key=f"contract:{contract.pk}:commission",
                 note=f"عمولة المنصة على العقد #{contract.pk}")


@transaction.atomic
def reject_submission(submission: Submission, employer, reason: str) -> Submission:
    """FR-TASK-4: rejecting reverts the contract to Active until a resubmission."""
    contract = Contract.objects.select_for_update().get(pk=submission.contract_id)
    if employer.id != contract.employer_id:
        raise PermissionDenied(ERR["not_party"])
    if not reason.strip():
        raise ValidationError(ERR["reason"])
    if submission.status != Submission.Status.OPEN or contract.status != Contract.Status.DELIVERED:
        raise ValidationError(ERR["bad_state"])
    submission.status = Submission.Status.REJECTED
    submission.reject_reason = reason
    submission.decided_at = timezone.now()
    submission.save(update_fields=["status", "reject_reason", "decided_at"])
    contract.status = Contract.Status.ACTIVE
    contract.save(update_fields=["status"])
    _event(contract, "rejected", actor=employer, detail=reason[:200])
    return submission


# ====================================================================== warranty
@transaction.atomic
def release_warranty(contract: Contract) -> Contract:
    """BR-10: at warranty end, worker earnings_pending → available. Idempotent (funds_released)."""
    contract = Contract.objects.select_for_update().get(pk=contract.pk)
    if contract.status != Contract.Status.COMPLETED or contract.funds_released:
        return contract
    worker_wallet = pay.get_wallet(contract.worker)
    pay.post(worker_wallet, type=Transaction.Type.CONTRACT_RELEASE, bucket=Transaction.Bucket.EARNINGS_PENDING,
             amount=-contract.worker_earning, idempotency_key=f"contract:{contract.pk}:warranty:pending",
             note=f"انتهاء ضمان العقد #{contract.pk}")
    pay.post(worker_wallet, type=Transaction.Type.EARNING, bucket=Transaction.Bucket.AVAILABLE,
             amount=contract.worker_earning, idempotency_key=f"contract:{contract.pk}:warranty:available",
             note=f"تحرير أرباح العقد #{contract.pk}")
    contract.funds_released = True
    contract.save(update_fields=["funds_released"])
    # BR-10 single atomic transition: release funds, flip the conversation read-only
    # (Postgres AND Firestore mirror), and lock reviews.
    from apps.chat.services import lock_contract_conversations  # noqa: PLC0415 (avoid cycle)
    from apps.reviews.services import lock_contract_reviews  # noqa: PLC0415 (avoid cycle)
    lock_contract_conversations(contract)
    lock_contract_reviews(contract)
    # BR-18: affiliate commission accrues at warranty release (not acceptance).
    from apps.affiliate.services import accrue_for_contract  # noqa: PLC0415 (avoid cycle)
    accrue_for_contract(contract)
    _event(contract, "released", detail="حُرّرت الأرباح إلى الرصيد المتاح")
    return contract


# ====================================================================== update requests
@transaction.atomic
def request_update(contract: Contract, actor, *, new_budget=None, new_deadline=None, message: str = "") -> UpdateRequest:
    """FR-TASK-5: either party proposes budget/deadline changes on an Active/Delivered contract."""
    if not contract.is_party(actor):
        raise PermissionDenied(ERR["not_party"])
    if contract.status not in (Contract.Status.ACTIVE, Contract.Status.DELIVERED):
        raise ValidationError(ERR["bad_state"])
    if new_budget is None and new_deadline is None:
        raise ValidationError({"code": "empty_update", "message_ar": "حدّد ميزانية أو موعدًا جديدًا"})
    if new_budget is not None and Decimal(str(new_budget)) <= 0:
        # A negative/zero budget would invert the escrow math (over-refund / negative escrow, BR-9).
        raise ValidationError({"code": "bad_budget", "message_ar": "الميزانية الجديدة يجب أن تكون أكبر من صفر"})
    return UpdateRequest.objects.create(
        contract=contract, requested_by=actor,
        new_budget=(Decimal(str(new_budget)) if new_budget is not None else None),
        new_deadline=new_deadline, message=message,
    )


@transaction.atomic
def respond_update(update: UpdateRequest, actor, *, accept: bool, reason: str = "") -> UpdateRequest:
    """The counterpart accepts or rejects. Accepting a budget change adjusts the escrow hold
    in the correct direction (FR-TASK-5); insufficient funds park the *change* in pending_funding."""
    update = UpdateRequest.objects.select_for_update().get(pk=update.pk)
    contract = Contract.objects.select_for_update().get(pk=update.contract_id)
    if not contract.is_party(actor):
        raise PermissionDenied(ERR["not_party"])
    if actor.id == update.requested_by_id:
        raise PermissionDenied({"code": "needs_counterpart", "message_ar": "الطرف الآخر هو من يردّ على الطلب"})
    if update.status not in (UpdateRequest.Status.PENDING, UpdateRequest.Status.PENDING_FUNDING):
        raise ValidationError(ERR["bad_state"])
    # The contract may have completed/cancelled/disputed AFTER this update was raised (especially a
    # PENDING_FUNDING-parked one): re-check here so we never re-hold or refund escrow against a
    # terminal contract (that would strand funds / drive escrow negative).
    if contract.status not in (Contract.Status.ACTIVE, Contract.Status.DELIVERED):
        raise ValidationError(ERR["bad_state"])

    if not accept:
        update.status = UpdateRequest.Status.REJECTED
        update.reject_reason = reason
        update.decided_at = timezone.now()
        update.save(update_fields=["status", "reject_reason", "decided_at"])
        return update

    if update.new_budget is not None and update.new_budget != contract.budget:
        diff = update.new_budget - contract.budget
        employer_wallet = pay.Wallet.objects.select_for_update().get(pk=pay.get_wallet(contract.employer).pk)
        if diff > 0:  # budget increase: reserve the extra
            if employer_wallet.available < diff:
                # FR-TASK-5: park the CHANGE (not the contract) until the employer charges.
                # The counterpart can accept again once funds are available.
                update.status = UpdateRequest.Status.PENDING_FUNDING
                update.save(update_fields=["status"])
                return update
            pay.post(employer_wallet, type=Transaction.Type.CONTRACT_HOLD, bucket=Transaction.Bucket.AVAILABLE,
                     amount=-diff, idempotency_key=f"contract:{contract.pk}:update:{update.pk}:hold:available",
                     note=f"حجز فرق زيادة ميزانية العقد #{contract.pk}")
            pay.post(employer_wallet, type=Transaction.Type.CONTRACT_HOLD, bucket=Transaction.Bucket.ESCROW_HELD,
                     amount=diff, idempotency_key=f"contract:{contract.pk}:update:{update.pk}:hold:escrow",
                     note=f"حجز فرق زيادة ميزانية العقد #{contract.pk}")
        else:  # budget decrease: refund the difference to the employer
            give_back = -diff
            pay.post(employer_wallet, type=Transaction.Type.CONTRACT_RELEASE, bucket=Transaction.Bucket.ESCROW_HELD,
                     amount=-give_back, idempotency_key=f"contract:{contract.pk}:update:{update.pk}:rel:escrow",
                     note=f"تخفيض ميزانية العقد #{contract.pk}")
            pay.post(employer_wallet, type=Transaction.Type.REFUND, bucket=Transaction.Bucket.AVAILABLE,
                     amount=give_back, idempotency_key=f"contract:{contract.pk}:update:{update.pk}:rel:available",
                     note=f"استرداد فرق تخفيض العقد #{contract.pk}")
        # re-freeze commission against the new budget (keeps the BR-24 invariant true)
        contract.budget = update.new_budget
        contract.commission_amount, contract.worker_earning = compute_commission(
            contract.budget, contract.commission_pct
        )
        contract.save(update_fields=["budget", "commission_amount", "worker_earning"])

    if update.new_deadline is not None:
        contract.deadline = update.new_deadline
        contract.save(update_fields=["deadline"])

    update.status = UpdateRequest.Status.ACCEPTED
    update.decided_at = timezone.now()
    update.save(update_fields=["status", "decided_at"])
    _event(contract, "updated", actor=actor, detail="قُبل تعديل شروط العقد")
    return update


# ====================================================================== cancellation
@transaction.atomic
def request_cancel(contract: Contract, actor, reason: str = "") -> Contract:
    """FR-TASK-8(a): one party requests mutual cancellation; the other must confirm."""
    contract = Contract.objects.select_for_update().get(pk=contract.pk)
    if not contract.is_party(actor):
        raise PermissionDenied(ERR["not_party"])
    if contract.status not in (Contract.Status.ACTIVE, Contract.Status.DELIVERED):
        raise ValidationError(ERR["bad_state"])
    contract.cancel_requested_by = actor
    contract.cancel_reason = reason
    contract.save(update_fields=["cancel_requested_by", "cancel_reason"])
    _event(contract, "cancel_requested", actor=actor, detail=reason[:200])
    return contract


@transaction.atomic
def confirm_cancel(contract: Contract, actor) -> Contract:
    """The counterpart confirms → Cancelled with a full escrow refund to the employer (BR-9)."""
    contract = Contract.objects.select_for_update().get(pk=contract.pk)
    if not contract.is_party(actor):
        raise PermissionDenied(ERR["not_party"])
    if contract.cancel_requested_by_id is None or actor.id == contract.cancel_requested_by_id:
        raise PermissionDenied({"code": "needs_counterpart", "message_ar": "يلزم تأكيد الطرف الآخر"})
    if contract.status not in (Contract.Status.ACTIVE, Contract.Status.DELIVERED):
        raise ValidationError(ERR["bad_state"])
    _refund_escrow_full(contract)
    contract.status = Contract.Status.CANCELLED
    contract.save(update_fields=["status"])
    _close_job_after_cancel(contract)
    _event(contract, "cancelled", actor=actor, detail="إلغاء بالتراضي — رُدّ الضمان كاملًا")
    return contract


def _refund_escrow_full(contract: Contract) -> None:
    employer_wallet = pay.get_wallet(contract.employer)
    pay.post(employer_wallet, type=Transaction.Type.CONTRACT_RELEASE, bucket=Transaction.Bucket.ESCROW_HELD,
             amount=-contract.budget, idempotency_key=f"contract:{contract.pk}:cancel:escrow",
             note=f"إلغاء العقد #{contract.pk}")
    pay.post(employer_wallet, type=Transaction.Type.REFUND, bucket=Transaction.Bucket.AVAILABLE,
             amount=contract.budget, idempotency_key=f"contract:{contract.pk}:cancel:available",
             note=f"استرداد ضمان العقد #{contract.pk}")


def _close_job_after_cancel(contract: Contract) -> None:
    """Awarded job whose contract is cancelled returns to the owner as Closed (§9.1)."""
    from apps.jobs.models import Job
    Job.objects.filter(pk=contract.job_id).update(status=Job.Status.CLOSED)


# ====================================================================== disputes (BR-22)
@transaction.atomic
def open_dispute(contract: Contract, actor, *, reason: str = "", ticket_ref: str = "") -> Contract:
    """A dispute (from a submission or overdue escalation) flags the contract Disputed (FR-TASK-4/9)."""
    contract = Contract.objects.select_for_update().get(pk=contract.pk)
    if not contract.is_party(actor):
        raise PermissionDenied(ERR["not_party"])
    if contract.status not in (Contract.Status.ACTIVE, Contract.Status.DELIVERED):
        raise ValidationError(ERR["bad_state"])
    contract.status = Contract.Status.DISPUTED
    contract.dispute_ticket_ref = ticket_ref
    contract.save(update_fields=["status", "dispute_ticket_ref"])
    _event(contract, "disputed", actor=actor, detail=reason[:200])
    return contract


@transaction.atomic
def resolve_dispute(contract: Contract, *, outcome: str, refund_pct: Decimal = Decimal("0"),
                    actor=None, note: str = "") -> Contract:
    """BR-22: admin closes a dispute with exactly one outcome, posting explicit ledger legs.

    outcome ∈ {resume, complete, cancel, split}. `split` refunds refund_pct% to the employer
    and pays the remainder to the worker minus recalculated commission. The contract never
    remains Disputed after resolution.
    """
    contract = Contract.objects.select_for_update().get(pk=contract.pk)
    if contract.status != Contract.Status.DISPUTED:
        raise ValidationError(ERR["bad_state"])

    if outcome == "resume":
        contract.status = Contract.Status.DELIVERED if contract.delivered_at else Contract.Status.ACTIVE
        contract.resolution_note = note
        contract.save(update_fields=["status", "resolution_note"])

    elif outcome == "complete":
        _post_completion_legs(contract)
        warranty_days = int(get_setting("contracts.warranty_days", 60))
        contract.status = Contract.Status.COMPLETED
        contract.completed_at = timezone.now()
        contract.warranty_ends_at = contract.completed_at + timedelta(days=warranty_days)
        contract.resolution_note = note
        contract.save(update_fields=["status", "completed_at", "warranty_ends_at", "resolution_note"])
        from apps.jobs.models import Job
        Job.objects.filter(pk=contract.job_id).update(status=Job.Status.COMPLETED)

    elif outcome == "cancel":
        _refund_escrow_full(contract)
        contract.status = Contract.Status.CANCELLED
        contract.resolution_note = note
        contract.save(update_fields=["status", "resolution_note"])
        _close_job_after_cancel(contract)

    elif outcome == "split":
        refund_amount = q2(contract.budget * Decimal(str(refund_pct)) / Decimal("100"))
        payout_gross = contract.budget - refund_amount
        commission = q2(payout_gross * contract.commission_pct / Decimal("100"))
        worker_net = payout_gross - commission  # exact complement (BR-24)
        employer_wallet = pay.get_wallet(contract.employer)
        worker_wallet = pay.get_wallet(contract.worker)
        # remove the whole hold, then post each leg explicitly
        pay.post(employer_wallet, type=Transaction.Type.CONTRACT_RELEASE, bucket=Transaction.Bucket.ESCROW_HELD,
                 amount=-contract.budget, idempotency_key=f"contract:{contract.pk}:split:escrow",
                 note=f"تسوية نزاع العقد #{contract.pk}")
        if refund_amount > 0:
            pay.post(employer_wallet, type=Transaction.Type.REFUND, bucket=Transaction.Bucket.AVAILABLE,
                     amount=refund_amount, idempotency_key=f"contract:{contract.pk}:split:refund",
                     note=f"استرداد جزئي ({refund_pct}%) — نزاع العقد #{contract.pk}")
        if worker_net > 0:
            pay.post(worker_wallet, type=Transaction.Type.EARNING, bucket=Transaction.Bucket.AVAILABLE,
                     amount=worker_net, idempotency_key=f"contract:{contract.pk}:split:payout",
                     note=f"دفعة جزئية — نزاع العقد #{contract.pk}")
        if commission > 0:
            pay.post(pay.get_platform_wallet(), type=Transaction.Type.COMMISSION, bucket=Transaction.Bucket.AVAILABLE,
                     amount=commission, idempotency_key=f"contract:{contract.pk}:split:commission",
                     note=f"عمولة تسوية العقد #{contract.pk}")
        contract.status = Contract.Status.COMPLETED
        contract.completed_at = timezone.now()
        contract.funds_released = True  # dispute payout is terminal — no warranty hold
        contract.resolution_note = note or f"تسوية: استرداد {refund_pct}%"
        contract.save(update_fields=["status", "completed_at", "funds_released", "resolution_note"])
        from apps.jobs.models import Job
        Job.objects.filter(pk=contract.job_id).update(status=Job.Status.COMPLETED)
        # Terminal payout bypasses the warranty sweeper, so do its side-effects here:
        # lock the conversation (BR-10) and reviews (BR-13), and accrue affiliate on the
        # *actually collected* commission (BR-18) — not the frozen full commission_amount.
        from apps.chat.services import lock_contract_conversations  # noqa: PLC0415 (avoid cycle)
        from apps.reviews.services import lock_contract_reviews  # noqa: PLC0415
        from apps.affiliate.services import accrue_for_contract  # noqa: PLC0415
        lock_contract_conversations(contract)
        lock_contract_reviews(contract)
        accrue_for_contract(contract, base_override=commission)
    else:
        raise ValidationError({"code": "bad_outcome", "message_ar": "نتيجة تسوية غير معروفة"})

    _close_coupled_ticket(contract, outcome)
    _event(contract, "resolved", actor=actor, detail=contract.resolution_note[:200])
    return contract


def _close_coupled_ticket(contract: Contract, outcome: str) -> None:
    """BR-22: once the dispute is resolved the contract is no longer Disputed, so the coupled
    dispute ticket (linked via dispute_ticket_ref) can be — and is — closed automatically."""
    ref = (contract.dispute_ticket_ref or "").strip()
    if not ref.isdigit():
        return
    from apps.tickets.models import Ticket  # noqa: PLC0415 (avoid import cycle)
    from apps.tickets.services import close as close_ticket  # noqa: PLC0415

    ticket = Ticket.objects.filter(pk=int(ref)).first()
    if ticket is not None and ticket.status != Ticket.Status.CLOSED:
        close_ticket(ticket, report=f"حُسم النزاع المرتبط بالعقد #{contract.pk}: {outcome}")
