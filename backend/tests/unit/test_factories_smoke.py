"""Proves every factory constructs a valid, persisted instance (harness smoke test)."""
import pytest

from tests import factories

pytestmark = [pytest.mark.unit, pytest.mark.django_db]

FACTORY_NAMES = [
    "UserFactory", "StaffUserFactory", "SuperUserFactory",
    "CategoryFactory", "SkillFactory",
    "JobFactory",
    "BidPlanFactory", "BidLedgerFactory",
    "WalletFactory",
    "ContractFactory",
    "ServiceFactory", "BuyingRequestFactory",
    "ReviewFactory",
    "TicketTypeFactory", "TicketFactory",
    "InvoiceRequestFactory",
    "CommissionRuleFactory", "ReferralFactory",
    "ConversationFactory", "MessageFactory",
    "WorkerProfileFactory", "EmployerProfileFactory",
]


@pytest.mark.parametrize("name", FACTORY_NAMES)
def test_factory_creates_persisted_instance(name):
    obj = getattr(factories, name)()
    assert obj.pk is not None, f"{name} did not persist an instance"
