"""Ledger services — the ONLY place balances change (FR-PAY-9, BR-24)."""
import re
from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.money import fmt_usd
from .models import PaymentMethod, PayoutMethod, Transaction, Wallet, WithdrawalRequest

ERR = {
    "funds": {"code": "insufficient_funds", "message_ar": "الرصيد المتاح غير كافٍ — اشحن محفظتك"},
    "min": {"code": "below_minimum", "message_ar": "المبلغ أقل من الحد الأدنى"},
    "pan": {"code": "pan_forbidden", "message_ar": "لا تُرسل رقم البطاقة — استخدم رمز البوابة فقط"},
    "token": {"code": "token_required", "message_ar": "رمز البوابة مطلوب"},
    "payout_kind": {"code": "invalid_payout_kind", "message_ar": "وسيلة استلام غير معروفة"},
    "payout_details": {"code": "payout_details_required", "message_ar": "أكمل بيانات وسيلة الاستلام"},
}

# PCI SAQ-A: a raw PAN must never reach our servers. We refuse any field that smells like card data
# and reject a token that looks like a bare card number.
_FORBIDDEN_KEYS = {"card_number", "cardnumber", "number", "pan", "cvv", "cvc", "card", "card_no"}
_PAN_RE = re.compile(r"^\d{12,19}$")

MIN_DEPOSIT = Decimal("1.00")
MIN_WITHDRAWAL = Decimal("10.00")


def get_wallet(user) -> Wallet:
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return wallet


def get_platform_wallet() -> Wallet:
    wallet, _ = Wallet.objects.get_or_create(is_platform=True, defaults={"user": None})
    return wallet


def commission_rate_for(budget, applies_to: str = "any") -> Decimal:
    """Platform commission % for a contract budget (FR-PAY-6 / §4.15). An active CommissionTier
    whose range contains the budget wins (an `applies_to` match beats the generic `any`); otherwise
    we fall back to the flat `payments.commission_pct` setting. The result is frozen on the contract
    by the caller, so later tier edits never alter existing contracts (BR-24)."""
    from .models import CommissionTier

    amount = Decimal(str(budget))
    tiers = CommissionTier.objects.filter(is_active=True, min_amount__lte=amount, max_amount__gte=amount)
    tier = (tiers.filter(applies_to=applies_to).first()
            or tiers.filter(applies_to=CommissionTier.AppliesTo.ANY).first())
    if tier is not None:
        return Decimal(tier.rate_pct)
    from apps.core.services import get_setting
    return Decimal(str(get_setting("payments.commission_pct", 10)))


# ------------------------------------------------------------------ payment methods (FR-PAY-4)
@transaction.atomic
def add_payment_method(user, data: dict) -> PaymentMethod:
    """Save a tokenized method. PANs are NEVER accepted or stored (PCI SAQ-A): we reject any
    card-data field and a token that looks like a raw PAN; only the gateway token + masked
    display fields are persisted."""
    for key in data:
        if key.lower() in _FORBIDDEN_KEYS:
            raise ValidationError(ERR["pan"])
    token = str(data.get("gateway_token") or "").strip()
    if not token:
        raise ValidationError(ERR["token"])
    if _PAN_RE.match(token.replace(" ", "")):
        raise ValidationError(ERR["pan"])  # a bare card number is not a token

    method = PaymentMethod.objects.create(
        user=user,
        type=data.get("type") or PaymentMethod.Type.PAYPAL,
        provider=(data.get("provider") or "paypal")[:20],
        brand=(data.get("brand") or "")[:20],
        last4=str(data.get("last4") or "")[-4:],
        label=(data.get("label") or "")[:80],
        gateway_token=token,
    )
    if data.get("is_default") or not PaymentMethod.objects.filter(user=user).exclude(pk=method.pk).exists():
        set_default_method(user, method)  # first method is default
    return method


@transaction.atomic
def set_default_method(user, method: PaymentMethod) -> None:
    PaymentMethod.objects.filter(user=user).exclude(pk=method.pk).update(is_default=False)
    if not method.is_default:
        method.is_default = True
        method.save(update_fields=["is_default"])


# ------------------------------------------------------------------ ledger adjustment (ADM-7)
@transaction.atomic
def post_adjustment(wallet: Wallet, *, bucket: str, amount, reason: str, actor=None) -> Transaction:
    """The ONLY sanctioned way to manually correct a balance: an explicit ADJUSTMENT ledger row
    (balances stay derived; the BR-9/24 invariant holds). Reason is mandatory; writes an AuditLog.
    Admin never edits balances directly — wallet/transaction admins are read-only."""
    if not (reason or "").strip():
        raise ValidationError({"code": "reason_required", "message_ar": "سبب التسوية إلزامي"})
    row = post(wallet, type=Transaction.Type.ADJUSTMENT, bucket=bucket,
               amount=Decimal(str(amount)), note=f"تسوية إدارية: {reason}"[:200])
    from apps.core.models import AuditLog
    AuditLog.objects.create(
        actor=actor, action="admin.balance_adjustment", model="Wallet", object_id=str(wallet.pk),
        after={"bucket": bucket, "amount": str(amount), "reason": reason},
    )
    return row


