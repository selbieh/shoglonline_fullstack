import factory

from apps.gigs.models import BuyingRequest, Service

from .accounts import UserFactory
from .catalog import CategoryFactory


class ServiceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Service

    worker = factory.SubFactory(UserFactory)
    title = factory.Sequence(lambda n: f"خدمة {n}")
    description = "وصف الخدمة"
    category = factory.SubFactory(CategoryFactory)
    slug = factory.Sequence(lambda n: f"service-{n}")
    base_price = 50
    delivery_days = 7
    status = Service.Status.LIVE


class BuyingRequestFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = BuyingRequest

    service = factory.SubFactory(ServiceFactory)
    employer = factory.SubFactory(UserFactory)
    quantity = 1
