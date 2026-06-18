import factory

from apps.chat.models import Conversation, Message

from .accounts import UserFactory


class ConversationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Conversation

    user_a = factory.SubFactory(UserFactory)
    user_b = factory.SubFactory(UserFactory)


class MessageFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Message

    conversation = factory.SubFactory(ConversationFactory)
    sender = factory.SubFactory(UserFactory)
    body = "مرحبا"
