"""Job & proposal domain services — every transition from SRS §9.1/9.2 lives here.

Money-free Phase 2 boundary: accepting a proposal moves the job to in_progress and
the proposal to accepted. Contract creation + escrow funding + sibling auto-reject
on Active (BR-6/6a) plug in here in Phase 3 — marked with PHASE3 comments.
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.bids.models import BidLedger
from apps.bids.services import InsufficientBids, consume_bid, refund_bid
from apps.core.contact_guard import contains_contact_info
from apps.core.services import get_setting

from .models import Invitation, Job, Proposal, ScreeningAnswer

ERR = {
    "self_dealing": {"code": "self_dealing", "message_ar": "لا يمكنك التقديم على وظيفتك الخاصة"},
    "no_bids": {"code": "insufficient_bids", "message_ar": "رصيد العروض غير كافٍ — اشترِ باقة"},
    "dup": {"code": "duplicate_proposal", "message_ar": "قدّمت عرضًا على هذه الوظيفة من قبل"},
    "not_open": {"code": "job_not_open", "message_ar": "هذه الوظيفة لا تستقبل عروضًا حاليًا"},
    "locked": {"code": "job_locked", "message_ar": "العنوان والوصف مقفلان بعد استلام أول عرض"},
    "screening": {"code": "screening_required", "message_ar": "أجب عن جميع الأسئلة الإلزامية"},
    "budget_range": {"code": "budget_out_of_range", "message_ar": "قيمة العرض يجب أن تكون ضمن ميزانية الوظيفة"},
    "not_owner": {"code": "not_owner", "message_ar": "لا تملك صلاحية على هذه الوظيفة"},
    "profile_not_published": {
        "code": "profile_not_published",
        "message_ar": "لا يمكنك التقديم على الوظائف حتى يعتمد المشرف ملفك الشخصي",
    },
    "no_prior": {"code": "no_prior_engagement", "message_ar": "لا يوجد تعاقد سابق مكتمل مع هذا المستقل"},
    "invite_target": {"code": "worker_required", "message_ar": "حدّد المستقل المدعو"},
    "category_required": {"code": "category_required", "message_ar": "الفئة مطلوبة"},
}


def _unique_slug(title: str) -> str:
    base = slugify(title, allow_unicode=True)[:150] or "job"
    slug, i = base, 1
    while Job.objects.filter(slug=slug).exists():
        i += 1
        slug = f"{base}-{i}"
    return slug


# ------------------------------------------------------------------ job lifecycle
def submit_for_publication(job: Job) -> Job:
    """Draft → published (flag ON) or pending_review (flag OFF) — FR-JOB-2.

    Contact-info guard is a *soft gate*, not a hard block (ppt slide-01): rather than rejecting the
    post outright (which would block legitimate descriptions on a false positive), a post that looks
    like it shares external contact details is always diverted to admin review — even when
    auto-publish is ON. A human approves the legit ones; real violations get caught. So the worst a
    false positive costs the user is a short review wait, never a failed submission.
    """
    job.slug = job.slug or _unique_slug(job.title)
    flagged = contains_contact_info(job.title) or contains_contact_info(job.description)
    if get_setting("jobs.auto_publish", False) and not flagged:
        _publish(job)
    else:
        job.status = Job.Status.PENDING_REVIEW
        job.save()
    return job


def _publish(job: Job) -> None:
    job.status = Job.Status.PUBLISHED
    job.published_at = timezone.now()
    # FR-JOB-17: auto-archive is admin-gated — ON expires after jobs.expiry_days, OFF keeps it published.
    if get_setting("jobs.enable_auto_archive", True):
        job.expires_at = job.published_at + timedelta(days=int(get_setting("jobs.expiry_days", 30)))
    else:
        job.expires_at = None
    job.save()
    if job.is_private:
        return  # a private/invited job is never broadcast to category subscribers (FR-JOB-12)
    from apps.subscriptions.tasks import fanout_job_published  # noqa: PLC0415 (avoid cycle)

    fanout_job_published.delay(job.pk)  # FR-JOB-16 / FR-SUB-2


def approve_job(job: Job) -> Job:
    if job.status != Job.Status.PENDING_REVIEW:
        raise ValidationError(ERR["not_open"])
    _publish(job)
    return job


def reject_job(job: Job, reason: str) -> Job:
    job.status = Job.Status.REJECTED
    job.reject_reason = reason
    job.save(update_fields=["status", "reject_reason"])
    return job


@transaction.atomic
def close_job(job: Job, *, expired: bool = False) -> Job:
    """Employer close or auto-expiry (FR-JOB-7/17): withdraw open proposals,
    refund their bids (FR-BID-6), expire open invitations (BR-6a)."""
    job.status = Job.Status.CLOSED
    job.save(update_fields=["status"])
    open_props = job.proposals.select_for_update().filter(status__in=Proposal.OPEN_STATUSES)
    for proposal in open_props:
        proposal.status = Proposal.Status.WITHDRAWN
        proposal.save(update_fields=["status"])
        refund_bid(proposal, BidLedger.Reason.REFUND_JOB_CLOSED)
    job.invitations.filter(status=Invitation.Status.SENT).update(status=Invitation.Status.EXPIRED)
    return job


# ------------------------------------------------------------------ proposals
def _assert_profile_published(worker) -> None:
    """Rule D-1: a worker may only bid once an admin has published their profile.

    Profiles default to PUBLISHED (so existing/auto-created profiles keep working); a worker who
    submits for review drops to PENDING_REVIEW until an admin approves. We block only the explicit
    not-published states — a worker with no profile row yet is left to the other onboarding gates.
    """
    from apps.profiles.models import WorkerProfile  # noqa: PLC0415 (avoid import cycle)

    profile = WorkerProfile.objects.filter(user=worker).only("publish_state").first()
    if profile is not None and profile.publish_state != WorkerProfile.PublishState.PUBLISHED:
        raise PermissionDenied(ERR["profile_not_published"])


@transaction.atomic
def submit_proposal(*, worker, job: Job, budget, delivery_days, description, answers: dict) -> Proposal:
    """FR-JOB-5: bid check, BR-21 self-dealing, required screening answers."""
    if job.employer_id == worker.id:
        raise PermissionDenied(ERR["self_dealing"])  # BR-21
    from apps.accounts.services import assert_active  # noqa: PLC0415 (avoid import cycle)
    assert_active(worker)  # BR-23: a frozen worker cannot bid
    _assert_profile_published(worker)  # D-1: only an admin-approved profile may bid
    if job.status != Job.Status.PUBLISHED:
        raise ValidationError(ERR["not_open"])
    if job.proposals.filter(status=Proposal.Status.ACCEPTED).exists():
        raise ValidationError(ERR["not_open"])  # awarded, awaiting funding (BR-6a)
    if job.proposals.filter(worker=worker).exists():
        raise ValidationError(ERR["dup"])

    # The bid value must sit inside the employer's stated budget band (the client shows it as a hint).
    # Raised as a field-keyed error (no code/message_ar siblings) so the envelope lands it under
    # `fields.budget` and applyApiError marks the budget input — see core/api/exception_handler.py.
    if budget is not None and (budget < job.budget_min or budget > job.budget_max):
        raise ValidationError({"budget": ERR["budget_range"]["message_ar"]})

    required = job.screening_questions.filter(is_required=True)
    missing = [q.pk for q in required if not (answers.get(str(q.pk)) or "").strip()]
    if missing:
        raise ValidationError({**ERR["screening"], "missing_questions": missing})

    auto = get_setting("proposals.auto_publish", True)
    proposal = Proposal.objects.create(
        job=job,
        worker=worker,
        budget=budget,
        delivery_days=delivery_days,
        description=description,
        status=Proposal.Status.SUBMITTED if auto else Proposal.Status.PENDING_APPROVAL,
    )
    for question in job.screening_questions.all():
        text = (answers.get(str(question.pk)) or "").strip()
        if text:
            ScreeningAnswer.objects.create(proposal=proposal, question=question, answer=text)

    invited = job.invitations.filter(
        worker=worker, status__in=[Invitation.Status.SENT, Invitation.Status.ACCEPTED]
    ).first()
    if invited:
        invited.status = Invitation.Status.ACCEPTED
        invited.save(update_fields=["status"])  # invited proposals consume no bid (BR-7)
    elif get_setting("bids.enabled", True):
        # bids off (master switch) → applying is free; the platform earns via commission instead
        try:
            consume_bid(worker, proposal)
        except InsufficientBids:
            raise ValidationError(ERR["no_bids"]) from None

    Job.objects.filter(pk=job.pk).update(proposals_count=job.proposals.count())

    from apps.notifications.models import Notification  # noqa: PLC0415 (avoid import cycle)
    from apps.notifications.services import notify  # noqa: PLC0415
    notify(
        job.employer,
        kind=Notification.Kind.PROPOSAL,
        title="عرض جديد على وظيفتك",
        body=f"تلقّيت عرضًا جديدًا على «{job.title}».",
        deep_link=f"/me/jobs/{job.id}/proposals",  # owner's proposals inbox, not the public listing
    )
    return proposal


def cancel_proposal(proposal: Proposal) -> Proposal:
    """BR-5: cancellable only while submitted/viewed — no bid refund (BR-7)."""
    if proposal.status not in (Proposal.Status.SUBMITTED, Proposal.Status.VIEWED):
        raise ValidationError({"code": "not_cancellable", "message_ar": "لا يمكن إلغاء العرض في حالته الحالية"})
    proposal.status = Proposal.Status.CANCELLED
    proposal.save(update_fields=["status"])
    return proposal


def moderation_reject_proposal(proposal: Proposal, reason: str) -> Proposal:
    """Admin filter before the employer sees it — refunds the bid (FR-BID-6)."""
    proposal.status = Proposal.Status.REJECTED
    proposal.reject_reason = reason
    proposal.save(update_fields=["status", "reject_reason"])
    refund_bid(proposal, BidLedger.Reason.REFUND_MODERATION)
    return proposal


def mark_viewed(proposal: Proposal) -> None:
    if proposal.status == Proposal.Status.SUBMITTED:
        proposal.status = Proposal.Status.VIEWED
        proposal.viewed_at = timezone.now()
        proposal.save(update_fields=["status", "viewed_at"])


@transaction.atomic
def accept_proposal(proposal: Proposal):
    """BR-6/6a: at most one contract per job — row lock on the job. Acceptance creates the
    contract in Pending Funding and tries to fund it at once; only when the contract reaches
    Active does the job move to In Progress and siblings auto-reject (handled in contracts)."""
    from apps.contracts.services import create_contract_from_proposal  # noqa: PLC0415 (avoid cycle)

    job = Job.objects.select_for_update().get(pk=proposal.job_id)
    if job.status != Job.Status.PUBLISHED:
        raise ValidationError(ERR["not_open"])
    if proposal.status not in Proposal.OPEN_STATUSES:
        raise ValidationError(ERR["not_open"])  # suspended/withdrawn/cancelled can't be awarded (BR-23)
    from apps.accounts.services import assert_active  # noqa: PLC0415 (avoid import cycle)
    assert_active(proposal.worker)  # BR-23: never bind a contract to a frozen worker
    if job.proposals.filter(status=Proposal.Status.ACCEPTED).exists():
        raise ValidationError({"code": "already_awarded", "message_ar": "رُسّيت الوظيفة بالفعل"})
    proposal.status = Proposal.Status.ACCEPTED
    proposal.save(update_fields=["status"])
    # Job stays Published until the contract is funded (BR-6a) so an abandoned funding
    # never strands it. The funding-timeout sweeper reverts the proposal if it lapses.
    contract = create_contract_from_proposal(proposal)
    return contract


def reject_proposal(proposal: Proposal, reason: str) -> Proposal:
    proposal.status = Proposal.Status.REJECTED
    proposal.reject_reason = reason
    proposal.save(update_fields=["status", "reject_reason"])
    return proposal


# ------------------------------------------------------------------ invitations
def invite_worker(*, employer, job: Job, worker, message: str = "") -> Invitation:
    if worker.id == employer.id:
        raise PermissionDenied(ERR["self_dealing"])  # BR-21
    from apps.accounts.services import assert_active  # noqa: PLC0415 (avoid import cycle)
    assert_active(worker)  # BR-23: cannot invite a frozen worker
    if job.status != Job.Status.PUBLISHED:
        raise ValidationError(ERR["not_open"])
    return Invitation.objects.create(job=job, employer=employer, worker=worker, private_message=message)


# ------------------------------------------------------------------ repost & rehire (FR-JOB-11/12)
def _request_to_propose(job: Job, employer, worker, message: str = "") -> Invitation:
    """Record the invited 'request to propose' for a private/rehire job (invited → no bid, BR-7).
    Unlike invite_worker this does not require the job to be Published yet (it may sit in review)."""
    invitation, _ = Invitation.objects.get_or_create(
        job=job, worker=worker, defaults={"employer": employer, "private_message": message}
    )
    return invitation


def _spawn_job(employer, *, base_job, source_job, private, invited, overrides) -> Job:
    """Build + publish a new job, copying from base_job where an override isn't supplied."""
    overrides = overrides or {}
    category = overrides.get("category") or (base_job.category if base_job else None)
    if category is None:
        raise ValidationError(ERR["category_required"])
    job = Job.objects.create(
        employer=employer,
        title=overrides.get("title") or (base_job.title if base_job else ""),
        description=overrides.get("description") or (base_job.description if base_job else ""),
        category=category,
        subcategory=overrides.get("subcategory") or (base_job.subcategory if base_job else None),
        budget_min=overrides.get("budget_min", base_job.budget_min if base_job else 0),
        budget_max=overrides.get("budget_max", base_job.budget_max if base_job else 0),
        deadline=overrides.get("deadline", base_job.deadline if base_job else None),
        location_type=(base_job.location_type if base_job else Job.LocationType.REMOTE),
        country=(base_job.country if base_job else ""),
        city=(base_job.city if base_job else ""),
        is_private=private,
        invited_worker=invited,
        source_job=source_job,
    )
    if base_job:
        job.skills.set(base_job.skills.all())
    submit_for_publication(job)
    return job


