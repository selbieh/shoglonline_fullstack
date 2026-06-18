"""factory_boy factories — one module per app (see docs/TESTING_STRATEGY.md §14.2).

Money-touching state must be created through the ledger (`apps.payments.services.post`), never
by writing balances directly; use the `fund_wallet` conftest fixture for deposits.
"""
from .accounts import StaffUserFactory, SuperUserFactory, UserFactory
from .affiliate import CommissionRuleFactory, ReferralFactory
from .bids import BidLedgerFactory, BidPlanFactory
from .catalog import CategoryFactory, SkillFactory
from .chat import ConversationFactory, MessageFactory
from .contracts import ContractFactory
from .gigs import BuyingRequestFactory, ServiceFactory
from .invoices import InvoiceRequestFactory
from .jobs import JobFactory
from .payments import WalletFactory
from .profiles import EmployerProfileFactory, WorkerProfileFactory
from .reviews import ReviewFactory
from .tickets import TicketFactory, TicketTypeFactory

__all__ = [
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
