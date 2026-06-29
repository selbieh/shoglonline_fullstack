"""Google SSO verification + account provisioning (FR-AUTH-1..6) plus the account
lifecycle services — freeze ripple (BR-23 / FR-ADM-5) and deletion (BR-2/3 / FR-PROF-7)."""
import logging
import secrets

from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError

from apps.core.models import AuditLog
from apps.core.services import get_setting

from .models import EmailLoginCode, User

logger = logging.getLogger(__name__)


def assert_active(*users) -> None:
    """Guard transactional entry points: neither party may be frozen/deleted (BR-23).

    The freeze ripple already hides a frozen user's listings, but a still-valid access token
    could reach a service call directly — this is the authoritative server-side check so a
    frozen/deleted account can never enter a NEW commitment (proposal, invite, purchase, contract).
    """
    for user in users:
        if user is not None and getattr(user, "status", User.Status.ACTIVE) != User.Status.ACTIVE:
            raise PermissionDenied(
                detail={"code": "account_inactive",
                        "message_ar": "لا يمكن تنفيذ هذا الإجراء — أحد الحسابات غير نشط"}
            )


class GoogleAuthError(AuthenticationFailed):
    default_detail = "تعذّر التحقق من حساب جوجل — حاول مجددًا"


def verify_google_token(id_token_str: str) -> dict:
    """Server-side verification of the Google ID token (FR-AUTH-3, SEC-1).

    Returns the verified payload: {sub, email, email_verified, name, picture}.
    Local development may enable GOOGLE_AUTH_STUB to accept "stub:<email>" tokens.
    """
    if settings.GOOGLE_AUTH_STUB and id_token_str.startswith("stub:"):
        email = id_token_str.removeprefix("stub:") or "dev@example.com"
        return {
            "sub": f"stub-{email}",
            "email": email,
            "email_verified": True,
            "given_name": "Dev",
            "family_name": "User",
            "picture": "",
        }

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    if not settings.GOOGLE_OAUTH_CLIENT_ID:
        raise GoogleAuthError("Google OAuth is not configured (GOOGLE_OAUTH_CLIENT_ID)")
    try:
        payload = google_id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), settings.GOOGLE_OAUTH_CLIENT_ID
        )
    except ValueError as exc:  # bad signature / audience / expiry
        logger.warning("Google token rejected: %s", exc)
        raise GoogleAuthError() from exc
    if not payload.get("email_verified", False):
        raise GoogleAuthError("البريد غير موثّق لدى جوجل")
    return payload


def _block_if_inactive(user: User) -> None:
    """Reject a returning login for a frozen/deleted account (FR-ADM-5 / BR-23)."""
    if user.status == User.Status.FROZEN:
        raise PermissionDenied(
            detail={"code": "account_frozen", "message_ar": "حسابك مجمّد — تواصل مع الدعم"}
        )
    if user.status == User.Status.DELETED:
        raise PermissionDenied(
            detail={"code": "account_deleted", "message_ar": "هذا الحساب محذوف"}
        )


def _queue_welcome(user: User) -> None:
    """Create the onboarding greeting row inside the current transaction, but only send the email
    AFTER it commits — so a rolled-back signup never emails a phantom welcome."""
    from apps.notifications.services import _dispatch, notify  # noqa: PLC0415 (avoid import cycle)

    note = notify(
        user, kind="admin_broadcast",
        title="مرحبًا بك في شغل أونلاين 👋",
        body="حسابك جاهز! أكمل ملفك الشخصي وابدأ بتصفّح الوظائف أو إنشاء خدمتك الأولى.",
        deep_link="/dashboard", force=True, send_now=False,
    )
    if note is not None:
        transaction.on_commit(lambda: _dispatch(note, email=True))


def _notify_security(user: User, *, title: str, body: str) -> None:
    """Owner-facing security notice (login/identity events). Email deferred to commit."""
    from apps.notifications.services import _dispatch, notify  # noqa: PLC0415 (avoid import cycle)

    note = notify(
        user, kind="admin_broadcast", title=title, body=body,
        deep_link="/settings", force=True, send_now=False,
    )
    if note is not None:
        transaction.on_commit(lambda: _dispatch(note, email=True))


