import factory

from apps.contracts.models import Contract

from .accounts import UserFactory


class ContractFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Contract

    employer = factory.SubFactory(UserFactory)
    worker = factory.SubFactory(UserFactory)
    title = factory.Sequence(lambda n: f"عقد {n}")
    budget = 100
    status = Contract.Status.PENDING_FUNDING
