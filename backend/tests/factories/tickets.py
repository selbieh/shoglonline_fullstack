import factory

from apps.tickets.models import Ticket, TicketType

from .accounts import UserFactory


class TicketTypeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = TicketType
        django_get_or_create = ("slug",)

    name_ar = factory.Sequence(lambda n: f"نوع التذكرة {n}")
    slug = factory.Sequence(lambda n: f"ticket-type-{n}")
    is_active = True


class TicketFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Ticket

    user = factory.SubFactory(UserFactory)
    type = factory.SubFactory(TicketTypeFactory)
    title = factory.Sequence(lambda n: f"تذكرة {n}")
    message = "تفاصيل المشكلة"
