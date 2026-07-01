"""Affiliate domain logic — attribution, range-rule selection, accrual at warranty
release (BR-18), and clawback. Self-referral void (BR-21); frozen affiliates earn nothing."""
import re
from datetime import timedelta
from decimal import ROUND_HALF_EVEN, Decimal
from urllib.parse import quote

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import ValidationError

from apps.core.services import get_setting
from apps.payments import services as pay
from apps.payments.models import Transaction

from .models import AffiliateClick, AffiliateCommission, AffiliateProfile, CommissionRule, Referral

CENT = Decimal("0.01")
FRONTEND_URL = settings.FRONTEND_URL  # env-driven (settings.FRONTEND_URL); localhost default in dev

# user-editable slug: 3–40 chars, lowercase alnum + internal dashes, no leading/trailing dash
_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")
_RESERVED_SLUGS = {"api", "me", "admin", "support", "r", "affiliate", "static", "media", "www"}

ERR = {
    "invalid_slug": {"code": "invalid_slug",
                     "message_ar": "الرابط غير صالح (أحرف إنجليزية صغيرة وأرقام وشرطة، 3–40)"},
    "slug_reserved": {"code": "slug_reserved", "message_ar": "هذا الرابط محجوز"},
    "slug_taken": {"code": "slug_taken", "message_ar": "الرابط مستخدم بالفعل"},
}


def get_or_create_profile(user) -> AffiliateProfile:
    profile = AffiliateProfile.objects.filter(user=user).first()
    if profile:
        return profile
    base = slugify(user.email.split("@")[0])[:30] or f"u{user.id}"
    # The exists()-then-create check is not atomic: two users whose email prefixes slugify to the
    # same base (or the same user opening the dashboard twice) can both pass it and collide on the
    # unique slug/user constraint -> 500. Retry inside a savepoint on IntegrityError.
    for i in range(1, 12):
        slug = base if i == 1 else f"{base}-{i}"
        if AffiliateProfile.objects.filter(slug=slug).exists():
            continue
        try:
            with transaction.atomic():
                return AffiliateProfile.objects.create(user=user, slug=slug)
        except IntegrityError:
            existing = AffiliateProfile.objects.filter(user=user).first()
            if existing:
                return existing  # a concurrent request already created this user's profile
            continue  # slug was taken by a concurrent create — try the next suffix
    # Fallback: a user-id suffix is effectively collision-proof.
    existing = AffiliateProfile.objects.filter(user=user).first()
    return existing or AffiliateProfile.objects.create(user=user, slug=f"{base}-{user.id}")


@transaction.atomic
def attribute(referred_user, slug: str) -> Referral | None:
    """Set the referrer for a newly-signed-up user (FR-AFF-3). Idempotent; self-referral void."""
    if Referral.objects.filter(referred_user=referred_user).exists():
        return None  # attribution happens once
    profile = AffiliateProfile.objects.filter(slug=slug).first()
    if not profile or profile.user_id == referred_user.id:
        return None  # unknown slug or self-referral (BR-21) → void
    window_days = int(get_setting("affiliate.cookie_days", 30))
    try:
        referral = Referral.objects.create(
            referrer=profile.user, referred_user=referred_user,
            earning_window_end=timezone.now().date() + timedelta(days=window_days),
        )
    except IntegrityError:
        return None
    # mark the most recent unconverted click from this affiliate as converted (funnel stats)
    click = (AffiliateClick.objects
             .filter(referrer=profile.user, referred_user__isnull=True)
             .order_by("-created_at").first())
    if click is not None:
        click.referred_user = referred_user
        click.save(update_fields=["referred_user"])
    return referral


def record_click(slug: str, *, ip=None, user_agent: str = "") -> AffiliateClick | None:
    """FR-AFF-1: record a referral-link visit. Unknown slug → None (nothing recorded)."""
    profile = AffiliateProfile.objects.filter(slug=(slug or "").strip().lower()).first()
    if profile is None:
        return None
    return AffiliateClick.objects.create(
        referrer=profile.user, slug=profile.slug, ip=ip, user_agent=(user_agent or "")[:300]
    )


def update_slug(user, slug: str) -> AffiliateProfile:
    """FR-AFF-3: user-editable unique slug, validated and de-duplicated."""
    slug = (slug or "").strip().lower()
    if not _SLUG_RE.match(slug):
        raise ValidationError(ERR["invalid_slug"])
    if slug in _RESERVED_SLUGS:
        raise ValidationError(ERR["slug_reserved"])
    profile = get_or_create_profile(user)
    if AffiliateProfile.objects.filter(slug=slug).exclude(pk=profile.pk).exists():
        raise ValidationError(ERR["slug_taken"])
    profile.slug = slug
    profile.save(update_fields=["slug"])
    return profile


def referral_link(slug: str) -> str:
    return f"{FRONTEND_URL}/r/{slug}"


def share_urls(slug: str) -> dict:
    link = quote(referral_link(slug), safe="")
    return {
        "facebook": f"https://www.facebook.com/sharer/sharer.php?u={link}",
        "x": f"https://twitter.com/intent/tweet?url={link}",
        "whatsapp": f"https://wa.me/?text={link}",
    }


