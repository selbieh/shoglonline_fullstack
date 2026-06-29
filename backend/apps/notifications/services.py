"""The single fan-out point for every notification (FR-NOT-1/2, FR-TASK-7).

notify() always writes the in-app row, then dispatches email (honoring the
emails.enabled kill-switch) and a push (FCM stub). Money is never touched here —
signals/services call notify() for side-effect fan-out only (SRS §23).
"""
import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import strip_tags

from apps.core.services import get_setting

from . import push
from .models import Notification, NotificationPreference

logger = logging.getLogger(__name__)

FRONTEND_URL = settings.FRONTEND_URL  # env-driven (settings.FRONTEND_URL); localhost default in dev
# Absolute, externally-reachable logo so it renders in any mail client (served from the Next app's
# public/). White silhouette because the header is brand-blue — email clients can't apply the site's
# `brightness-0 invert` CSS filter, so the dark logo.png would be invisible there.
EMAIL_LOGO_URL = getattr(settings, "EMAIL_LOGO_URL", f"{FRONTEND_URL}/logo-email-white.png")
EMAIL_PREFS_URL = f"{FRONTEND_URL}/settings"  # where the user manages notification preferences

# The admin-allowed, user-suppressible categories (FR-PROF-9). Only these kinds consult a
# preference; every other kind is transactional and is ALWAYS delivered.
_KIND_TO_PREF = {
    Notification.Kind.CHAT_MESSAGE: "chat_unread",
    Notification.Kind.PROPOSAL: "proposal_updates",
    Notification.Kind.ADMIN: "marketing",
}


def get_or_create_preference(user) -> NotificationPreference:
    pref, _ = NotificationPreference.objects.get_or_create(user=user)
    return pref


def preference_allows(user, kind: str) -> bool:
    """True unless the user has opted out of this kind's category (FR-PROF-9)."""
    field = _KIND_TO_PREF.get(kind)
    if field is None:
        return True  # transactional category — never suppressed
    return category_allows(user, field)


def category_allows(user, field: str) -> bool:
    """True unless the user opted out of a preference field directly (e.g. 'job_alerts',
    which is email-only and has no Notification.Kind). Missing preference row = all enabled."""
    pref = NotificationPreference.objects.filter(user=user).first()
    return getattr(pref, field) if pref is not None else True


def notify(user, *, kind: str, title: str, body: str = "", deep_link: str = "",
           email: bool = True, send_now: bool = True, force: bool = False) -> Notification | None:
    """Create an in-app notification and (optionally) email + push it.

    Returns None (creating nothing) when the user has opted out of this category (FR-PROF-9).
    Pass force=True for critical account/moderation notices (ID-verification result, abuse warning)
    that must always be delivered regardless of preferences."""
    if not force and not preference_allows(user, kind):
        return None
    note = Notification.objects.create(
        user=user, kind=kind, title=title, body=body, deep_link=deep_link
    )
    if send_now:
        _dispatch(note, email=email)
    return note


def _dispatch(note: Notification, *, email: bool = True) -> None:
    if note.user.email and not note.pushed:
        if push.send_push(user_id=note.user_id, title=note.title, body=note.body,
                          deep_link=note.deep_link, collapse_key=note.kind):
            note.pushed = True
    if email and note.user.email and not note.emailed and get_setting("emails.enabled", True):
        _send_branded_email(note)
        note.emailed = True
    if note.pushed or note.emailed:
        note.save(update_fields=["pushed", "emailed"])


def _send_branded_email(note: Notification) -> None:
    """Deliver a notification as a branded email, with the CTA pointing at the item (deep_link)."""
    send_branded_email(
        to=[note.user.email],
        subject=note.title,
        title=note.title,
        body=note.body,
        deep_link=note.deep_link,
    )


def send_branded_email(*, to, subject: str, title: str = "", body: str = "", deep_link: str = "",
                       cta_label: str = "عرض التفاصيل", code: str = "", fail_silently: bool = True) -> None:
    """Render the shared branded, RTL HTML email (matching the web app's colors/logo) and send it
    with a plain-text fallback. `deep_link` becomes the CTA button URL (the item link). Used by the
    notification hub and the chat/subscription sweepers so every channel looks identical.

    `code` (optional) renders a prominent, copy-friendly code box (email OTP / verification) — it is
    also included in the plain-text fallback so it survives clients that strip HTML.

    `to` is a single address or list; `fail_silently=False` lets a caller (e.g. the retrying
    fan-out task) surface SMTP errors. `title` defaults to `subject` when omitted."""
    recipients = [to] if isinstance(to, str) else list(to)
    heading = title or subject
    cta_url = f"{FRONTEND_URL}{deep_link}" if deep_link and deep_link.startswith("/") else (deep_link or "")
    html_body = render_to_string("email/notification.html", {
        "title": heading,
        "body": body,
        "code": code,
        "cta_url": cta_url,
        "cta_label": cta_label,
        "site_url": FRONTEND_URL,
        "logo_url": EMAIL_LOGO_URL,
        "prefs_url": EMAIL_PREFS_URL,
        "year": timezone.now().year,
    })
    text_body = "\n\n".join(part for part in (heading, body, code, cta_url) if part).strip()
    if not text_body:
        text_body = strip_tags(html_body)
    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=None,  # uses DEFAULT_FROM_EMAIL ("شغل أونلاين <no-reply@…>")
        to=recipients,
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send(fail_silently=fail_silently)


def notify_both(user_a, user_b, **kwargs) -> None:
    """Fan a contract/submission event out to both parties (FR-TASK-7)."""
    for user in (user_a, user_b):
        if user is not None:
            notify(user, **kwargs)


def unread_count(user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).count()


# ====================================================================== admin broadcast (FR-NOT-3/4)
def resolve_audience(audience: str, user_ids=None):
    """Audience is activity-based and independent of the view toggle (FR-NOT-3). Returns a
    DISTINCT queryset of ACTIVE users, so a dual-role user is targeted exactly once."""
    from django.db.models import Q

    from apps.accounts.models import User

    active = User.objects.filter(status=User.Status.ACTIVE)
    if audience == "everyone":
        return active.distinct()
    if audience == "workers":
        # "worker" = a started worker profile OR any proposal/service activity. The positive
        # bio_title__gt="" only matches users that actually HAVE a profile with a non-empty bio
        # (a NOT-equals would wrongly pull in users with no profile via the nullable join).
        return active.filter(
            Q(proposals__isnull=False) | Q(services__isnull=False) | Q(worker_profile__bio_title__gt="")
        ).distinct()
    if audience == "employers":
        # "employer" = at least one posted job OR service request
        return active.filter(
            Q(jobs__isnull=False) | Q(buying_requests__isnull=False)
        ).distinct()
    if audience == "specific":
        return active.filter(id__in=list(user_ids or [])).distinct()
    return User.objects.none()


def broadcast(*, title: str, body: str = "", audience: str, deep_link: str = "",
              user_ids=None) -> int:
    """Send an admin broadcast to the resolved audience. Honors each user's `marketing`
    preference (notify() returns None for opted-out users). Returns the number actually notified."""
    if not get_setting("notifications.broadcast_enabled", True):
        return 0
    sent = 0
    for user in resolve_audience(audience, user_ids).iterator():
        if notify(user, kind=Notification.Kind.ADMIN, title=title, body=body, deep_link=deep_link):
            sent += 1
    return sent
