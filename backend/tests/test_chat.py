"""Phase 5 — Chat & notifications (SRS FR-CHAT, FR-NOT, BR-10/11, AC-6).

Covers: rule D-2 initiation (chat opens ONLY for a funded/active contract between the two
parties — no proposal-stage or unfunded-contract chat), self-chat blocked (BR-21),
kill-switch, banned-words filter, unread counts, the warranty-end read-only flip (BR-10),
and the 10-min unread-email checker firing exactly once.
"""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bids.models import BidLedger
from apps.catalog.models import Category
from apps.chat import services as chat
from apps.chat.models import Conversation, Message
from apps.chat.tasks import lock_idle_conversations, send_unread_chat_emails
from apps.contracts import services as cs
from apps.contracts.models import Contract
from apps.core.services import set_setting
from apps.jobs import services as js
from apps.jobs.models import Job
from apps.notifications.models import Notification
from apps.payments import services as pay
from apps.payments.models import Transaction


@pytest.fixture(autouse=True)
def _flags(db):
    set_setting("jobs.auto_publish", True)
    set_setting("chat.enabled", True)
    set_setting("emails.enabled", True)
    set_setting("emails.chat_unread_enabled", True)
    set_setting("chat.unread_email_delay_minutes", 10)
    set_setting("chat.banned_words", [])
    set_setting("payments.commission_pct", 10)
    set_setting("contracts.warranty_days", 60)


@pytest.fixture()
def employer(db):
    return User.objects.create_user(email="emp@example.com", first_name="رب")


