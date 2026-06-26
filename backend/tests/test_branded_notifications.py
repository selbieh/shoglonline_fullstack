"""Every user-facing email is the shared branded, RTL HTML template (logo + brand colors + a
CTA linking straight to the item), and the important domain events each fan out an in-app
notification *and* an email. Guards the two assertions in the email/notification rollout."""
from decimal import Decimal

import pytest
from django.core import mail
from django.utils import timezone

from apps.contracts import services as cs
from apps.jobs import services as js
from apps.jobs.models import Job, Proposal
from apps.notifications.models import Notification
from apps.notifications.services import notify
from apps.payments import services as pay
from apps.payments.models import Transaction
from apps.reviews import services as rv


def _html_of(message):
    """Return the text/html alternative attached to an EmailMultiAlternatives, or ''."""
    for content, mimetype in getattr(message, "alternatives", []):
        if mimetype == "text/html":
            return content
    return ""


@pytest.mark.django_db
class TestBrandedEmail:
    def test_notify_sends_branded_html_with_logo_and_item_cta(self, employer):
        notify(employer, kind=Notification.Kind.CONTRACT, title="تم نشر ملفك الشخصي",
               body="أصبح ملفك مرئيًا الآن.", deep_link="/me/profile")
        assert len(mail.outbox) == 1
        msg = mail.outbox[0]
        html = _html_of(msg)
        assert html, "email must carry an HTML alternative"
        assert 'dir="rtl"' in html                       # matches the site's RTL Arabic
        assert "logo-email-white.png" in html             # white brand logo (visible on blue header)
        assert "#2b50c9" in html or "#1f3da6" in html     # brand CTA blue (globals.css tokens)
        assert "/me/profile" in html                      # CTA links to the item
        assert "تم نشر ملفك الشخصي" in html               # the title is rendered
        assert "/settings" in html                        # manage-preferences footer link

    def test_email_respects_kill_switch(self, employer):
        from apps.core.services import set_setting
        set_setting("emails.enabled", False)
        note = notify(employer, kind=Notification.Kind.CONTRACT, title="x", body="y",
                      deep_link="/contracts/1")
        assert note is not None and Notification.objects.filter(pk=note.pk).exists()  # in-app still written
        assert len(mail.outbox) == 0                                                  # but no email


@pytest.mark.django_db
class TestEventCoverage:
    def test_new_proposal_notifies_and_emails_the_employer(self, employer, worker, category):
        job = Job.objects.create(employer=employer, title="مهمة", description="وصف", category=category,
                                 budget_min=10, budget_max=500, status=Job.Status.PUBLISHED,
                                 published_at=timezone.now())
        mail.outbox.clear()
        js.submit_proposal(worker=worker, job=job, budget=Decimal("100"),
                           delivery_days=7, description="عرض", answers={})
        note = Notification.objects.filter(user=employer, kind=Notification.Kind.PROPOSAL).first()
        assert note is not None and f"/jobs/{job.slug}" == note.deep_link
        assert any(employer.email in m.to for m in mail.outbox)

    def test_received_review_notifies_and_emails_the_subject(self, employer, worker, category):
        job = Job.objects.create(employer=employer, title="مهمة", description="وصف", category=category,
                                 budget_min=10, budget_max=500, status=Job.Status.PUBLISHED,
                                 published_at=timezone.now())
        proposal = js.submit_proposal(worker=worker, job=job, budget=Decimal("100"),
                                      delivery_days=7, description="عرض", answers={})
        pay.post(pay.get_wallet(employer), type=Transaction.Type.DEPOSIT,
                 bucket=Transaction.Bucket.AVAILABLE, amount=Decimal("150"), note="seed")
        contract = js.accept_proposal(proposal)
        sub = cs.submit_deliverable(contract, worker, notes="done")
        cs.accept_submission(sub, employer)
        contract.refresh_from_db()

        mail.outbox.clear()
        rv.leave_review(contract, employer, rating=5, comment="ممتاز")  # worker is the subject
        note = (Notification.objects.filter(user=worker, kind=Notification.Kind.CONTRACT)
                .order_by("-created_at").first())
        assert note is not None and note.deep_link == f"/contracts/{contract.pk}"
        assert any(worker.email in m.to for m in mail.outbox)

    def test_welcome_email_on_signup_only_for_new_users(self, monkeypatch):
        from apps.accounts import services as acc
        payload = {"sub": "g-123", "email": "newcomer@example.com",
                   "given_name": "سارة", "family_name": "", "picture": ""}
        monkeypatch.setattr(acc, "verify_google_token", lambda _t: payload)

        user, created = acc.authenticate_google_user("tok")
        assert created
        assert Notification.objects.filter(user=user, kind=Notification.Kind.ADMIN).exists()
        assert any(user.email in m.to for m in mail.outbox)

        mail.outbox.clear()
        _user2, created2 = acc.authenticate_google_user("tok")  # second login
        assert created2 is False and len(mail.outbox) == 0  # no repeat welcome

    def test_deposit_confirmation_notifies_and_emails(self, employer):
        wallet = pay.get_wallet(employer)
        tx = pay.post(wallet, type=Transaction.Type.DEPOSIT, bucket=Transaction.Bucket.AVAILABLE,
                      amount=Decimal("100"), gateway="paypal", status=Transaction.Status.PENDING)
        mail.outbox.clear()
        pay.settle_pending(tx, succeeded=True)
        assert Notification.objects.filter(user=employer, kind=Notification.Kind.PAYMENT).exists()
        assert any(employer.email in m.to for m in mail.outbox)

    def test_buying_request_notifies_and_emails_the_service_owner(self, worker, employer, category):
        from apps.core.services import set_setting
        from apps.gigs import services as gs
        from apps.gigs.models import Service
        set_setting("services.auto_publish", True)  # submit_service only auto-publishes when this is on
        service = Service.objects.create(worker=worker, title="تصميم شعار", description="وصف",
                                         category=category, base_price=Decimal("100"), delivery_days=5)
        gs.submit_service(service)  # → LIVE (mirrors the gigs test helper)
        mail.outbox.clear()
        gs.request_service(employer=employer, service=service)
        note = Notification.objects.filter(user=worker, kind=Notification.Kind.CONTRACT).first()
        assert note is not None and note.deep_link == "/me/services"
        assert any(worker.email in m.to for m in mail.outbox)
