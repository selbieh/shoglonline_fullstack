from django.db import transaction
from django.db.models import Sum

from .models import BidLedger


def bid_balance(user) -> int:
    return BidLedger.objects.filter(user=user).aggregate(total=Sum("delta"))["total"] or 0


def grant_signup_bids(user) -> None:
    """Free bids at registration (FR-BID-5, bids.signup_grant)."""
    from apps.core.services import get_setting

    if not get_setting("bids.enabled", True):
        return  # bid economy off → no grants (commission-only mode)
    count = int(get_setting("bids.signup_grant", 10))
    if count > 0:
        BidLedger.objects.create(user=user, delta=count, reason=BidLedger.Reason.SIGNUP_GRANT)


class InsufficientBids(Exception):
    pass


@transaction.atomic
def consume_bid(user, proposal) -> None:
    """One bid per proposal (FR-BID-1) — atomic, balance can never go negative."""
    if bid_balance(user) < 1:
        raise InsufficientBids()
    BidLedger.objects.create(
        user=user, delta=-1, reason=BidLedger.Reason.CONSUME, proposal=proposal
    )
    proposal.bid_consumed = True
    proposal.save(update_fields=["bid_consumed"])


def refund_bid(proposal, reason: str) -> None:
    """FR-BID-6: refund on moderation-reject or job close/expiry before decision."""
    if not proposal.bid_consumed or proposal.bid_refunded:
        return
    BidLedger.objects.create(
        user=proposal.worker, delta=1, reason=reason, proposal=proposal
    )
    proposal.bid_refunded = True
    proposal.save(update_fields=["bid_refunded"])
