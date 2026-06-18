import factory

from apps.reviews.models import Review

from .accounts import UserFactory
from .contracts import ContractFactory


class ReviewFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Review

    contract = factory.SubFactory(ContractFactory)
    author = factory.SubFactory(UserFactory)
    subject = factory.SubFactory(UserFactory)
    rating = 5
    comment = "عمل ممتاز"