def get_or_provision_user(
    email: str, *, ip: str | None = None,
    first_name: str = "", last_name: str = "", avatar_url: str = "",
    google_sub: str | None = None,
) -> tuple[User, bool]:
    """Single source of truth for end-user create-or-fetch — used by BOTH Google SSO and email OTP
    so side effects (bids/welcome/terms) and gates (registration/frozen/deleted) never diverge and
    no duplicate account can be created (FR-AUTH-2/5/6, BR-1). Returns (user, created).

    Sign-in == sign-up: the same email always resolves to the same account regardless of method.
    """
    email = (email or "").strip().lower()
    by_sub = User.objects.filter(google_sub=google_sub).first() if google_sub else None
    by_email = User.objects.filter(email__iexact=email).first()

    # Split-brain guard: the Google identity and the email point at DIFFERENT rows. Never auto-link
    # (would attach the wrong identity) and never duplicate — refuse and let support reconcile.
    if by_sub and by_email and by_sub.pk != by_email.pk:
        AuditLog.objects.create(
            actor=None, action="auth.account_conflict", ip=ip,
            after={"by_sub": by_sub.pk, "by_email": by_email.pk},
        )
        raise PermissionDenied(
            detail={"code": "account_conflict",
                    "message_ar": "تعذّر ربط الحساب — تواصل مع الدعم"}
        )

    user = by_sub or by_email

    if user is None:
        if not get_setting("registration.enabled", True):
            raise PermissionDenied(
                detail={"code": "registration_closed", "message_ar": "التسجيل مغلق حاليًا"}
            )
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=email, google_sub=google_sub,
                    first_name=first_name, last_name=last_name, avatar_url=avatar_url,
                    terms_accepted_at=timezone.now(),  # consent given on the sign-in screen
                )
                from apps.bids.services import grant_signup_bids  # noqa: PLC0415

                grant_signup_bids(user)  # FR-BID-5: free bids at registration — once, only on create
                _queue_welcome(user)
            return user, True
        except IntegrityError:
            # Lost a concurrent first-login race — the winner already provisioned this identity.
            user = (User.objects.filter(google_sub=google_sub).first() if google_sub else None) \
                or User.objects.filter(email__iexact=email).first()
            if user is None:
                raise

    _block_if_inactive(user)
    if google_sub and not user.google_sub:  # link a Google identity to an existing (e.g. OTP) account
        user.google_sub = google_sub
        user.save(update_fields=["google_sub"])
        _notify_security(
            user,
            title="تم ربط حساب جوجل بحسابك",
            body="تم تسجيل الدخول وربط حساب جوجل بحسابك في شغل أونلاين. إن لم تكن أنت، تواصل مع الدعم فورًا.",
        )
    return user, False


def authenticate_google_user(id_token_str: str, ip: str | None = None) -> tuple[User, bool]:
    """Sign-in == sign-up (FR-AUTH-2). Verifies the Google token, then delegates to the shared
    provisioning path. Returns (user, created)."""
    payload = verify_google_token(id_token_str)
    user, created = get_or_provision_user(
        payload["email"], ip=ip,
        first_name=payload.get("given_name", ""),
        last_name=payload.get("family_name", ""),
        avatar_url=payload.get("picture", ""),
        google_sub=payload["sub"],
    )
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    AuditLog.objects.create(
        actor=user, action="auth.google_signup" if created else "auth.google_login", ip=ip
    )
    return user, created


# ====================================================================== freeze ripple (BR-23)
@transaction.atomic
def freeze_user(user: User, *, reason: str = "", actor=None, ip=None) -> User:
    """FR-ADM-5 / BR-23: atomically freeze an account and ripple the side-effects.

    Blocks auth (status=FROZEN — enforced at login), **unlists** published jobs & live services,
    **suspends** the user's open proposals and any pending invitations on either side, flips their
    active conversations **read-only**, **stops** affiliate accrual, and **notifies** the counterpart
    of every in-flight contract (offering cancel-with-full-refund or a dispute). Escrow holds and
    scheduled warranty releases are intentionally left intact until each contract resolves — money
    never moves here (the ledger is untouched by a freeze).
    """
    if user.status == User.Status.FROZEN:
        return user  # idempotent
    before = user.status
    user.status = User.Status.FROZEN
    user.is_active = False  # simplejwt rejects already-issued access tokens at once (no 15-min window)
    user.save(update_fields=["status", "is_active"])
    _ripple_freeze(user)
    AuditLog.objects.create(
        actor=actor or user, action="admin.freeze_user", model="User", object_id=str(user.pk),
        before={"status": before}, after={"status": user.status, "reason": reason}, ip=ip,
    )
    return user