def _recompute(wallet: Wallet) -> None:
    """Balances are always derivable: bucket = Σ succeeded rows (ledger invariant)."""
    rows = (
        Transaction.objects.filter(wallet=wallet, status=Transaction.Status.SUCCEEDED)
        .values("bucket")
        .annotate(total=models.Sum("amount"))
    )
    totals = {r["bucket"]: r["total"] or Decimal("0") for r in rows}
    wallet.available = totals.get(Transaction.Bucket.AVAILABLE, Decimal("0"))
    wallet.escrow_held = totals.get(Transaction.Bucket.ESCROW_HELD, Decimal("0"))
    wallet.earnings_pending = totals.get(Transaction.Bucket.EARNINGS_PENDING, Decimal("0"))
    wallet.save(update_fields=["available", "escrow_held", "earnings_pending"])


@transaction.atomic
def post(wallet: Wallet, **kwargs) -> Transaction:
    """Atomic posting with a row lock; idempotency_key dedupes gateway retries."""
    wallet = Wallet.objects.select_for_update().get(pk=wallet.pk)
    key = kwargs.get("idempotency_key")
    if key:
        existing = Transaction.objects.filter(idempotency_key=key).first()
        if existing:
            return existing  # safe webhook replay (FR-PAY-2 / AC-5)
    row = Transaction.objects.create(wallet=wallet, **kwargs)
    if row.status == Transaction.Status.SUCCEEDED:
        _recompute(wallet)
    return row


@transaction.atomic
def settle_pending(tx: Transaction, *, succeeded: bool, gateway_ref: str = "") -> Transaction:
    """Deposit confirmation: pending → succeeded/failed (FR-PAY-2)."""
    tx = Transaction.objects.select_for_update().get(pk=tx.pk)
    if tx.status != Transaction.Status.PENDING:
        return tx  # idempotent
    tx.status = Transaction.Status.SUCCEEDED if succeeded else Transaction.Status.FAILED
    if gateway_ref:
        tx.gateway_ref = gateway_ref
    tx.save(update_fields=["status", "gateway_ref"])
    if succeeded:
        _recompute(Wallet.objects.select_for_update().get(pk=tx.wallet_id))
        if tx.type == Transaction.Type.DEPOSIT:
            from apps.notifications.services import notify  # noqa: PLC0415 (avoid import cycle)
            notify(
                tx.wallet.user,
                kind="payment",
                title="تم تأكيد الإيداع",
                body=f"أُضيف مبلغ {fmt_usd(tx.amount)} إلى محفظتك ورصيدك جاهز للاستخدام الآن.",
                deep_link="/wallet",
            )
    return tx


# ------------------------------------------------------------------ withdrawals
@transaction.atomic
def request_withdrawal(user, amount: Decimal, paypal_email: str) -> WithdrawalRequest:
    """FR-PAY-3: debit available IMMEDIATELY (hold) — no double-spend window."""
    if amount < MIN_WITHDRAWAL:
        raise ValidationError(ERR["min"])
    wallet = Wallet.objects.select_for_update().get(pk=get_wallet(user).pk)
    if wallet.available < amount:
        raise ValidationError(ERR["funds"])
    withdrawal = WithdrawalRequest.objects.create(user=user, amount=amount, paypal_email=paypal_email)
    post(
        wallet,
        type=Transaction.Type.WITHDRAWAL_HOLD,
        bucket=Transaction.Bucket.AVAILABLE,
        amount=-amount,
        gateway="paypal",
        related_withdrawal=withdrawal,
        note=f"حجز سحب #{withdrawal.pk}",
    )
    return withdrawal


def process_withdrawal(withdrawal: WithdrawalRequest, *, paid: bool, actor=None, reason: str = "",
                       gateway_ref: str = "") -> WithdrawalRequest:
    """Admin decision on a payout (FR-PAY-3/8).

    When `paid`, the money is sent for real via PayPal Payouts BEFORE the ledger row is settled —
    done outside the DB transaction so we never hold a row lock across the network call, and keyed
    on a deterministic sender_batch_id so a retry can't double-pay. If the payout raises, nothing is
    recorded and the funds stay held, so the admin can safely retry.
    """
    from . import paypal  # noqa: PLC0415 (avoid import cycle)
    from apps.core.services import get_setting  # noqa: PLC0415

    if paid and not gateway_ref:
        status = WithdrawalRequest.objects.filter(pk=withdrawal.pk).values_list("status", flat=True).first()
        if status in (WithdrawalRequest.Status.REQUESTED, WithdrawalRequest.Status.PROCESSING):
            result = paypal.payout(
                email=withdrawal.paypal_email, amount=str(withdrawal.amount),
                currency=str(get_setting("platform.currency", "USD")),
                sender_batch_id=f"wd-{withdrawal.pk}",
                note=f"Shoghl Online withdrawal #{withdrawal.pk}",
            )
            gateway_ref = result.get("payout_batch_id", "")
    return _settle_withdrawal(withdrawal, paid=paid, actor=actor, reason=reason, gateway_ref=gateway_ref)


