"""Contract sweepers (SRS §23 async jobs):
- funding-timeout (BR-6a): un-funded contracts auto-cancel, the job returns to Published.
- warranty-end (BR-10): release worker funds the moment the warranty lapses.
- overdue-notifier (FR-TASK-9): flag contracts past deadline with no open submission.

NFR-REL-3: each row is processed in isolation — a single poisoned contract is logged and skipped so
it can't sink the whole batch, and the underlying services are idempotent (terminal-state flags + row
locks) so a redelivered/retried sweep re-runs safely.
"""
import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("apps.contracts.tasks")


@shared_task
def cancel_unfunded_contracts() -> int:
    """BR-6a: Pending Funding past the timeout → Cancelled; job back to Published,
    winning proposal reverts to Viewed, both parties notified."""
    from django.db import transaction

    from apps.jobs.models import Job, Proposal

    from .models import Contract
    from .services import _event

    now = timezone.now()
    stale_ids = list(
        Contract.objects.filter(
            status=Contract.Status.PENDING_FUNDING, funding_deadline__lt=now
        ).values_list("pk", flat=True)
    )
    count = 0
    for pk in stale_ids:
        try:
            with transaction.atomic():
                # Re-lock and re-check under the row lock so we can't race a concurrent fund_now()
                # (which locks the same row) and cancel a contract that just got funded — that would
                # strand the escrow hold against a Cancelled contract (BR-6a / FR-PAY-2).
                contract = Contract.objects.select_for_update().get(pk=pk)
                if not (contract.status == Contract.Status.PENDING_FUNDING
                        and contract.funding_deadline and contract.funding_deadline < now):
                    continue
                contract.status = Contract.Status.CANCELLED
                contract.cancel_reason = "انتهت مهلة التمويل دون شحن المحفظة"
                contract.save(update_fields=["status", "cancel_reason"])
                Proposal.objects.filter(pk=contract.proposal_id).update(status=Proposal.Status.VIEWED)
                # job is already Published (we never moved it to In Progress before funding) — no-op
                _event(contract, "cancelled", detail="إلغاء تلقائي — انتهت مهلة التمويل (BR-6a)")
                count += 1
        except Exception:  # noqa: BLE001 — isolate one bad row; it retries next tick
            logger.exception("cancel_unfunded_contracts failed for contract %s", pk)
    return count


@shared_task
def release_due_warranties() -> int:
    """BR-10: completed contracts whose warranty has ended → release earnings to available."""
    from .models import Contract
    from .services import release_warranty

    now = timezone.now()
    due = Contract.objects.filter(
        status=Contract.Status.COMPLETED, funds_released=False, warranty_ends_at__lte=now
    )
    count = 0
    for contract in due:
        try:
            release_warranty(contract)
            count += 1
        except Exception:  # noqa: BLE001 — a poisoned contract can't block the rest of the batch
            logger.exception("release_due_warranties failed for contract %s", contract.pk)
    return count


@shared_task
def notify_overdue_contracts() -> int:
    """FR-TASK-9: deadline passed without an open submission → notify both parties once."""
    from .models import Contract, Submission
    from .services import _event

    today = timezone.now().date()
    candidates = Contract.objects.filter(
        status=Contract.Status.ACTIVE, deadline__lt=today, overdue_notified_at__isnull=True
    )
    count = 0
    for contract in candidates:
        try:
            if contract.submissions.filter(status=Submission.Status.OPEN).exists():
                continue
            contract.overdue_notified_at = timezone.now()
            contract.save(update_fields=["overdue_notified_at"])
            _event(contract, "overdue", detail="تجاوز العقد موعده النهائي دون تسليم مفتوح")
            count += 1
        except Exception:  # noqa: BLE001
            logger.exception("notify_overdue_contracts failed for contract %s", contract.pk)
    return count