def _ripple_freeze(user: User) -> None:
    from apps.chat import firestore
    from apps.chat.models import Conversation
    from apps.contracts.models import Contract
    from apps.gigs.models import Service
    from apps.jobs.models import Invitation, Job, Proposal
    from apps.notifications.services import notify

    # Listings: hide published jobs & live services (reversible — prev status preserved per row).
    Job.objects.filter(employer=user, status=Job.Status.PUBLISHED).update(
        frozen_prev_status=F("status"), status=Job.Status.SUSPENDED
    )
    Service.objects.filter(worker=user, status=Service.Status.LIVE).update(
        frozen_prev_status=F("status"), status=Service.Status.PAUSED
    )
    # Open outgoing proposals → suspended (bid stays consumed; restored on unfreeze, no refund).
    Proposal.objects.filter(worker=user, status__in=Proposal.OPEN_STATUSES).update(
        frozen_prev_status=F("status"), status=Proposal.Status.SUSPENDED
    )
    # Pending invitations on either side → suspended.
    Invitation.objects.filter(
        Q(employer=user) | Q(worker=user), status=Invitation.Status.SENT
    ).update(frozen_prev_status=F("status"), status=Invitation.Status.SUSPENDED)

    # Active conversations → read-only (Postgres + Firestore mirror so direct clients are blocked).
    for conv in Conversation.objects.filter(
        Q(user_a=user) | Q(user_b=user), status=Conversation.Status.ACTIVE
    ):
        conv.frozen_prev_status = conv.status
        conv.status = Conversation.Status.READ_ONLY
        conv.save(update_fields=["status", "frozen_prev_status"])
        firestore.mirror_status(conv)

    # Affiliate accrual stops (already-accrued commissions are not clawed back).
    from apps.affiliate.services import set_frozen
    set_frozen(user, True)

    # In-flight contracts keep escrow/warranty intact; notify the counterpart of their options.
    for contract in Contract.objects.filter(
        Q(employer=user) | Q(worker=user), status__in=Contract.OPEN_STATUSES
    ):
        counterpart = contract.worker if contract.employer_id == user.id else contract.employer
        if counterpart is not None and counterpart.status == User.Status.ACTIVE:
            notify(
                counterpart, kind="contract",
                title="تم تجميد حساب الطرف الآخر في العقد",
                body="يمكنك الاستمرار حتى انتهاء العقد، أو طلب الإلغاء بالتراضي مع استرداد كامل، أو فتح نزاع.",
                deep_link=f"/contracts/{contract.pk}",
            )


@transaction.atomic
def unfreeze_user(user: User, *, actor=None, ip=None) -> User:
    """Reverse a freeze (FR-ADM-5): restore listings, proposals, invitations, conversations and
    resume affiliate accrual. Only a FROZEN account reactivates — a DELETED one never does."""
    if user.status != User.Status.FROZEN:
        return user  # only frozen accounts reactivate (deleted stays deleted)
    user.status = User.Status.ACTIVE
    user.is_active = True  # re-enable auth (counterpart of the freeze)
    user.save(update_fields=["status", "is_active"])
    _ripple_unfreeze(user)
    AuditLog.objects.create(
        actor=actor or user, action="admin.activate_user", model="User", object_id=str(user.pk),
        before={"status": User.Status.FROZEN}, after={"status": user.status}, ip=ip,
    )
    return user


