"""Wallet + double-entry ledger (SRS FR-PAY-1/9, BR-9/24).

Invariant: every balance equals the sum of succeeded ledger rows for that bucket.
Balances are denormalized for reads and recomputed inside the same transaction
as every posting — never mutated directly anywhere else.
"""
from django.conf import settings
from django.db import models


class Wallet(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="wallet"
    )
    is_platform = models.BooleanField(default=False)  # the single platform commission wallet
    # Dual-role buckets (FR-PAY-1): money held FROM the user vs owed TO the user
    available = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    escrow_held = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    earnings_pending = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["is_platform"],
                condition=models.Q(is_platform=True),
                name="single_platform_wallet",
            ),
        ]

    def __str__(self) -> str:
        return "platform" if self.is_platform else f"wallet:{self.user_id}"


class Transaction(models.Model):
    """Append-only ledger row. Signed amount; bucket-scoped (FR-PAY-9)."""

    class Type(models.TextChoices):
        DEPOSIT = "deposit"                  # PayPal charge (FR-PAY-2)
        WITHDRAWAL_HOLD = "withdrawal_hold"  # request debits available immediately (FR-PAY-3)
        WITHDRAWAL_PAID = "withdrawal_paid"
        WITHDRAWAL_REVERSED = "withdrawal_reversed"  # rejection restores the hold
        BID_PURCHASE = "bid_purchase"        # FR-BID-3
        CONTRACT_HOLD = "contract_hold"      # PHASE4: available → escrow_held (BR-9)
        CONTRACT_RELEASE = "contract_release"
        EARNING = "earning"
        COMMISSION = "commission"
        AFFILIATE = "affiliate"              # referrer payout at warranty release (BR-18)
        REFUND = "refund"
        ADJUSTMENT = "adjustment"

    class Bucket(models.TextChoices):
        AVAILABLE = "available"
        ESCROW_HELD = "escrow_held"
        EARNINGS_PENDING = "earnings_pending"

    class Status(models.TextChoices):
        PENDING = "pending"      # deposit awaiting gateway confirmation (FR-PAY-2)
        SUCCEEDED = "succeeded"
        FAILED = "failed"

    wallet = models.ForeignKey(Wallet, on_delete=models.PROTECT, related_name="transactions")
    type = models.CharField(max_length=20, choices=Type.choices)
    bucket = models.CharField(max_length=18, choices=Bucket.choices, default=Bucket.AVAILABLE)
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # signed
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUCCEEDED)
    gateway = models.CharField(max_length=20, blank=True)  # "paypal"
    gateway_ref = models.CharField(max_length=128, blank=True)  # PayPal order/payout id
    idempotency_key = models.CharField(max_length=128, unique=True, null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)
    related_withdrawal = models.ForeignKey(
        "WithdrawalRequest", null=True, blank=True, on_delete=models.SET_NULL, related_name="transactions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["wallet", "-created_at"]),
            models.Index(fields=["gateway", "gateway_ref"]),
        ]

    def __str__(self) -> str:
        return f"{self.type} {self.amount} ({self.status})"


class WithdrawalRequest(models.Model):
    """PayPal-only payouts (product decision). Hold-on-request semantics (FR-PAY-3)."""

    class Status(models.TextChoices):
        REQUESTED = "requested"
        PROCESSING = "processing"
        PAID = "paid"
        REJECTED = "rejected"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="withdrawals")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paypal_email = models.EmailField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REQUESTED)
    reject_reason = models.CharField(max_length=200, blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    gateway_ref = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    legacy_id = models.BigIntegerField(
        null=True, blank=True, unique=True,
        help_text="WordPress wt_payouts_history.id (data migration).",
    )

    class Meta:
        ordering = ["-created_at"]


class CommissionTier(models.Model):
    """Admin-managed PLATFORM-commission ranges (FR-PAY-6 / §4.15). The rate for a contract is
    chosen by its budget at creation and FROZEN onto the contract (commission_pct/amount), keeping
    the BR-24 invariant `budget = worker_earning + commission`. Distinct from affiliate.CommissionRule
    (which sets the affiliate PAYOUT rate on top of the platform commission)."""

    class AppliesTo(models.TextChoices):
        ANY = "any", "Any"
        WORKER = "worker", "Worker"
        EMPLOYER = "employer", "Employer"

    applies_to = models.CharField(max_length=8, choices=AppliesTo.choices, default=AppliesTo.ANY)
    min_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    max_amount = models.DecimalField(max_digits=12, decimal_places=2, default=9999999)
    rate_pct = models.DecimalField(max_digits=5, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["applies_to", "min_amount"]

    def __str__(self) -> str:
        return f"{self.applies_to} {self.min_amount}-{self.max_amount} → {self.rate_pct}%"


class PaymentMethod(models.Model):
    """Saved payout/charge method (FR-PAY-4). PANs are NEVER stored — only a gateway token and
    masked display fields (PCI-DSS SAQ-A; card data stays at the gateway, SEC-8)."""

    class Type(models.TextChoices):
        PAYPAL = "paypal", "PayPal"
        CARD = "card", "Card"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payment_methods")
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.PAYPAL)
    provider = models.CharField(max_length=20, default="paypal")
    brand = models.CharField(max_length=20, blank=True)       # e.g. "visa" (display only)
    last4 = models.CharField(max_length=4, blank=True)        # masked tail (display only)
    label = models.CharField(max_length=80, blank=True)       # e.g. PayPal email / nickname
    gateway_token = models.CharField(max_length=255)          # vault token — opaque, not a PAN
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "-created_at"]

    def __str__(self) -> str:
        tail = f" ••••{self.last4}" if self.last4 else ""
        return f"{self.provider}:{self.type}{tail}"


class PayoutMethod(models.Model):
    """A saved destination for receiving earnings (استلام الأرباح, ppt slide-38). Multi-rail:
    PayPal & bank transfer are international; e-wallet, bank card & Instapay are Egypt-only.
    Rail-specific fields (IBAN, wallet number, instapay link, …) live in `details` (JSON)."""

    class Kind(models.TextChoices):
        PAYPAL = "paypal", "PayPal"
        BANK_TRANSFER = "bank_transfer", "Bank transfer"
        E_WALLET = "e_wallet", "E-wallet"
        BANK_CARD = "bank_card", "Bank card"
        INSTAPAY = "instapay", "Instapay"

    # rails restricted to a single country; others are international.
    EGYPT_ONLY = {"e_wallet", "bank_card", "instapay"}

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="payout_methods"
    )
    kind = models.CharField(max_length=14, choices=Kind.choices)
    label = models.CharField(max_length=80, blank=True)        # nickname (اسم مستعار)
    country = models.CharField(max_length=2, blank=True)       # ISO-2; "EG" for Egypt-only rails
    details = models.JSONField(default=dict)                   # rail-specific (no PANs)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "-created_at"]

    def __str__(self) -> str:
        return f"payout:{self.kind}:{self.user_id}"
