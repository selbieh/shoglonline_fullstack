"""Unfold admin theme & navigation (FR-ADM-1, ADM-1).

Brand palette mirrors the frontend design tokens (frontend/tailwind.config.ts):
primary #6C70DC / dark #5155BE / deep #3E418F. Sidebar is grouped by domain
(Users, Marketplace, Contracts, Money, Engagement, Content, System) per ADM-1.
"""
from django.templatetags.static import static  # noqa: F401  (available for SITE_ICON if needed)
from django.urls import reverse_lazy


def _changelist(model: str):
    """admin:<app>_<model>_changelist as a lazy URL (safe at settings import)."""
    return reverse_lazy(f"admin:{model}_changelist")


# Indigo scale built around the brand primary (#6C70DC). Values are "R G B".
PRIMARY = {
    "50": "238 240 251",
    "100": "224 227 247",
    "200": "199 203 241",
    "300": "166 171 233",
    "400": "136 142 226",
    "500": "108 112 220",   # brand primary  #6C70DC
    "600": "81 85 190",     # brand dark     #5155BE
    "700": "62 65 143",     # brand deep     #3E418F
    "800": "49 52 103",
    "900": "39 42 82",
    "950": "24 26 51",
}

UNFOLD = {
    "SITE_TITLE": "ShoghlOnline Admin",
    "SITE_HEADER": "ShoghlOnline — Admin",
    "SITE_SUBHEADER": "Arabic jobs & services marketplace",
    "SHOW_HISTORY": True,
    "SHOW_VIEW_ON_SITE": False,
    "DASHBOARD_CALLBACK": "apps.core.analytics.dashboard_callback",  # ADM-2 KPI cards
    # Extra admin CSS (mobile fix for the bulk-action toolbar, FR-ADM-1)
    "STYLES": [
        lambda request: static("css/admin_overrides.css"),
    ],
    "COLORS": {
        "primary": PRIMARY,
        # Neutral surface tuned slightly cool to match the FE bg (#F6F7FD / ink #23263F)
        "font": {
            "subtle-light": "93 98 117",     # sub #5D6275
            "default-light": "35 38 63",     # ink #23263F
        },
    },
    "BORDER_RADIUS": "10px",
    "SIDEBAR": {
        "show_search": True,
        "show_all_applications": False,
        "navigation": [
            {
                "title": "Overview",
                "separator": False,
                "items": [
                    {"title": "Dashboard", "icon": "dashboard", "link": reverse_lazy("admin:index")},
                ],
            },
            {
                "title": "Users & Profiles",
                "collapsible": True,
                "items": [
                    {"title": "Users", "icon": "person", "link": _changelist("accounts_user")},
                    {"title": "Worker profiles", "icon": "badge", "link": _changelist("profiles_workerprofile")},
                    {"title": "ID verifications", "icon": "verified_user",
                     "link": _changelist("profiles_idverification")},
                    {"title": "Employer profiles", "icon": "business", "link": _changelist("profiles_employerprofile")},
                ],
            },
            {
                "title": "Marketplace",
                "collapsible": True,
                "items": [
                    {"title": "Jobs", "icon": "work", "link": _changelist("jobs_job")},
                    {"title": "Proposals", "icon": "assignment", "link": _changelist("jobs_proposal")},
                    {"title": "Invitations", "icon": "mail", "link": _changelist("jobs_invitation")},
                    {"title": "Services", "icon": "store", "link": _changelist("gigs_service")},
                    {"title": "Buying requests", "icon": "shopping_cart", "link": _changelist("gigs_buyingrequest")},
                    {"title": "Categories", "icon": "category", "link": _changelist("catalog_category")},
                    {"title": "Skills", "icon": "tag", "link": _changelist("catalog_skill")},
                    {"title": "Bid plans", "icon": "confirmation_number", "link": _changelist("bids_bidplan")},
                    {"title": "Bid ledger", "icon": "receipt", "link": _changelist("bids_bidledger")},
                ],
            },
            {
                "title": "Contracts & Delivery",
                "collapsible": True,
                "items": [
                    {"title": "Contracts", "icon": "handshake", "link": _changelist("contracts_contract")},
                    {"title": "Submissions", "icon": "upload_file", "link": _changelist("contracts_submission")},
                    {"title": "Update requests", "icon": "edit_note", "link": _changelist("contracts_updaterequest")},
                ],
            },
            {
                "title": "Money",
                "collapsible": True,
                "items": [
                    {"title": "Wallets", "icon": "account_balance_wallet", "link": _changelist("payments_wallet")},
                    {"title": "Transactions", "icon": "receipt_long", "link": _changelist("payments_transaction")},
                    {"title": "Withdrawals", "icon": "payments", "link": _changelist("payments_withdrawalrequest")},
                    {"title": "Commission tiers", "icon": "percent", "link": _changelist("payments_commissiontier")},
                    {"title": "Payment methods", "icon": "credit_card", "link": _changelist("payments_paymentmethod")},
                    {"title": "Payout methods", "icon": "account_balance", "link": _changelist("payments_payoutmethod")},
                    {"title": "Invoices", "icon": "description", "link": _changelist("invoices_invoicerequest")},
                    {"title": "Affiliate profiles", "icon": "diversity_3", "link": _changelist("affiliate_affiliateprofile")},
                    {"title": "Affiliate rules", "icon": "percent", "link": _changelist("affiliate_commissionrule")},
                    {"title": "Affiliate earnings", "icon": "redeem", "link": _changelist("affiliate_affiliatecommission")},
                    {"title": "Affiliate clicks", "icon": "ads_click", "link": _changelist("affiliate_affiliateclick")},
                ],
            },
            {
                "title": "Engagement",
                "collapsible": True,
                "items": [
                    {"title": "Conversations", "icon": "forum", "link": _changelist("chat_conversation")},
                    {"title": "Messages", "icon": "chat", "link": _changelist("chat_message")},
                    {"title": "Chat reports", "icon": "flag", "link": _changelist("chat_chatreport")},
                    {"title": "Content reports", "icon": "report", "link": _changelist("core_report")},
                    {"title": "Notifications", "icon": "notifications", "link": _changelist("notifications_notification")},
                    {"title": "Broadcasts", "icon": "campaign", "link": _changelist("notifications_schedulednotification")},
                    {"title": "Notification prefs", "icon": "tune", "link": _changelist("notifications_notificationpreference")},
                    {"title": "Reviews", "icon": "star", "link": _changelist("reviews_review")},
                    {"title": "Subscriptions", "icon": "subscriptions",
                     "link": _changelist("subscriptions_categorysubscription")},
                    {"title": "Tickets", "icon": "support_agent", "link": _changelist("tickets_ticket")},
                    {"title": "Ticket types", "icon": "label", "link": _changelist("tickets_tickettype")},
                ],
            },
            {
                "title": "Content",
                "collapsible": True,
                "items": [
                    {"title": "Landing sections", "icon": "web", "link": _changelist("cms_landingsection")},
                    {"title": "Pages", "icon": "article", "link": _changelist("cms_contentpage")},
                    {"title": "FAQ", "icon": "quiz", "link": _changelist("cms_faqitem")},
                    {"title": "Site settings", "icon": "settings", "link": _changelist("cms_sitesettings")},
                ],
            },
            {
                "title": "System",
                "collapsible": True,
                "items": [
                    {"title": "Global settings", "icon": "settings", "link": _changelist("core_globalsetting")},
                    {"title": "Setting changes", "icon": "manage_history", "link": _changelist("core_settingchangelog")},
                    {"title": "Audit log", "icon": "history", "link": _changelist("core_auditlog")},
                    {"title": "Attachments", "icon": "attach_file", "link": _changelist("attachments_attachment")},
                ],
            },
        ],
    },
}