def _ripple_unfreeze(user: User) -> None:
    from apps.chat import firestore
    from apps.chat.models import Conversation
    from apps.contracts.models import Contract
    from apps.gigs.models import Service
    from apps.jobs.models import Invitation, Job, Proposal

    # Restore each suspended row to EXACTLY its pre-freeze status (only rows we changed).
    Job.objects.filter(employer=user).exclude(frozen_prev_status="").update(
        status=F("frozen_prev_status"), frozen_prev_status=""
    )
    Service.objects.filter(worker=user).exclude(frozen_prev_status="").update(
        status=F("frozen_prev_status"), frozen_prev_status=""
    )
    Proposal.objects.filter(worker=user).exclude(frozen_prev_status="").update(
        status=F("frozen_prev_status"), frozen_prev_status=""
    )
    Invitation.objects.filter(Q(employer=user) | Q(worker=user)).exclude(frozen_prev_status="").update(
        status=F("frozen_prev_status"), frozen_prev_status=""
    )

    # Conversations: restore to ACTIVE unless the linked contract terminated during the freeze
    # (a completed-with-warranty-released or cancelled contract must stay read-only — BR-10).
    terminal = (Contract.Status.CANCELLED, Contract.Status.COMPLETED)
    for conv in Conversation.objects.filter(Q(user_a=user) | Q(user_b=user)).exclude(frozen_prev_status=""):
        prev = conv.frozen_prev_status
        keep_locked = bool(
            conv.contract_id
            and (conv.contract.funds_released or conv.contract.status in terminal)
        )
        conv.frozen_prev_status = ""
        if keep_locked:
            conv.save(update_fields=["frozen_prev_status"])
        else:
            conv.status = prev
            conv.save(update_fields=["status", "frozen_prev_status"])
            firestore.mirror_status(conv)

    from apps.affiliate.services import set_frozen
    set_frozen(user, False)


# ====================================================================== account deletion (BR-2/3)
def account_deletion_blockers(user: User) -> list[dict]:
    """BR-2: deletion is blocked while money or commitments are in flight. Returns the exact
    blockers (each with a settlement path) — an empty list means the account may be deleted."""
    from apps.contracts.models import Contract
    from apps.gigs.models import BuyingRequest
    from apps.payments.models import WithdrawalRequest
    from apps.payments.services import get_wallet

    blockers: list[dict] = []

    open_contracts = Contract.objects.filter(
        Q(employer=user) | Q(worker=user), status__in=Contract.OPEN_STATUSES
    ).count()
    if open_contracts:
        blockers.append({
            "code": "open_contracts",
            "message_ar": f"لديك {open_contracts} عقد جارٍ — أكمله أو ألغِه بالتراضي قبل الحذف",
            "settlement": "complete_or_cancel_contracts",
        })

    wallet = get_wallet(user)
    if wallet.available or wallet.escrow_held or wallet.earnings_pending:
        blockers.append({
            "code": "wallet_not_empty",
            "message_ar": "رصيد محفظتك غير صفري — اسحب المتاح وانتظر تحرير المبالغ المحجوزة وأرباح الضمان",
            "settlement": "withdraw_or_await_release",
        })

    unsettled = WithdrawalRequest.objects.filter(
        user=user,
        status__in=[WithdrawalRequest.Status.REQUESTED, WithdrawalRequest.Status.PROCESSING],
    ).count()
    if unsettled:
        blockers.append({
            "code": "withdrawal_in_progress",
            "message_ar": "لديك طلب سحب قيد المعالجة — انتظر اكتماله قبل الحذف",
            "settlement": "await_withdrawal",
        })

    pending_requests = BuyingRequest.objects.filter(
        Q(employer=user) | Q(service__worker=user), status=BuyingRequest.Status.PENDING
    ).count()
    if pending_requests:
        blockers.append({
            "code": "pending_service_requests",
            "message_ar": "لديك طلبات خدمة معلّقة — أكملها أو ألغِها قبل الحذف",
            "settlement": "resolve_service_requests",
        })

    return blockers


