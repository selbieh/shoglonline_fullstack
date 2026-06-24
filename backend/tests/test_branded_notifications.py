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
        assert "logo.png" in html                         # brand logo
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