@transaction.atomic
def repost_job(source: Job, *, employer, visibility: str = "public", worker=None, overrides=None) -> Job:
    """FR-JOB-11: repost a previous job — public, or privately to a specific/the same worker —
    editing fields before reposting. Links the new job to `source` via source_job."""
    if source.employer_id != employer.id:
        raise PermissionDenied(ERR["not_owner"])
    private = visibility in ("private", "specific")
    invited = (worker or source.invited_worker) if private else None
    if private:
        if invited is None:
            raise ValidationError(ERR["invite_target"])
        if invited.id == employer.id:
            raise PermissionDenied(ERR["self_dealing"])  # BR-21
        from apps.accounts.services import assert_active  # noqa: PLC0415
        assert_active(invited)
    job = _spawn_job(employer, base_job=source, source_job=source, private=private,
                     invited=invited, overrides=overrides)
    if invited:
        _request_to_propose(job, employer, invited, (overrides or {}).get("message", ""))
    return job


@transaction.atomic
def rehire_worker(*, employer, worker, overrides=None) -> Job:
    """FR-JOB-12: post a private job pre-filled from a previous COMPLETED engagement with `worker`,
    with a request-to-propose (no bid charged). Refuses if there is no prior completed contract."""
    from apps.contracts.models import Contract  # noqa: PLC0415 (avoid import cycle)

    if worker.id == employer.id:
        raise PermissionDenied(ERR["self_dealing"])  # BR-21
    from apps.accounts.services import assert_active  # noqa: PLC0415
    assert_active(worker)
    prior = (Contract.objects.filter(employer=employer, worker=worker, status=Contract.Status.COMPLETED)
             .order_by("-completed_at").first())
    if prior is None:
        raise ValidationError(ERR["no_prior"])  # can't rehire a non-prior party

    prefilled = {
        "title": prior.title,
        "description": prior.scope or prior.title,
        "budget_min": prior.budget,
        "budget_max": prior.budget,
        **(overrides or {}),
    }
    job = _spawn_job(employer, base_job=prior.job, source_job=prior.job, private=True,
                     invited=worker, overrides=prefilled)
    _request_to_propose(job, employer, worker, prefilled.get("message", ""))
    return job