@transaction.atomic
def delete_account(user: User, *, reason: str = "", note: str = "", ip=None) -> User:
    """FR-PROF-7 / BR-2/3: soft-delete after the blocker gate clears. Unpublishes listings, expires
    open proposals/invitations, anonymizes public content and locks conversations — while the
    financial ledger is retained immutably (transactions/wallet rows are never touched)."""
    if user.status == User.Status.DELETED:
        return user  # idempotent
    blockers = account_deletion_blockers(user)
    if blockers:
        raise ValidationError({"code": "deletion_blocked",
                               "message_ar": "لا يمكن حذف الحساب الآن", "blockers": blockers})

    from apps.chat import firestore
    from apps.chat.models import Conversation
    from apps.gigs.models import Service
    from apps.jobs import services as job_services
    from apps.jobs.models import Invitation, Job, Proposal
    from apps.profiles.models import EmployerProfile, WorkerProfile

    before_status = user.status

    # Close every still-listable job (refunds open bidders via close_job); archive services.
    closeable = (Job.Status.DRAFT, Job.Status.PENDING_REVIEW, Job.Status.PUBLISHED, Job.Status.SUSPENDED)
    for job in Job.objects.filter(employer=user, status__in=closeable):
        job_services.close_job(job)
    Service.objects.filter(worker=user).exclude(
        status__in=[Service.Status.ARCHIVED, Service.Status.REJECTED]
    ).update(status=Service.Status.ARCHIVED, frozen_prev_status="")

    # Expire the user's own open proposals (no bid refund — the account is leaving) and any
    # pending invitations on either side.
    Proposal.objects.filter(
        worker=user, status__in=(*Proposal.OPEN_STATUSES, Proposal.Status.SUSPENDED)
    ).update(status=Proposal.Status.CANCELLED, frozen_prev_status="")
    Invitation.objects.filter(
        Q(employer=user) | Q(worker=user),
        status__in=[Invitation.Status.SENT, Invitation.Status.SUSPENDED],
    ).update(status=Invitation.Status.EXPIRED, frozen_prev_status="")

    # Lock every conversation the user is in (history preserved, no new messages).
    for conv in Conversation.objects.filter(
        Q(user_a=user) | Q(user_b=user), status=Conversation.Status.ACTIVE
    ):
        conv.status = Conversation.Status.READ_ONLY
        conv.frozen_prev_status = ""
        conv.save(update_fields=["status", "frozen_prev_status"])
        firestore.mirror_status(conv)

    # Anonymize public content (BR-3). The row persists so ledger FKs stay valid.
    WorkerProfile.objects.filter(user=user).update(
        bio_title="", overview="", cover_image="", is_verified=False
    )
    EmployerProfile.objects.filter(user=user).update(company_name="")

    user.status = User.Status.DELETED
    user.first_name = ""
    user.last_name = ""
    user.avatar_url = ""
    user.phone = ""
    user.phone_verified = False
    user.google_sub = None  # free the Google identity so the person could re-register fresh
    user.email = f"deleted-{user.pk}@deleted.invalid"  # de-identify; frees the real email
    user.is_active = False
    user.save(update_fields=[
        "status", "first_name", "last_name", "avatar_url", "phone", "phone_verified",
        "google_sub", "email", "is_active",
    ])

    AuditLog.objects.create(
        actor=user, action="account.deleted", model="User", object_id=str(user.pk),
        before={"status": before_status}, after={"status": user.status, "reason": reason, "note": note},
        ip=ip,
    )
    return user


# --------------------------------------------------------------- phone OTP (ppt slide-08)
OTP_TTL = 300          # seconds a code stays valid
OTP_RESEND_GAP = 60    # seconds the user must wait between sends
OTP_MAX_ATTEMPTS = 5


def _otp_key(user) -> str:
    return f"phone_otp:{user.pk}"


def _send_sms(phone: str, message: str) -> None:
    """Pluggable SMS sender. Dev stub logs the message; wire a provider in production (SEC)."""
    logger.info("SMS to %s: %s", phone, message)


def _phone_verification_enabled() -> bool:
    return bool(get_setting("profiles.phone_verification", False))


def request_phone_otp(user, phone: str) -> dict:
    """Generate + 'send' a phone verification code (cache-backed, rate-limited).

    Gated by the `profiles.phone_verification` operator flag (off by default)."""
    if not _phone_verification_enabled():
        raise ValidationError({"code": "phone_verification_disabled", "message_ar": "التحقق عبر الجوال غير مُفعّل حاليًا"})
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(digits) < 8:
        raise ValidationError({"code": "invalid_phone", "message_ar": "رقم الجوال غير صالح"})
    if cache.get(f"phone_otp_gap:{user.pk}"):
        raise ValidationError({"code": "otp_too_soon", "message_ar": "انتظر قليلًا قبل إعادة الإرسال"})
    code = f"{secrets.randbelow(10000):04d}"
    cache.set(_otp_key(user), {"code": code, "phone": str(phone)[:20], "attempts": 0}, OTP_TTL)
    cache.set(f"phone_otp_gap:{user.pk}", 1, OTP_RESEND_GAP)
    _send_sms(str(phone), f"رمز التحقق الخاص بك في شغل أونلاين: {code}")
    out = {"sent": True}
    if settings.DEBUG:
        out["debug_code"] = code  # dev convenience only — never returned in production
    return out


