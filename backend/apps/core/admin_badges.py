"""Live "needs-action" counts for the admin (FR-ADM-1 / ADM-2).

Two consumers share ONE source of truth (`actionable_counts`):
  * the Unfold sidebar — each queue nav item shows a red badge with its pending count, so an
    operator sees the whole work queue from any page without opening anything;
  * the dashboard — `action_queue()` turns the same counts into a "يحتاج إجراءً" strip of
    clickable pills (only non-zero queues appear).

The counts are cached briefly: the sidebar renders on every admin page, so without a cache each
page would fire a dozen COUNT()s. Every callback is defensive — a raising badge would 500 every
admin page — and returns None when zero so the sidebar badge is hidden rather than showing "0".
"""
from django.core.cache import cache
from django.urls import NoReverseMatch, reverse
from django.utils import timezone

_CACHE_KEY = "sh:admin_badge_counts"
_CACHE_TTL = 30  # seconds — a queue badge may lag reality by up to half a minute; that's fine.


def _compute_counts() -> dict:
    from apps.chat.models import ChatReport
    from apps.contracts.models import Contract
    from apps.core.models import Report
    from apps.gigs.models import BuyingRequest, Service
    from apps.jobs.models import Job
    from apps.notifications.models import ScheduledNotification
    from apps.payments.models import WithdrawalRequest
    from apps.profiles.models import IDVerification, WorkerProfile
    from apps.tickets.models import Ticket

    today = timezone.now().date()
    withdraw_open = (WithdrawalRequest.Status.REQUESTED, WithdrawalRequest.Status.PROCESSING)
    return {
        "disputes": Contract.objects.filter(status=Contract.Status.DISPUTED).count(),
        "overdue": Contract.objects.filter(
            status=Contract.Status.ACTIVE, deadline__lt=today).count(),
        "withdrawals": WithdrawalRequest.objects.filter(status__in=withdraw_open).count(),
        "id_verifications": IDVerification.objects.filter(
            status=IDVerification.Status.PENDING).count(),
        "publish_reviews": WorkerProfile.objects.filter(
            publish_state=WorkerProfile.PublishState.PENDING_REVIEW).count(),
        "jobs": Job.objects.filter(status=Job.Status.PENDING_REVIEW).count(),
        "services": Service.objects.filter(status=Service.Status.PENDING_REVIEW).count(),
        "buying_requests": BuyingRequest.objects.filter(
            status=BuyingRequest.Status.PENDING).count(),
        "chat_reports": ChatReport.objects.filter(status=ChatReport.Status.OPEN).count(),
        "content_reports": Report.objects.filter(status=Report.Status.OPEN).count(),
        "tickets": Ticket.objects.filter(status__in=Ticket.OPEN_STATUSES).count(),
        "broadcasts": ScheduledNotification.objects.filter(
            status=ScheduledNotification.Status.PENDING).count(),
    }


def actionable_counts() -> dict:
    """The pending count for every operator queue, cached for `_CACHE_TTL` seconds."""
    data = cache.get(_CACHE_KEY)
    if data is None:
        data = _compute_counts()
        cache.set(_CACHE_KEY, data, _CACHE_TTL)
    return data


def _get(key):
    """Badge value for one queue: the count, or None when zero/on any error (so it's hidden)."""
    try:
        return actionable_counts().get(key) or None
    except Exception:  # noqa: BLE001 — a badge must never 500 the admin
        return None


# Unfold resolves each `badge` import path to one of these callables (signature: (request) -> value).
def disputes(request): return _get("disputes")
def overdue(request): return _get("overdue")
def withdrawals(request): return _get("withdrawals")
def id_verifications(request): return _get("id_verifications")
def publish_reviews(request): return _get("publish_reviews")
def jobs(request): return _get("jobs")
def services(request): return _get("services")
def buying_requests(request): return _get("buying_requests")
def chat_reports(request): return _get("chat_reports")
def content_reports(request): return _get("content_reports")
def tickets(request): return _get("tickets")
def broadcasts(request): return _get("broadcasts")


# Dashboard "needs-action" strip — ordered most-urgent first.
# (count key, Arabic label, emoji, tone, admin changelist name, changelist query string)
ACTION_QUEUE = [
    ("disputes", "نزاعات بانتظار الحسم", "⚖️", "danger", "contracts_contract", "status__exact=disputed"),
    ("overdue", "عقود متأخرة", "⏰", "danger", "contracts_contract", "overdue=yes"),
    ("withdrawals", "طلبات سحب للمعالجة", "💸", "danger", "payments_withdrawalrequest", "status__exact=requested"),
    ("id_verifications", "توثيق هوية للمراجعة", "🪪", "danger", "profiles_idverification", "status__exact=pending"),
    ("chat_reports", "بلاغات محادثات مفتوحة", "🚩", "danger", "chat_chatreport", "status__exact=open"),
    ("content_reports", "بلاغات محتوى مفتوحة", "🚩", "danger", "core_report", "status__exact=open"),
    ("publish_reviews", "ملفات بانتظار النشر", "📋", "warn", "profiles_workerprofile", "publish_state__exact=pending_review"),
    ("jobs", "وظائف بانتظار المراجعة", "📝", "warn", "jobs_job", "status__exact=pending_review"),
    ("services", "خدمات بانتظار المراجعة", "🏷", "warn", "gigs_service", "status__exact=pending_review"),
    ("buying_requests", "طلبات شراء معلّقة", "📥", "warn", "gigs_buyingrequest", "status__exact=pending"),
    ("tickets", "تذاكر دعم مفتوحة", "🛟", "warn", "tickets_ticket", ""),
    ("broadcasts", "بثوث مجدولة معلّقة", "📣", "info", "notifications_schedulednotification", "status__exact=pending"),
]


def action_queue() -> list:
    """The non-zero operator queues as dashboard pills, each deep-linked to its filtered changelist."""
    counts = actionable_counts()
    out = []
    for key, label, emoji, tone, changelist, qs in ACTION_QUEUE:
        n = counts.get(key) or 0
        if not n:
            continue
        try:
            url = reverse(f"admin:{changelist}_changelist")
            link = f"{url}?{qs}" if qs else url
        except NoReverseMatch:  # pragma: no cover - defensive
            link = None
        out.append({"label": label, "emoji": emoji, "tone": tone, "count": n, "link": link})
    return out
