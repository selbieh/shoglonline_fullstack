"""Admin KPI computations (SRS ADM-2). Activity segments are activity-based,
never based on the current view toggle (FR-MODE)."""
import json
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Exists, OuterRef, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone


def compute_kpis() -> dict:
    from apps.accounts.models import User
    from apps.contracts.models import Contract
    from apps.gigs.models import Service
    from apps.jobs.models import Job, Proposal
    from apps.payments.models import Wallet
    from apps.payments.services import get_platform_wallet
    from apps.tickets.models import Ticket

    now = timezone.now()
    today = now.date()
    last_30 = now - timedelta(days=30)

    # activity segments are ACTIVITY-based, never the view toggle (FR-MODE). Dual-active = a user
    # who has BOTH proposed (worker) and posted a job (employer).
    has_worker = Exists(Proposal.objects.filter(worker=OuterRef("pk")))
    has_employer = Exists(Job.objects.filter(employer=OuterRef("pk")))
    dual_active = User.objects.filter(has_worker, has_employer).count()

    # GMV = value of all funded contracts; platform commission = sum frozen commission on completed.
    gmv = (Contract.objects.exclude(status=Contract.Status.PENDING_FUNDING)
           .aggregate(s=Sum("budget"))["s"] or Decimal("0"))
    commission = (Contract.objects.filter(status=Contract.Status.COMPLETED)
                  .aggregate(s=Sum("commission_amount"))["s"] or Decimal("0"))

    # wallet liabilities by bucket (what the platform owes / holds), excluding the platform wallet
    liabilities = Wallet.objects.filter(is_platform=False).aggregate(
        available=Sum("available"), escrow=Sum("escrow_held"), pending=Sum("earnings_pending"),
    )

    return {
        "users_total": User.objects.count(),
        "users_new_30d": User.objects.filter(date_joined__gte=last_30).count(),
        "users_with_worker_activity": Proposal.objects.values("worker").distinct().count(),
        "users_with_employer_activity": Job.objects.values("employer").distinct().count(),
        "users_dual_active": dual_active,
        "active_jobs": Job.objects.filter(status=Job.Status.PUBLISHED).count(),
        "live_services": Service.objects.filter(status=Service.Status.LIVE).count(),
        "proposals_today": Proposal.objects.filter(created_at__date=today).count(),
        "active_contracts": Contract.objects.filter(status__in=Contract.OPEN_STATUSES).count(),
        "gmv": gmv,
        "platform_commission": commission,
        "wallet_available": liabilities["available"] or Decimal("0"),
        "wallet_escrow_held": liabilities["escrow"] or Decimal("0"),
        "wallet_earnings_pending": liabilities["pending"] or Decimal("0"),
        "platform_balance": get_platform_wallet().available,
        "open_tickets": Ticket.objects.filter(status__in=Ticket.OPEN_STATUSES).count(),
        "pending_jobs": Job.objects.filter(status=Job.Status.PENDING_REVIEW).count(),
        "pending_services": Service.objects.filter(status=Service.Status.PENDING_REVIEW).count(),
        "disputed_contracts": Contract.objects.filter(status=Contract.Status.DISPUTED).count(),
        "overdue_contracts": Contract.objects.filter(
            status=Contract.Status.ACTIVE, deadline__lt=today,
        ).count(),
    }


# Cards rendered on the Unfold dashboard index (UNFOLD["DASHBOARD_CALLBACK"]).
_CARDS = [
    ("users_total", "إجمالي المستخدمين"),
    ("active_jobs", "وظائف منشورة"),
    ("live_services", "خدمات منشورة"),
    ("active_contracts", "عقود جارية"),
    ("gmv", "إجمالي قيمة التعاملات (GMV)"),
    ("platform_commission", "عمولة المنصة"),
    ("wallet_escrow_held", "محجوز في الضمان"),
    ("wallet_earnings_pending", "أرباح معلّقة"),
    ("open_tickets", "تذاكر مفتوحة"),
    ("pending_jobs", "وظائف بانتظار المراجعة"),
    ("disputed_contracts", "نزاعات قائمة"),
    ("overdue_contracts", "عقود متأخرة"),
]


# Stat boxes shown at the top of the dashboard (label, key, emoji, brand tone).
_STAT_BOXES = [
    ("Total users", "users_total", "👥", "primary"),
    ("Active jobs", "active_jobs", "💼", "primary"),
    ("Live services", "live_services", "🛍", "primary"),
    ("Active contracts", "active_contracts", "🤝", "primary"),
    ("GMV", "gmv", "💰", "success", "$"),
    ("Platform commission", "platform_commission", "🏦", "success", "$"),
    ("Escrow held", "wallet_escrow_held", "🛡", "warn", "$"),
    ("Earnings pending", "wallet_earnings_pending", "⏳", "warn", "$"),
    ("Open tickets", "open_tickets", "🛟", "danger"),
    ("Pending moderation", "pending_jobs", "📝", "danger"),
    ("Disputes", "disputed_contracts", "⚖️", "danger"),
    ("Overdue contracts", "overdue_contracts", "⏰", "danger"),
]


