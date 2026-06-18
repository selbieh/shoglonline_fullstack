from datetime import date, timedelta

import factory

from apps.affiliate.models import CommissionRule, Referral

from .accounts import UserFactory


class CommissionRuleFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = CommissionRule

    rate_pct = 5
    applies_to = CommissionRule.AppliesTo.ANY
    is_active = True


class ReferralFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Referral

    referrer = factory.SubFactory(UserFactory)
    referred_user = factory.SubFactory(UserFactory)
    earning_window_end = factory.LazyFunction(lambda: date.today() + timedelta(days=90))