def verify_phone_otp(user, code: str) -> User:
    """Confirm the code and mark the phone verified (FR-PROF / ppt slide-08)."""
    data = cache.get(_otp_key(user))
    if not data:
        raise ValidationError({"code": "otp_expired", "message_ar": "انتهت صلاحية الرمز، أعد الإرسال"})
    if data.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        cache.delete(_otp_key(user))
        raise ValidationError({"code": "otp_locked", "message_ar": "محاولات كثيرة، أعد إرسال الرمز"})
    if str(code).strip() != data["code"]:
        data["attempts"] = data.get("attempts", 0) + 1
        cache.set(_otp_key(user), data, OTP_TTL)
        raise ValidationError({"code": "otp_mismatch", "message_ar": "الرمز غير صحيح"})
    user.phone = data["phone"]
    user.phone_verified = True
    user.save(update_fields=["phone", "phone_verified"])
    cache.delete(_otp_key(user))
    cache.delete(f"phone_otp_gap:{user.pk}")
    AuditLog.objects.create(
        actor=user, action="phone.verified", model="User", object_id=str(user.pk),
        after={"phone_verified": True},
    )
    return user


# --------------------------------------------------------------- email change (ppt slide-31)
EMAIL_CHANGE_TTL = 900   # 15 min token validity
EMAIL_CHANGE_GAP = 60    # seconds between requests


def _email_change_key(user) -> str:
    return f"email_change:{user.pk}"


def _send_email(to_email: str, subject: str, body: str) -> None:
    """Pluggable email sender. Logs for dev visibility, then delivers the branded RTL email
    (same template/colors/logo as every other notification)."""
    logger.info("Email to %s | %s | %s", to_email, subject, body)
    from apps.notifications.services import send_branded_email  # noqa: PLC0415 (avoid import cycle)
    send_branded_email(to=to_email, subject=subject, body=body)


def request_email_change(user, new_email: str) -> dict:
    """Start an email change: cache a confirm token + the pending address, then 'send' the link.
    The address only switches after confirm_email_change (re-verification), so a typo can't lock
    the user out (FR-AUTH / ppt slide-31)."""
    new_email = str(new_email).strip().lower()
    if "@" not in new_email or "." not in new_email.rsplit("@", 1)[-1]:
        raise ValidationError({"code": "invalid_email", "message_ar": "البريد الإلكتروني غير صالح"})
    if new_email == (user.email or "").lower():
        raise ValidationError({"code": "same_email", "message_ar": "هذا هو بريدك الحالي بالفعل"})
    if User.objects.filter(email__iexact=new_email).exclude(pk=user.pk).exists():
        raise ValidationError({"code": "email_taken", "message_ar": "هذا البريد مستخدم في حساب آخر"})
    if cache.get(f"email_change_gap:{user.pk}"):
        raise ValidationError({"code": "too_soon", "message_ar": "انتظر قليلًا قبل إعادة المحاولة"})
    token = secrets.token_urlsafe(24)
    cache.set(_email_change_key(user), {"token": token, "email": new_email}, EMAIL_CHANGE_TTL)
    cache.set(f"email_change_gap:{user.pk}", 1, EMAIL_CHANGE_GAP)
    _send_email(new_email, "تأكيد تغيير البريد الإلكتروني", f"رمز تأكيد تغيير بريدك في شغل أونلاين: {token}")
    out = {"sent": True}
    if settings.DEBUG:
        out["debug_token"] = token  # dev convenience only — never returned in production
    return out


def confirm_email_change(user, token: str) -> User:
    """Confirm the pending email change with the emailed token."""
    data = cache.get(_email_change_key(user))
    if not data:
        raise ValidationError({"code": "token_expired", "message_ar": "انتهت صلاحية الطلب، أعد المحاولة"})
    if str(token).strip() != data["token"]:
        raise ValidationError({"code": "token_mismatch", "message_ar": "رمز التأكيد غير صحيح"})
    if User.objects.filter(email__iexact=data["email"]).exclude(pk=user.pk).exists():
        raise ValidationError({"code": "email_taken", "message_ar": "هذا البريد مستخدم في حساب آخر"})
    old = user.email
    user.email = data["email"]
    user.save(update_fields=["email"])
    cache.delete(_email_change_key(user))
    cache.delete(f"email_change_gap:{user.pk}")
    AuditLog.objects.create(
        actor=user, action="email.changed", model="User", object_id=str(user.pk),
        before={"email": old}, after={"email": user.email},
    )
    return user