def _timeseries(qs, date_field: str, days: int = 14):
    """Daily counts for the last `days` days → (labels, data). Robust on SQLite/PG."""
    today = timezone.now().date()
    start = today - timedelta(days=days - 1)
    try:
        rows = (qs.filter(**{f"{date_field}__date__gte": start})
                  .annotate(d=TruncDate(date_field)).values("d").annotate(c=Count("id")))
        by = {r["d"]: r["c"] for r in rows if r["d"]}
    except Exception:  # pragma: no cover - defensive
        by = {}
    labels, data = [], []
    for i in range(days):
        d = start + timedelta(days=i)
        labels.append(d.strftime("%m-%d"))
        data.append(by.get(d, 0))
    return labels, data


def _chart_data(days: int = 14) -> dict:
    from apps.accounts.models import User
    from apps.contracts.models import Contract
    from apps.jobs.models import Job

    days = max(7, min(int(days or 14), 90))  # clamp the date-range selector (ADM-2)
    sign_labels, sign_data = _timeseries(User.objects.all(), "date_joined", days)
    _, jobs_data = _timeseries(Job.objects.all(), "created_at", days)
    _, contracts_data = _timeseries(Contract.objects.all(), "created_at", days)

    status_rows = Contract.objects.values("status").annotate(c=Count("id"))
    status_map = {r["status"]: r["c"] for r in status_rows}
    status_order = [
        ("pending_funding", "Pending funding"), ("active", "Active"), ("delivered", "Delivered"),
        ("completed", "Completed"), ("disputed", "Disputed"), ("cancelled", "Cancelled"),
    ]
    return {
        "trend": {
            "labels": sign_labels,
            "signups": sign_data,
            "jobs": jobs_data,
            "contracts": contracts_data,
        },
        "contract_status": {
            "labels": [lbl for _k, lbl in status_order],
            "data": [status_map.get(k, 0) for k, _lbl in status_order],
        },
    }


def analytics_widgets() -> dict:
    """ADM-9 (Should): light aggregate widgets — top workers/employers, affiliate funnel,
    jobs-by-category, and a coarse signup funnel. Computed on demand (no analytics store)."""
    from apps.accounts.models import User
    from apps.affiliate.models import AffiliateClick, AffiliateCommission, Referral
    from apps.contracts.models import Contract
    from apps.jobs.models import Job, Proposal

    top_workers = list(
        Contract.objects.filter(status=Contract.Status.COMPLETED)
        .values("worker__email").annotate(earned=Sum("worker_earning")).order_by("-earned")[:5]
    )
    top_employers = list(
        Job.objects.values("employer__email").annotate(jobs=Count("id")).order_by("-jobs")[:5]
    )
    has_activity = Exists(Proposal.objects.filter(worker=OuterRef("pk")))
    posted = Exists(Job.objects.filter(employer=OuterRef("pk")))
    first_action = User.objects.filter(has_activity | posted).count()
    return {
        "top_workers": top_workers,
        "top_employers": top_employers,
        "affiliate_funnel": {
            "clicks": AffiliateClick.objects.count(),
            "registrations": Referral.objects.count(),
            "transactions": AffiliateCommission.objects.values("contract").distinct().count(),
        },
        "jobs_by_category": list(
            Job.objects.values("category__name_ar").annotate(c=Count("id")).order_by("-c")[:8]
        ),
        "signup_funnel": {
            "tracked_visits": AffiliateClick.objects.count(),  # only referral visits are tracked
            "signups": User.objects.count(),
            "first_action": first_action,
        },
    }


def dashboard_callback(request, context):
    """Inject KPI stat boxes + chart datasets into the Unfold admin index (ADM-2)."""
    kpis = compute_kpis()
    days = (request.GET.get("days") if request is not None else None) or 14
    context["kpis"] = kpis
    context["kpi_cards"] = [{"label": label, "value": kpis.get(key, 0)} for key, label in _CARDS]
    context["stat_boxes"] = [
        {
            "label": label,
            "value": (f"{box[4]}{kpis.get(key, 0)}" if len(box) > 4 else kpis.get(key, 0)),
            "emoji": emoji,
            "tone": tone,
        }
        for box in _STAT_BOXES
        for (label, key, emoji, tone) in [box[:4]]
    ]
    context["chart_data_json"] = json.dumps(_chart_data(days))
    return context