def stats(user) -> dict:
    """FR-AFF: clicks / registrations / transactions / earnings for the affiliate dashboard."""
    profile = get_or_create_profile(user)
    transactions = (AffiliateCommission.objects.filter(referrer=user)
                    .values("contract").distinct().count())
    return {
        "slug": profile.slug,
        "referral_link": referral_link(profile.slug),
        "share": share_urls(profile.slug),
        "clicks": AffiliateClick.objects.filter(referrer=user).count(),
        "registrations": Referral.objects.filter(referrer=user).count(),
        "transactions": transactions,
        "total_earned": profile.total_earned,
        "is_frozen": profile.is_frozen,
    }


def _pick_rule(applies_to: str, base: Decimal):
    rules = CommissionRule.objects.filter(is_active=True, min_amount__lte=base, max_amount__gte=base)
    return (rules.filter(applies_to=applies_to).first()
            or rules.filter(applies_to=CommissionRule.AppliesTo.ANY).first())


@transaction.atomic
def accrue_for_contract(contract, *, base_override=None) -> int:
    """BR-18: at warranty release, credit the referrer(s) of contract parties a range-rate
    cut of the platform commission. Idempotent per (contract, referred party).

    `base_override` lets a dispute-split settlement accrue on the commission actually collected
    (which is less than the frozen contract.commission_amount when the budget was partly refunded)."""
    base = Decimal(base_override if base_override is not None else (contract.commission_amount or 0))
    if base <= 0:
        return 0
    accrued = 0
    for role, party_id in (("employer", contract.employer_id), ("worker", contract.worker_id)):
        referral = Referral.objects.filter(referred_user_id=party_id).select_related("referrer").first()
        if not referral:
            continue
        if contract.completed_at and contract.completed_at.date() > referral.earning_window_end:
            continue  # outside the earning window
        profile = AffiliateProfile.objects.filter(user=referral.referrer).first()
        if not profile or profile.is_frozen:
            continue  # frozen affiliate earns nothing (FR-ADM-5)
        rule = _pick_rule(role, base)
        if not rule:
            continue
        amount = (base * rule.rate_pct / Decimal("100")).quantize(CENT, rounding=ROUND_HALF_EVEN)
        if amount <= 0:
            continue
        if AffiliateCommission.objects.filter(contract=contract, referred_user_id=party_id).exists():
            continue  # already accrued for this party on this contract (idempotent)
        commission = AffiliateCommission.objects.create(
            referrer=referral.referrer, referred_user_id=party_id, contract=contract,
            base_amount=base, rate_pct=rule.rate_pct, amount=amount,
        )
        pay.post(pay.get_wallet(referral.referrer), type=Transaction.Type.AFFILIATE,
                 bucket=Transaction.Bucket.AVAILABLE, amount=amount,
                 idempotency_key=f"affiliate:{commission.pk}",
                 note=f"عمولة إحالة على العقد #{contract.pk}")
        # Atomic DB-side increment (not read-modify-write): concurrent accruals/clawbacks for the
        # same referrer must compose, not clobber each other's value.
        AffiliateProfile.objects.filter(pk=profile.pk).update(total_earned=F("total_earned") + amount)
        accrued += 1
    return accrued


@transaction.atomic
def clawback(commission: AffiliateCommission) -> AffiliateCommission:
    """Reverse an accrual if the contract is later refunded by dispute adjustment (BR-18)."""
    if commission.status == AffiliateCommission.Status.CLAWED_BACK:
        return commission
    pay.post(pay.get_wallet(commission.referrer), type=Transaction.Type.AFFILIATE,
             bucket=Transaction.Bucket.AVAILABLE, amount=-commission.amount,
             idempotency_key=f"affiliate:{commission.pk}:clawback",
             note=f"استرجاع عمولة إحالة على العقد #{commission.contract_id}")
    commission.status = AffiliateCommission.Status.CLAWED_BACK
    commission.save(update_fields=["status"])
    profile = AffiliateProfile.objects.filter(user=commission.referrer).first()
    if profile:
        AffiliateProfile.objects.filter(pk=profile.pk).update(total_earned=F("total_earned") - commission.amount)
    return commission


def set_frozen(user, frozen: bool) -> AffiliateProfile:
    profile = get_or_create_profile(user)
    profile.is_frozen = frozen
    profile.save(update_fields=["is_frozen"])
    return profile


def earnings_summary(user) -> dict:
    from django.db.models import Sum
    profile = get_or_create_profile(user)
    accrued = (AffiliateCommission.objects
               .filter(referrer=user, status=AffiliateCommission.Status.ACCRUED)
               .aggregate(s=Sum("amount"))["s"] or Decimal("0"))
    return {
        "slug": profile.slug,
        "is_frozen": profile.is_frozen,
        "total_earned": profile.total_earned,
        "accrued": accrued,
        "referrals": Referral.objects.filter(referrer=user).count(),
    }
