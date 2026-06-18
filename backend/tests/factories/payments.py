import factory

from apps.payments.models import Wallet

from .accounts import UserFactory


class WalletFactory(factory.django.DjangoModelFactory):
    """Creates a wallet only. Deposit funds via the ledger (`fund_wallet` fixture /
    `payments.services.post`) — never set balances directly, it breaks the ledger invariant."""
    class Meta:
        model = Wallet
        django_get_or_create = ("user",)

    user = factory.SubFactory(UserFactory)
