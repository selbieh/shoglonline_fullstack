"""Google SSO verification + account provisioning (FR-AUTH-1..6) plus the account
lifecycle services — freeze ripple (BR-23 / FR-ADM-5) and deletion (BR-2/3 / FR-PROF-7)."""
import logging

from django.conf import settings
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied, ValidationError

from apps.core.models import AuditLog
from apps.core.services import get_setting

from .models import User

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


def authenticate_google_user(id_token_str: str, ip: str | None = None) -> tuple[User, bool]:
    """Sign-in == sign-up (FR-AUTH-2). Returns (user, created).

    Enforces: registration flag (FR-AUTH-5), frozen accounts blocked (FR-ADM-5),
    one account per Google identity (FR-AUTH-6 / BR-1).
    """
    payload = verify_google_token(id_token_str)
    email = payload["email"].lower()

    user = (
        User.objects.filter(google_sub=payload["sub"]).first()
        or User.objects.filter(email=email).first()
    )
    created = False

    if user is None:
        if not get_setting("registration.enabled", True):
            raise PermissionDenied(
                detail={"code": "registration_closed", "message_ar": "التسجيل مغلق حاليًا"}
            )
        user = User.objects.create_user(
            email=email,
            google_sub=payload["sub"],
            first_name=payload.get("given_name", ""),
            last_name=payload.get("family_name", ""),
            avatar_url=payload.get("picture", ""),
            terms_accepted_at=timezone.now(),  # consent given on the sign-in screen (FR-AUTH-2)
        )
        created = True
        from apps.bids.services import grant_signup_bids

        grant_signup_bids(user)  # FR-BID-5: free bids at registration
    else:
        if user.status == User.Status.FROZEN:
            raise PermissionDenied(
                detail={"code": "account_frozen", "message_ar": "حسابك مجمّد — تواصل مع الدعم"}
            )
        if user.status == User.Status.DELETED:
            raise PermissionDenied(
                detail={"code": "account_deleted", "message_ar": "هذا الحساب محذوف"}
            )
        if not user.google_sub:  # staff account linking its Google identity
            user.google_sub = payload["sub"]
            user.save(update_fields=["google_sub"])

    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    AuditLog.objects.create(
        actor=user, action="auth.google_login" if not created else "auth.google_signup", ip=ip
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
