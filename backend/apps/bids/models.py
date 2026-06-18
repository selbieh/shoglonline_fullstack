"""Bid ledger — append-only, balance = sum(delta) (FR-BID, mirrors the money-ledger principle)."""
from django.conf import settings
from django.db import models


class BidPlan(models.Model):
    name = models.CharField(max_length=80)
    bids_count = models.PositiveSmallIntegerField()
    cost = models.DecimalField(max_digits=8, decimal_places=2)
    description = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["bids_count"]

    def __str__(self) -> str:
        return f"{self.name} ({self.bids_count})"


class BidLedger(models.Model):
    class Reason(models.TextChoices):
        SIGNUP_GRANT = "signup_grant"          # bids.signup_grant flag
        MONTHLY_GRANT = "monthly_grant"        # bids.monthly_grant flag
        PURCHASE = "purchase"                  # Phase 3: paid from wallet
        CONSUME = "consume"                    # proposal submitted (FR-BID-1)
        REFUND_MODERATION = "refund_moderation"  # admin rejected before employer saw it (FR-BID-6)
        REFUND_JOB_CLOSED = "refund_job_closed"  # job closed/expired before decision (FR-BID-6)
        ADMIN_ADJUST = "admin_adjust"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bid_ledger")
    delta = models.SmallIntegerField()
    reason = models.CharField(max_length=20, choices=Reason.choices)
    proposal = models.ForeignKey(
        "jobs.Proposal", null=True, blank=True, on_delete=models.SET_NULL, related_name="bid_entries"
    )
    plan = models.ForeignKey(BidPlan, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "-created_at"])]
