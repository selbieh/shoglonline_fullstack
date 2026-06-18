import factory

from apps.bids.models import BidLedger, BidPlan

from .accounts import UserFactory


class BidPlanFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = BidPlan

    name = factory.Sequence(lambda n: f"باقة {n}")
    bids_count = 10
    cost = 5
    is_active = True


class BidLedgerFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = BidLedger

    user = factory.SubFactory(UserFactory)
    delta = 10
    reason = BidLedger.Reason.SIGNUP_GRANT