@pytest.fixture()
def worker(db):
    u = User.objects.create_user(email="wk@example.com", first_name="عامل")
    BidLedger.objects.create(user=u, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    return u


@pytest.fixture()
def category(db):
    return Category.objects.create(name_ar="برمجة", name_en="Dev", slug="dev")


def make_proposal(employer, worker, category, budget="100"):
    job = Job.objects.create(employer=employer, title="مهمة", description="وصف", category=category,
                             budget_min=10, budget_max=500, status=Job.Status.PUBLISHED,
                             published_at=timezone.now())
    return js.submit_proposal(worker=worker, job=job, budget=Decimal(budget),
                              delivery_days=7, description="عرض", answers={})


def make_funded_contract(employer, worker, category, budget="100"):
    """Accept + fund a proposal → an ACTIVE contract (auto-opens its conversation, rule D-2)."""
    proposal = make_proposal(employer, worker, category, budget)
    pay.post(pay.get_wallet(employer), type=Transaction.Type.DEPOSIT,
             bucket=Transaction.Bucket.AVAILABLE, amount=Decimal(budget) + Decimal("50"), note="seed")
    return js.accept_proposal(proposal)


def make_unfunded_contract(employer, worker, category, budget="100"):
    """Accept WITHOUT funding → the contract stays Pending-Funding (no chat opens)."""
    proposal = make_proposal(employer, worker, category, budget)
    return js.accept_proposal(proposal)


def conv_for(employer, worker, category):
    """The conversation auto-opened for a funded/active contract."""
    return make_funded_contract(employer, worker, category).conversations.first()


# ------------------------------------------------------------------ initiation (rule D-2)
@pytest.mark.django_db
class TestInitiation:
    def test_chat_opens_on_active_contract(self, employer, worker, category):
        contract = make_funded_contract(employer, worker, category)
        assert contract.conversations.count() == 1  # auto-opened on Active
        conv = contract.conversations.first()
        assert conv.has_member(employer) and conv.has_member(worker)

    def test_no_proposal_stage_chat(self, employer, worker, category):
        """rule D-2: nobody (employer or worker) can open chat from a proposal."""
        proposal = make_proposal(employer, worker, category)
        with pytest.raises(PermissionDenied):
            chat.start_from_proposal(employer, proposal)
        with pytest.raises(PermissionDenied):
            chat.start_from_proposal(worker, proposal)

    def test_unfunded_contract_has_no_chat(self, employer, worker, category):
        contract = make_unfunded_contract(employer, worker, category)
        assert contract.status == Contract.Status.PENDING_FUNDING
        assert contract.conversations.count() == 0
        with pytest.raises(ValidationError):
            chat.get_or_create_for_contract(contract)  # not funded yet

    def test_self_chat_blocked(self, employer, category):
        with pytest.raises(PermissionDenied):
            chat._get_or_create(employer, employer, context_type=Conversation.Context.DIRECT)

    def test_conversation_is_deduped(self, employer, worker, category):
        contract = make_funded_contract(employer, worker, category)
        c1 = chat.get_or_create_for_contract(contract)
        c2 = chat.get_or_create_for_contract(contract)
        assert c1.pk == c2.pk


# ------------------------------------------------------------------ messaging
@pytest.mark.django_db
class TestMessaging:
    def test_send_and_unread_count(self, employer, worker, category):
        conv = conv_for(employer, worker, category)
        chat.send_message(conv, employer, body="مرحبًا")
        assert chat.unread_count(conv, worker) == 1
        assert chat.unread_count(conv, employer) == 0  # sender auto-read
        chat.mark_read(conv, worker)
        assert chat.unread_count(conv, worker) == 0

    def test_kill_switch_blocks_send(self, employer, worker, category):
        conv = conv_for(employer, worker, category)
        set_setting("chat.enabled", False)
        with pytest.raises(ValidationError):
            chat.send_message(conv, employer, body="hi")

    def test_banned_words_masked(self, employer, worker, category):
        conv = conv_for(employer, worker, category)
        set_setting("chat.banned_words", ["سيء"])
        msg = chat.send_message(conv, employer, body="كلام سيء هنا")
        assert "سيء" not in msg.body

    def test_non_member_cannot_send(self, employer, worker, category):
        conv = conv_for(employer, worker, category)
        stranger = User.objects.create_user(email="x@example.com")
        with pytest.raises(PermissionDenied):
            chat.send_message(conv, stranger, body="hi")

    def test_message_creates_notification(self, employer, worker, category):
        conv = conv_for(employer, worker, category)
        chat.send_message(conv, employer, body="مرحبًا")
        assert Notification.objects.filter(user=worker, kind="chat_message").count() == 1


# ------------------------------------------------------------------ read-only lifecycle
@pytest.mark.django_db
class TestReadOnly:
    def test_warranty_end_flips_conversation_read_only(self, employer, worker, category):
        contract = make_funded_contract(employer, worker, category)
        sub = cs.submit_deliverable(contract, worker, notes="تم")
        cs.accept_submission(sub, employer)
        conv = contract.conversations.first()
        assert conv.status == Conversation.Status.ACTIVE  # still open during warranty
        Contract.objects.filter(pk=contract.pk).update(warranty_ends_at=timezone.now() - timedelta(days=1))
        from apps.contracts.tasks import release_due_warranties
        release_due_warranties()
        conv.refresh_from_db()
        assert conv.status == Conversation.Status.READ_ONLY  # BR-10

    def test_cannot_send_to_read_only(self, employer, worker, category):
        contract = make_funded_contract(employer, worker, category)
        conv = contract.conversations.first()
        chat.set_read_only(conv)
        with pytest.raises(ValidationError):
            chat.send_message(conv, employer, body="late")

    def test_idle_locker_skips_contract_conversations(self, employer, worker, category):
        contract = make_funded_contract(employer, worker, category)
        conv = contract.conversations.first()
        Conversation.objects.filter(pk=conv.pk).update(last_message_at=timezone.now() - timedelta(days=999))
        assert lock_idle_conversations() == 0  # contract convs only lock at warranty end
        conv.refresh_from_db()
        assert conv.status == Conversation.Status.ACTIVE


# ------------------------------------------------------------------ unread-email checker (AC-6)
@pytest.mark.django_db
class TestUnreadEmail:
    def test_email_once_after_delay(self, employer, worker, category):
        conv = conv_for(employer, worker, category)
        chat.send_message(conv, employer, body="رسالة")
        mail.outbox.clear()
        # not yet past the 10-min delay
        assert send_unread_chat_emails() == 0
        Message.objects.update(created_at=timezone.now() - timedelta(minutes=15))
        assert send_unread_chat_emails() == 1
        assert len(mail.outbox) == 1
        assert send_unread_chat_emails() == 0  # fires exactly once (AC-6)

    def test_no_email_if_read_in_time(self, employer, worker, category):
        conv = conv_for(employer, worker, category)
        chat.send_message(conv, employer, body="رسالة")
        chat.mark_read(conv, worker)  # read within the window
        Message.objects.update(created_at=timezone.now() - timedelta(minutes=15))
        mail.outbox.clear()
        assert send_unread_chat_emails() == 0
        assert len(mail.outbox) == 0


# ------------------------------------------------------------------ API smoke
@pytest.mark.django_db
class TestChatAPI:
    def test_send_and_list_over_api(self, employer, worker, category):
        contract = make_funded_contract(employer, worker, category)
        conv = contract.conversations.first()
        eclient, wclient = APIClient(), APIClient()
        eclient.force_authenticate(employer)
        wclient.force_authenticate(worker)
        res = eclient.post(f"/api/v1/conversations/{conv.pk}/messages", {"body": "مرحبًا"}, format="json")
        assert res.status_code == 201
        listing = wclient.get(f"/api/v1/conversations/{conv.pk}/messages")
        assert listing.status_code == 200
        assert len(listing.json()["messages"]) == 1
        # listing marks read
        assert wclient.get("/api/v1/me/conversations").json()["results"][0]["unread"] == 0

    def test_start_conversation_requires_contract_id(self, employer, worker, category):
        client = APIClient()
        client.force_authenticate(employer)
        res = client.post("/api/v1/conversations", {}, format="json")
        assert res.status_code == 400
        assert res.json()["code"] == "contract_required"

    def test_notifications_endpoint(self, employer, worker, category):
        conv = conv_for(employer, worker, category)
        chat.send_message(conv, employer, body="hi")
        client = APIClient()
        client.force_authenticate(worker)
        assert client.get("/api/v1/me/notifications/unread-count").json()["unread"] >= 1
        client.post("/api/v1/me/notifications/read-all", format="json")
        assert client.get("/api/v1/me/notifications/unread-count").json()["unread"] == 0