@transaction.atomic
def _settle_withdrawal(withdrawal: WithdrawalRequest, *, paid: bool, actor=None, reason: str = "",
                       gateway_ref: str = "") -> WithdrawalRequest:
    withdrawal = WithdrawalRequest.objects.select_for_update().get(pk=withdrawal.pk)
    if withdrawal.status not in (WithdrawalRequest.Status.REQUESTED, WithdrawalRequest.Status.PROCESSING):
        return withdrawal  # idempotent
    wallet = get_wallet(withdrawal.user)
    if paid:
        withdrawal.status = WithdrawalRequest.Status.PAID
        withdrawal.gateway_ref = gateway_ref
        # the hold already removed the funds — record the payout as a zero-sum marker row
        post(wallet, type=Transaction.Type.WITHDRAWAL_PAID, bucket=Transaction.Bucket.AVAILABLE,
             amount=Decimal("0"), gateway="paypal", gateway_ref=gateway_ref,
             related_withdrawal=withdrawal, note=f"سُدّد السحب #{withdrawal.pk} عبر PayPal")
    else:
        withdrawal.status = WithdrawalRequest.Status.REJECTED
        withdrawal.reject_reason = reason
        post(wallet, type=Transaction.Type.WITHDRAWAL_REVERSED, bucket=Transaction.Bucket.AVAILABLE,
             amount=withdrawal.amount, related_withdrawal=withdrawal,
             note=f"رُفض السحب #{withdrawal.pk} — أُعيد المبلغ")
    withdrawal.processed_by = actor
    withdrawal.processed_at = timezone.now()
    withdrawal.save()
    from apps.notifications.services import notify  # noqa: PLC0415 (avoid import cycle)
    if paid:
        notify(withdrawal.user, kind="payment", title="تم تنفيذ طلب السحب",
               body=f"حُوِّل مبلغ {fmt_usd(withdrawal.amount)} إلى حسابك على PayPal.", deep_link="/wallet")
    else:
        notify(withdrawal.user, kind="payment", title="تم رفض طلب السحب",
               body=f"أُعيد مبلغ {fmt_usd(withdrawal.amount)} إلى محفظتك. السبب: {reason or '—'}",
               deep_link="/wallet")
    return withdrawal


# ------------------------------------------------------------------ bid purchase (FR-BID-3)
@transaction.atomic
def purchase_bid_plan(user, plan) -> Transaction:
    from apps.bids.models import BidLedger
    from apps.core.services import get_setting

    if not get_setting("bids.enabled", True):
        raise ValidationError({"code": "bids_disabled", "message_ar": "نظام العروض معطّل حاليًا"})

    wallet = Wallet.objects.select_for_update().get(pk=get_wallet(user).pk)
    if wallet.available < plan.cost:
        raise ValidationError(ERR["funds"])
    row = post(
        wallet,
        type=Transaction.Type.BID_PURCHASE,
        bucket=Transaction.Bucket.AVAILABLE,
        amount=-plan.cost,
        note=f"شراء باقة «{plan.name}» ({plan.bids_count} عرضًا)",
    )
    BidLedger.objects.create(user=user, delta=plan.bids_count, reason=BidLedger.Reason.PURCHASE, plan=plan)
    return row


# ------------------------------------------------------------- payout methods (ppt slide-38)
def add_payout_method(user, data: dict) -> PayoutMethod:
    """Save a payout destination. `details` holds the rail-specific fields (IBAN, wallet number,
    instapay link, …); Egypt-only rails are pinned to country EG. The first method is default."""
    kind = str(data.get("kind") or "").strip()
    if kind not in PayoutMethod.Kind.values:
        raise ValidationError(ERR["payout_kind"])
    details = data.get("details")
    if not isinstance(details, dict) or not details:
        raise ValidationError(ERR["payout_details"])
    country = str(data.get("country") or "").upper()[:2]
    if kind in PayoutMethod.EGYPT_ONLY:
        country = "EG"
    method = PayoutMethod.objects.create(
        user=user,
        kind=kind,
        label=(data.get("label") or "")[:80],
        country=country,
        details=details,
    )
    if data.get("is_default") or not PayoutMethod.objects.filter(user=user).exclude(pk=method.pk).exists():
        set_default_payout_method(user, method)
    return method


@transaction.atomic
def set_default_payout_method(user, method: PayoutMethod) -> None:
    PayoutMethod.objects.filter(user=user).exclude(pk=method.pk).update(is_default=False)
    if not method.is_default:
        method.is_default = True
        method.save(update_fields=["is_default"])
