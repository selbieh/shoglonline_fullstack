"""Phase 2 business rules: bids, self-dealing, screening, moderation, expiry, fan-out."""
from datetime import timedelta

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bids.models import BidLedger
from apps.bids.services import bid_balance
from apps.catalog.models import Category
from apps.core.services import set_setting
from apps.jobs import services
from apps.jobs.models import Invitation, Job, Proposal
from apps.jobs.tasks import expire_jobs
from apps.subscriptions.models import CategorySubscription


@pytest.fixture()
def category(db):
    return Category.objects.create(name_ar="التصميم والإبداع", slug="design")


@pytest.fixture()
def employer(db):
    return User.objects.create_user(email="employer@example.com", active_mode="find_worker")


@pytest.fixture()
def worker(db):
    user = User.objects.create_user(email="worker@example.com", active_mode="find_job")
    BidLedger.objects.create(user=user, delta=5, reason=BidLedger.Reason.SIGNUP_GRANT)
    return user


def make_job(employer, category, **kwargs):
    job = Job.objects.create(
        employer=employer, title="تصميم هوية بصرية", description="وصف الوظيفة بالتفصيل",
        category=category, budget_min=100, budget_max=200, **kwargs
    )
    return services.submit_for_publication(job)


def auth(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.mark.django_db
class TestPrivateJobAccess:
    """Regression: the public job-detail endpoint must not leak invite-only (private) jobs."""

    def _private_job(self, employer, category):
        return Job.objects.create(
            employer=employer, title="مشروع خاص", description="وصف", category=category,
            budget_min=100, budget_max=200, status=Job.Status.PUBLISHED,
            published_at=timezone.now(), is_private=True, slug="private-job",
        )

    def test_anonymous_cannot_view_private_job(self, employer, category):
        job = self._private_job(employer, category)
        assert APIClient().get(f"/api/v1/jobs/{job.slug}").status_code == 404

    def test_owner_and_invited_worker_can_view(self, employer, worker, category):
        job = self._private_job(employer, category)
        assert auth(employer).get(f"/api/v1/jobs/{job.slug}").status_code == 200
        Invitation.objects.create(job=job, employer=employer, worker=worker,
                                  status=Invitation.Status.SENT)
        assert auth(worker).get(f"/api/v1/jobs/{job.slug}").status_code == 200

    def test_uninvited_worker_cannot_view_private_job(self, employer, worker, category):
        job = self._private_job(employer, category)
        assert auth(worker).get(f"/api/v1/jobs/{job.slug}").status_code == 404


@pytest.mark.django_db
class TestPublication:
    def test_auto_publish_flag(self, employer, category):
        set_setting("jobs.auto_publish", True)
        job = make_job(employer, category)
        assert job.status == Job.Status.PUBLISHED and job.expires_at  # FR-JOB-2/17
        set_setting("jobs.auto_publish", False)
        job2 = make_job(employer, category)
        assert job2.status == Job.Status.PENDING_REVIEW

    def _job(self, employer, category, *, description):
        return Job.objects.create(
            employer=employer, title="تصميم هوية بصرية", description=description,
            category=category, budget_min=100, budget_max=200,
        )

    def test_contact_info_diverts_autopublish_to_review(self, employer, category):
        """Soft gate: a post that looks like it shares contact info goes to review even when
        auto-publish is ON — but it is never hard-rejected (no failed submission)."""
        set_setting("jobs.auto_publish", True)
        job = self._job(employer, category, description="للتواصل راسلني على واتساب 0501234567")
        flagged = services.submit_for_publication(job)
        assert flagged.status == Job.Status.PENDING_REVIEW

    def test_clean_description_with_digital_word_still_autopublishes(self, employer, category):
        """Regression: 'الرقمية' (digital) must not trip the contact guard (was a false positive)."""
        set_setting("jobs.auto_publish", True)
        job = self._job(employer, category, description="تصميم شعار يصلح للمنصات الرقمية والمطبوعات")
        published = services.submit_for_publication(job)
        assert published.status == Job.Status.PUBLISHED

    def test_admin_approval_publishes_and_fans_out(self, employer, category, worker):
        set_setting("jobs.auto_publish", False)
        CategorySubscription.objects.create(user=worker, category=category)
        job = make_job(employer, category)
        mail.outbox.clear()
        services.approve_job(job)
        assert job.status == Job.Status.PUBLISHED
        assert len(mail.outbox) == 1  # FR-SUB-2 (celery eager in tests)
        assert mail.outbox[0].to == ["worker@example.com"]

    def test_fanout_skips_the_poster(self, employer, category):
        """BR-21: the employer subscribed to their own category gets no email."""
        set_setting("jobs.auto_publish", True)
        CategorySubscription.objects.create(user=employer, category=category)
        mail.outbox.clear()
        make_job(employer, category)
        assert len(mail.outbox) == 0

    def test_fanout_respects_kill_switch(self, employer, category, worker):
        set_setting("jobs.auto_publish", True)
        set_setting("emails.enabled", False)
        CategorySubscription.objects.create(user=worker, category=category)
        mail.outbox.clear()
        make_job(employer, category)
        assert len(mail.outbox) == 0
        set_setting("emails.enabled", True)


@pytest.mark.django_db
class TestProposals:
    def setup_method(self):
        set_setting("jobs.auto_publish", True)
        set_setting("proposals.auto_publish", True)

    def test_proposal_consumes_one_bid(self, employer, worker, category):
        job = make_job(employer, category)
        res = auth(worker).post(
            f"/api/v1/jobs/{job.pk}/proposals",
            {"budget": "150", "delivery_days": 10, "description": "خطة العمل"},
            format="json",
        )
        assert res.status_code == 201
        assert bid_balance(worker) == 4  # FR-BID-1

    def test_self_dealing_blocked(self, employer, category):
        job = make_job(employer, category)
        res = auth(employer).post(
            f"/api/v1/jobs/{job.pk}/proposals",
            {"budget": "150", "delivery_days": 10, "description": "x"},
            format="json",
        )
        assert res.status_code == 403  # BR-21

    def test_no_bids_blocks_submission(self, employer, category):
        broke = User.objects.create_user(email="broke@example.com")
        job = make_job(employer, category)
        res = auth(broke).post(
            f"/api/v1/jobs/{job.pk}/proposals",
            {"budget": "150", "delivery_days": 10, "description": "x"},
            format="json",
        )
        assert res.status_code == 400
        assert "insufficient_bids" in str(res.json())

    def test_required_screening_enforced(self, employer, worker, category):
        job = make_job(employer, category)
        question = job.screening_questions.create(question="كم مشروعًا أنجزت؟", is_required=True)
        res = auth(worker).post(
            f"/api/v1/jobs/{job.pk}/proposals",
            {"budget": "150", "delivery_days": 10, "description": "x", "answers": {}},
            format="json",
        )
        assert res.status_code == 400  # FR-JOB-5
        res = auth(worker).post(
            f"/api/v1/jobs/{job.pk}/proposals",
            {"budget": "150", "delivery_days": 10, "description": "x",
             "answers": {str(question.pk): "٢٣ مشروعًا"}},
            format="json",
        )
        assert res.status_code == 201

    def test_invited_proposal_is_free(self, employer, worker, category):
        job = make_job(employer, category)
        services.invite_worker(employer=employer, job=job, worker=worker)
        auth(worker).post(
            f"/api/v1/jobs/{job.pk}/proposals",
            {"budget": "150", "delivery_days": 10, "description": "x"},
            format="json",
        )
        assert bid_balance(worker) == 5  # BR-7: no bid consumed
        assert job.invitations.get().status == Invitation.Status.ACCEPTED

    def test_cancel_no_refund(self, employer, worker, category):
        job = make_job(employer, category)
        proposal = services.submit_proposal(
            worker=worker, job=job, budget=150, delivery_days=10, description="x", answers={}
        )
        services.cancel_proposal(proposal)
        assert bid_balance(worker) == 4  # BR-7: self-cancel never refunds

    def test_moderation_reject_refunds(self, employer, worker, category):
        set_setting("proposals.auto_publish", False)
        job = make_job(employer, category)
        proposal = services.submit_proposal(
            worker=worker, job=job, budget=150, delivery_days=10, description="x", answers={}
        )
        assert proposal.status == Proposal.Status.PENDING_APPROVAL
        services.moderation_reject_proposal(proposal, "مخالف")
        assert bid_balance(worker) == 5  # FR-BID-6

    def test_title_locked_after_first_proposal(self, employer, worker, category):
        job = make_job(employer, category)
        services.submit_proposal(
            worker=worker, job=job, budget=150, delivery_days=10, description="x", answers={}
        )
        res = auth(employer).patch(
            f"/api/v1/me/jobs/{job.pk}",
            {"title": "عنوان جديد", "description": job.description, "category": category.pk,
             "budget_min": "100", "budget_max": "200"},
            format="json",
        )
        assert res.status_code == 400  # BR-4

    def test_accept_awards_once(self, employer, category):
        from apps.payments import services as pay
        from apps.payments.models import Transaction

        job = make_job(employer, category)
        # Fund the employer so the contract activates and the job advances (BR-6/6a).
        pay.post(pay.get_wallet(employer), type=Transaction.Type.DEPOSIT,
                 bucket=Transaction.Bucket.AVAILABLE, amount=500, note="seed")
        workers = []
        for i in range(2):
            u = User.objects.create_user(email=f"w{i}@example.com")
            BidLedger.objects.create(user=u, delta=1, reason=BidLedger.Reason.SIGNUP_GRANT)
            workers.append(services.submit_proposal(
                worker=u, job=job, budget=150, delivery_days=10, description="x", answers={}
            ))
        from rest_framework.exceptions import ValidationError

        contract = services.accept_proposal(workers[0])
        job.refresh_from_db()
        assert contract.status == "active"  # funded immediately
        assert job.status == Job.Status.IN_PROGRESS  # BR-6: advances only once funded
        workers[1].refresh_from_db()
        assert workers[1].status == Proposal.Status.REJECTED  # sibling auto-rejected
        with pytest.raises(ValidationError):
            services.accept_proposal(workers[1])  # BR-6: one award per job


@pytest.mark.django_db
class TestCloseAndExpiry:
    def setup_method(self):
        set_setting("jobs.auto_publish", True)

    def test_close_withdraws_and_refunds(self, employer, worker, category):
        job = make_job(employer, category)
        proposal = services.submit_proposal(
            worker=worker, job=job, budget=150, delivery_days=10, description="x", answers={}
        )
        services.invite_worker(
            employer=employer, job=job,
            worker=User.objects.create_user(email="other@example.com"),
        )
        services.close_job(job)
        proposal.refresh_from_db()
        assert proposal.status == Proposal.Status.WITHDRAWN
        assert bid_balance(worker) == 5  # FR-BID-6
        assert job.invitations.get().status == Invitation.Status.EXPIRED  # BR-6a

    def test_expiry_sweeper(self, employer, worker, category):
        job = make_job(employer, category)
        services.submit_proposal(
            worker=worker, job=job, budget=150, delivery_days=10, description="x", answers={}
        )
        Job.objects.filter(pk=job.pk).update(expires_at=timezone.now() - timedelta(hours=1))
        assert expire_jobs() == 1  # FR-JOB-17
        job.refresh_from_db()
        assert job.status == Job.Status.CLOSED
        assert bid_balance(worker) == 5

    def test_auto_archive_disabled_keeps_jobs_published(self, employer, category):
        """FR-JOB-17: with jobs.enable_auto_archive OFF, publishing sets no expiry and the
        sweeper never closes a job — even one carrying a stale expires_at."""
        set_setting("jobs.enable_auto_archive", False)
        try:
            job = make_job(employer, category)
            assert job.status == Job.Status.PUBLISHED
            assert job.expires_at is None  # no expiry stamped at publish
            # a leftover past expires_at must not be swept while archiving is off
            Job.objects.filter(pk=job.pk).update(expires_at=timezone.now() - timedelta(hours=1))
            assert expire_jobs() == 0
            job.refresh_from_db()
            assert job.status == Job.Status.PUBLISHED
        finally:
            set_setting("jobs.enable_auto_archive", True)


@pytest.mark.django_db
class TestPublicListing:
    def test_only_published_public_jobs_listed(self, employer, category):
        set_setting("jobs.auto_publish", True)
        make_job(employer, category)
        set_setting("jobs.auto_publish", False)
        make_job(employer, category)  # pending_review — hidden
        res = APIClient().get("/api/v1/jobs")
        assert res.status_code == 200
        assert res.json()["count"] == 1
