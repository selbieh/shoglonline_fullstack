"""Ledger-invariant monitoring (SEC / AC-13). A platform holding user funds must continuously
prove its books are intact: every wallet bucket balance must equal the sum of its succeeded ledger
rows (the invariant `_recompute` maintains), and no bucket may go negative. Any drift is corruption
and pages on detection."""
from decimal import Decimal

from django.db.models import Sum

from .models import Transaction, Wallet

BUCKETS = (
    Transaction.Bucket.AVAILABLE,
    Transaction.Bucket.ESCROW_HELD,
    Transaction.Bucket.EARNINGS_PENDING,
)


def check_ledger_invariants() -> list[dict]:
    """Return a list of violations (empty == healthy). Two invariants:
    1. balance_mismatch — stored bucket balance != Σ succeeded ledger rows for that bucket (BR-9/24).
    2. negative_balance — a bucket went below zero (should be impossible given the guards)."""
    ledger: dict[tuple[int, str], Decimal] = {}
    rows = (
        Transaction.objects.filter(status=Transaction.Status.SUCCEEDED)
        .values("wallet_id", "bucket")
        .annotate(total=Sum("amount"))
    )
    for row in rows:
        ledger[(row["wallet_id"], row["bucket"])] = row["total"] or Decimal("0")

    violations: list[dict] = []
    stored_for = {
        Transaction.Bucket.AVAILABLE: lambda w: w.available,
        Transaction.Bucket.ESCROW_HELD: lambda w: w.escrow_held,
        Transaction.Bucket.EARNINGS_PENDING: lambda w: w.earnings_pending,
    }
    for wallet in Wallet.objects.all():
        for bucket in BUCKETS:
            stored = stored_for[bucket](wallet)
            computed = ledger.get((wallet.id, bucket), Decimal("0"))
            if stored != computed:
                violations.append({
                    "kind": "balance_mismatch", "wallet_id": wallet.id, "bucket": bucket,
                    "stored": str(stored), "computed": str(computed),
                })
            if stored < 0:
                violations.append({
                    "kind": "negative_balance", "wallet_id": wallet.id, "bucket": bucket,
                    "stored": str(stored),
                })
    return violations