# --------------------------------------------------------------- email OTP login (FR-AUTH)
# Passwordless login/signup by a one-time code emailed to the user. Sign-in == sign-up: the same
# email resolves to the same account whether the user came via Google or OTP (get_or_provision_user).
# Codes are persisted (EmailLoginCode) so they show in the admin and single-use is row-locked.


def _otp_email_valid(email: str) -> bool:
    return "@" in email and "." in email.rsplit("@", 1)[-1]


# Complex code alphabet (FR-AUTH): mixed-case letters + digits + special characters for high entropy.
# Visually-ambiguous characters (O/0, I/l/1) are excluded to cut typo-driven lockouts.
_OTP_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz"
_OTP_DIGITS = "23456789"
_OTP_SPECIALS = "@#$%&*?!"
_OTP_ALL = _OTP_LETTERS + _OTP_DIGITS + _OTP_SPECIALS


def _generate_login_code(length: int) -> str:
    """A cryptographically-random code guaranteed to mix letters, digits and special characters."""
    length = max(4, int(length))
    rng = secrets.SystemRandom()
    # Guarantee at least one of each required class, then fill + shuffle so position is unpredictable.
    chars = [secrets.choice(_OTP_LETTERS), secrets.choice(_OTP_DIGITS), secrets.choice(_OTP_SPECIALS)]
    chars += [secrets.choice(_OTP_ALL) for _ in range(length - len(chars))]
    rng.shuffle(chars)
    return "".join(chars)


