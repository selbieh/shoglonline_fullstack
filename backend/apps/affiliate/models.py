"""Affiliate / referral program (SRS FR-AFF, BR-18).

Attribution sets a referral within a cookie window; affiliate commission is a
range-based rate applied to the platform commission of a completed contract where
the referred user is a party. Accrual happens at warranty release (not acceptance)
and can be clawed back if the contract is later refunded. Self-referral is void (BR-21).
"""
from django.conf import settings
from django.db import models
from django.db.models import Q


class AffiliateProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate")
    slug = models.SlugField(max_length=40, unique=True)
    is_frozen = models.BooleanField(default=False)  # admin can stop accrual (FR-ADM/BR-23)
    total_earned = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"affiliate:{self.slug}"


class Referral(models.Model):
    """A referred user has exactly one referrer (set once, at signup attribution)."""

    referrer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referrals_made")
    referred_user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referral")
    earning_window_end = models.DateField()  # qualifying transactions must fall within this window
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=~Q(referrer=models.F("referred_user")), name="no_self_referral"),
        ]


class CommissionRule(models.Model):
    """Range → rate, applied to the platform commission (FR-AFF-4)."""

    class AppliesTo(models.TextChoices):
        ANY = "any"
        WORKER = "worker"    # referred user is the worker on the contract
        EMPLOYER = "employer"

    applies_to = models.CharField(max_length=8, choices=AppliesTo.choices, default=AppliesTo.ANY)
    min_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    max_amount = models.DecimalField(max_digits=12, decimal_places=2, default=999999)
    rate_pct = models.DecimalField(max_digits=5, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["applies_to", "min_amount"]

    def __str__(self) -> str:
        return f"{self.applies_to} {self.min_amount}-{self.max_amount} → {self.rate_pct}%"


class AffiliateCommission(models.Model):
    class Status(models.TextChoices):
        ACCRUED = "accrued"
        CLAWED_BACK = "clawed_back"

    referrer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate_commissions")
    referred_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    contract = models.ForeignKey("contracts.Contract", on_delete=models.PROTECT, related_name="affiliate_commissions")
    base_amount = models.DecimalField(max_digits=12, decimal_places=2)  # platform commission
    rate_pct = models.DecimalField(max_digits=5, decimal_places=2)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACCRUED)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # one accrual per (contract, referred party)
            models.UniqueConstraint(fields=["contract", "referred_user"], name="uniq_affiliate_per_contract_party"),
        ]


class AffiliateClick(models.Model):
    """A visit to a referral link (FR-AFF-1). Feeds the click→registration→transaction funnel and
    the affiliate stats. `referred_user` is set when the click later converts to a signup."""

    referrer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="affiliate_clicks")
    slug = models.CharField(max_length=40)  # snapshot of the slug visited
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    referred_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["referrer", "-created_at"])]
