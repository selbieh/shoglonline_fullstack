from datetime import date, timedelta

import factory

from apps.invoices.models import InvoiceRequest

from .accounts import UserFactory


class InvoiceRequestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = InvoiceRequest

    worker = factory.SubFactory(UserFactory)
    employer = factory.SubFactory(UserFactory)
    period_start = factory.LazyFunction(lambda: date.today() - timedelta(days=30))
    period_end = factory.LazyFunction(date.today)