def request_login_otp(email: str, ip: str | None = None) -> dict:
    """Generate + email a login code (rate-limited, anti-enumeration). Always returns {"sent": True}
    for any syntactically-valid email so callers can't probe which addresses have accounts."""
    if not get_setting("auth.email_otp_enabled", True):
        raise ValidationError({"code": "otp_disabled", "message_ar": "الدخول برمز البريد غير مُفعّل حاليًا"})
    email = (email or "").strip().lower()
    if not _otp_email_valid(email):
        raise ValidationError({"code": "invalid_email", "message_ar": "البريد الإلكتروني غير صالح"})

    gap = int(get_setting("auth.otp_resend_gap_seconds", 60))
    if cache.get(f"email_otp_gap:{email}"):
        raise ValidationError({"code": "otp_too_soon", "message_ar": "انتظر قليلًا قبل إعادة الإرسال"})

    # Per-email rolling-24h cap (anti-bombing; DB-backed so it survives across workers).
    day_ago = timezone.now() - timedelta(hours=24)
    email_cap = int(get_setting("auth.otp_email_daily_cap", 10))
    if EmailLoginCode.objects.filter(email__iexact=email, created_at__gte=day_ago).count() >= email_cap:
        raise ValidationError({"code": "otp_too_many", "message_ar": "تجاوزت عدد المحاولات اليومية، حاول لاحقًا"})

    # Per-IP daily cap so one attacker can't exhaust a victim's per-email quota or mailbomb at scale.
    if ip:
        ip_cap = int(get_setting("auth.otp_ip_daily_cap", 20))
        ip_key = f"email_otp_ip:{ip}:{timezone.now():%Y%m%d}"
        cache.add(ip_key, 0, 60 * 60 * 24)
        try:
            ip_count = cache.incr(ip_key)
        except ValueError:
            cache.set(ip_key, 1, 60 * 60 * 24)
            ip_count = 1
        if ip_count > ip_cap:
            raise ValidationError({"code": "otp_too_many", "message_ar": "تجاوزت عدد المحاولات، حاول لاحقًا"})

    cache.set(f"email_otp_gap:{email}", 1, gap)

    # Registration-closed shortcut: an unknown email can never complete signup, so don't send a
    # dead-end code — but keep the response identical so registration state can't be probed.
    is_existing = User.objects.filter(email__iexact=email).exists()
    if not is_existing and not get_setting("registration.enabled", True):
        return {"sent": True}

    # Supersede any outstanding codes so only the newest can be redeemed.
    EmailLoginCode.objects.filter(email__iexact=email, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    length = int(get_setting("auth.otp_length", 7))
    code = _generate_login_code(length)
    ttl = int(get_setting("auth.otp_ttl_seconds", 600))
    EmailLoginCode.objects.create(
        email=email, code=code, request_ip=ip,
        expires_at=timezone.now() + timedelta(seconds=ttl),
    )

    minutes = max(1, ttl // 60)
    try:
        from apps.notifications.services import send_branded_email  # noqa: PLC0415

        send_branded_email(
            to=email,
            subject="رمز الدخول إلى شغل أونلاين",
            title="رمز الدخول الخاص بك",
            body=(
                f"استخدم الرمز التالي لتسجيل الدخول إلى شغل أونلاين. الرمز صالح لمدة {minutes} دقيقة، "
                "ويُكتب كما هو تمامًا (حسّاس لحالة الأحرف). لا تشاركه مع أي أحد."
            ),
            code=code,
            deep_link="/signin",
            cta_label="الذهاب إلى تسجيل الدخول",
            fail_silently=False,
        )
    except Exception as exc:  # noqa: BLE001 — never leak delivery state (anti-enumeration); just log
        logger.warning("email OTP send failed for %s: %s", email, exc)
    return {"sent": True}


def verify_login_otp(email: str, code: str, ip: str | None = None) -> tuple[User, bool]:
    """Confirm a login code and return (user, created) via the shared provisioning path. Single-use is
    enforced atomically with a row lock (compare-and-set); brute force is capped by a per-email fail
    counter that survives code re-requests (supersede)."""
    if not get_setting("auth.email_otp_enabled", True):
        raise ValidationError({"code": "otp_disabled", "message_ar": "الدخول برمز البريد غير مُفعّل حاليًا"})
    email = (email or "").strip().lower()
    code = str(code or "").strip()
    max_attempts = int(get_setting("auth.otp_max_attempts", 5))
    lock_ttl = int(get_setting("auth.otp_fail_window_lock_seconds", 900))
    fail_key = f"email_otp_fail:{email}"

    # Cross-supersede brute-force lock: re-requesting a fresh code cannot reset this.
    if (cache.get(fail_key) or 0) >= max_attempts:
        raise ValidationError({"code": "otp_locked", "message_ar": "محاولات كثيرة، حاول لاحقًا"})

    now = timezone.now()
    row = EmailLoginCode.objects.filter(email__iexact=email).order_by("-created_at").first()
    if row is None or not row.is_redeemable(now, max_attempts):
        raise ValidationError({"code": "otp_expired", "message_ar": "انتهت صلاحية الرمز، أعد الإرسال"})

    if code != row.code:
        EmailLoginCode.objects.filter(pk=row.pk).update(attempts=F("attempts") + 1)  # autocommit, persists
        cache.add(fail_key, 0, lock_ttl)
        try:
            fails = cache.incr(fail_key)
        except ValueError:
            cache.set(fail_key, 1, lock_ttl)
            fails = 1
        if fails >= max_attempts:
            raise ValidationError({"code": "otp_locked", "message_ar": "محاولات كثيرة، حاول لاحقًا"})
        raise ValidationError({"code": "otp_mismatch", "message_ar": "الرمز غير صحيح"})

    # Correct code — consume + provision atomically so single-use holds under concurrent verifies.
    with transaction.atomic():
        locked = EmailLoginCode.objects.select_for_update().get(pk=row.pk)
        if not locked.is_redeemable(now, max_attempts):  # lost the race — already consumed
            raise ValidationError({"code": "otp_expired", "message_ar": "انتهت صلاحية الرمز، أعد الإرسال"})
        locked.consumed_at = now
        locked.save(update_fields=["consumed_at"])
        user, created = get_or_provision_user(email, ip=ip)
        user.last_login = now
        user.save(update_fields=["last_login"])
        AuditLog.objects.create(
            actor=user, action="auth.email_otp_signup" if created else "auth.email_otp_login", ip=ip,
        )
        # Owner-facing alert when OTP signs into an account that ALSO has Google linked (mailbox
        # access ≠ Google access) — assurance downgrade should be visible to the owner.
        if not created and user.google_sub:
            _notify_security(
                user,
                title="تسجيل دخول جديد عبر رمز البريد",
                body="تم تسجيل الدخول إلى حسابك باستخدام رمز أُرسل إلى بريدك. إن لم تكن أنت، تواصل مع الدعم فورًا.",
            )

    cache.delete(fail_key)
    cache.delete(f"email_otp_gap:{email}")
    return user, created
