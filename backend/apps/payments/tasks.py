"""Deposit reconciliation — lost-webhook safety net (FR-PAY-2, 15-min SLA)."""
import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger("apps.payments.monitoring")


@shared_task
def monitor_ledger_invariants() -> int:
    """AC-13: periodically prove the books are intact; page on any drift. Returns violation count."""
    from .monitoring import check_ledger_invariants

    violations = check_ledger_invariants()
    if violations:
        # logged at ERROR so Sentry (when configured) captures it as an alert-worthy event
        logger.error("LEDGER INVARIANT VIOLATION (%s): %s", len(violations), violations)
    return len(violations)


@shared_task
def reconcile_pending_deposits() -> int:
    """FR-PAY-2 lost-webhook safety net. NFR-REL-3: each pending row is polled in isolation — a
    transient gateway error on one tx is logged and skipped (it stays PENDING and is retried on the
    next 5-min tick, an at-least-once dead-letter), never failing the whole batch. settle_pending is
    idempotent, so re-polling an already-settled row is a no-op."""
    from . import paypal, services
    from .models import Transaction

    cutoff = timezone.now() - timedelta(minutes=5)
    pending = Transaction.objects.filter(
        type=Transaction.Type.DEPOSIT, status=Transaction.Status.PENDING,
        gateway="paypal", created_at__lt=cutoff,
    )
    settled = 0
    for tx in pending:
        try:
            status = paypal.get_order_status(tx.gateway_ref)
            if status == "APPROVED":
                # buyer approved on PayPal but the return redirect never reached us (closed tab,
                # dropped network) — capture here so the deposit can't strand as PENDING. If the
                # capture itself fails it stays PENDING and is retried on the next tick.
                if paypal.capture_order(tx.gateway_ref):
                    services.settle_pending(tx, succeeded=True)
                    settled += 1
            elif status == "COMPLETED":
                services.settle_pending(tx, succeeded=True)
                settled += 1
            elif status in ("VOIDED", "EXPIRED"):
                services.settle_pending(tx, succeeded=False)
                settled += 1
        except Exception:  # noqa: BLE001 — isolate a poisoned/unreachable row; it retries next tick
            logger.exception("reconcile_pending_deposits failed for tx %s", tx.pk)
    return settled
