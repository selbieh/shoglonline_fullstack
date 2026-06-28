"""Regression: hiring a specific freelancer must create a PRIVATE, invite-only job and notify
*that* worker — never a public broadcast, and never a silent invitation.

Two long-standing breaks this guards against (FR-JOB-12):
  1. The profile "توظيف المستقل" flow posted through the generic create path, which had no
     invited_worker/is_private field — so the job went out PUBLIC and the chosen worker was
     never linked to it.
  2. Every invite path (create-hire, invite_worker, repost/rehire) wired up an Invitation row
     but never sent the worker a notification — the `invitation` Kind existed yet nothing ever
     created one. The invited freelancer heard nothing.
"""
import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.bids.models import BidLedger
from apps.catalog.models import Category
from apps.core.services import set_setting
from apps.jobs import services
from apps.jobs.models import Invitation, Job
from apps.notifications.models import Notification
from apps.subscriptions.models import CategorySubscription

pytestmark = [pytest.mark.regression, pytest.mark.django_db, pytest.mark.srs("FR-JOB-12")]


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


def auth(user) -> APIClient:
    client = APIClient()
    client.force_authenticate(user)
    return client


def _post_hire(employer, category, worker, **extra):
    payload = {
        "title": "تصميم هوية بصرية",
        "description": "وصف الوظيفة بالتفصيل الكافي",
        "category": category.id,
        "budget_min": 100,
        "budget_max": 200,
        "location_type": "remote",
        "invited_worker_id": worker.id,
        **extra,
    }
    return auth(employer).post("/api/v1/me/jobs", payload, format="json")


def test_hire_creates_private_job_linked_to_the_worker(employer, category, worker):
    set_setting("jobs.auto_publish", True)
    resp = _post_hire(employer, category, worker)
    assert resp.status_code == 201
    job = Job.objects.get(pk=resp.data["id"])
    assert job.is_private is True
    assert job.invited_worker_id == worker.id
    # the request-to-propose must exist so the worker can apply without a bid (BR-7)
    assert Invitation.objects.filter(job=job, worker=worker).exists()


def test_hire_is_not_broadcast_to_category_subscribers(employer, category, worker):
    """A private hire must never fan out to the public category subscribers (the core bug)."""
    set_setting("jobs.auto_publish", True)
    subscriber = User.objects.create_user(email="sub@example.com", active_mode="find_job")
    CategorySubscription.objects.create(user=subscriber, category=category)
    mail.outbox.clear()
    _post_hire(employer, category, worker)
    assert [m.to for m in mail.outbox] == [["worker@example.com"]] or all(
        m.to != ["sub@example.com"] for m in mail.outbox
    ), "category subscribers must not receive a private hire"
    assert not Notification.objects.filter(user=subscriber).exists()


def test_invited_worker_is_notified_on_publish(employer, category, worker):
    set_setting("jobs.auto_publish", True)
    _post_hire(employer, category, worker)
    note = Notification.objects.filter(user=worker, kind=Notification.Kind.INVITATION).first()
    assert note is not None, "the invited freelancer must receive an invitation notification"
    assert note.deep_link.startswith("/jobs/")


def test_pending_review_defers_notification_until_approval(employer, category, worker):
    """When auto-publish is OFF the worker is told only once an admin approves (not while pending)."""
    set_setting("jobs.auto_publish", False)
    resp = _post_hire(employer, category, worker)
    job = Job.objects.get(pk=resp.data["id"])
    assert job.status == Job.Status.PENDING_REVIEW
    assert not Notification.objects.filter(user=worker, kind=Notification.Kind.INVITATION).exists()
    services.approve_job(job)
    assert Notification.objects.filter(user=worker, kind=Notification.Kind.INVITATION).exists()


def test_cannot_hire_yourself(employer, category):
    set_setting("jobs.auto_publish", True)
    resp = _post_hire(employer, category, employer)
    assert resp.status_code == 400  # BR-21 self-dealing


def test_invite_worker_to_existing_public_job_notifies(employer, category, worker):
    set_setting("jobs.auto_publish", True)
    job = Job.objects.create(
        employer=employer, title="وظيفة عامة", description="وصف", category=category,
        budget_min=100, budget_max=200, status=Job.Status.PUBLISHED, slug="public-job",
    )
    services.invite_worker(employer=employer, job=job, worker=worker, message="نرشّحك لهذه المهمة")
    note = Notification.objects.filter(user=worker, kind=Notification.Kind.INVITATION).first()
    assert note is not None


def test_invited_worker_sees_viewer_invited_on_job_detail(employer, category, worker):
    """The proposal form relies on viewer_invited to show 'no bid charged' to the invited worker."""
    set_setting("jobs.auto_publish", True)
    resp = _post_hire(employer, category, worker)
    slug = Job.objects.get(pk=resp.data["id"]).slug
    # the invited worker sees the flag…
    worker_view = auth(worker).get(f"/api/v1/jobs/{slug}")
    assert worker_view.status_code == 200
    assert worker_view.data["viewer_invited"] is True
    assert worker_view.data["is_private"] is True
    # …the owner (not an invitee) does not
    assert auth(employer).get(f"/api/v1/jobs/{slug}").data["viewer_invited"] is False


def test_worker_notified_when_proposal_rejected(employer, category, worker):
    set_setting("jobs.auto_publish", True)
    job = Job.objects.create(
        employer=employer, title="وظيفة", description="وصف", category=category,
        budget_min=100, budget_max=200, status=Job.Status.PUBLISHED, slug="rej-job",
    )
    proposal = services.submit_proposal(
        worker=worker, job=job, budget=150, delivery_days=7, description="عرضي", answers={},
    )
    Notification.objects.filter(user=worker).delete()  # clear any prior
    services.reject_proposal(proposal, "غير مناسب حاليًا")
    note = Notification.objects.filter(user=worker, kind=Notification.Kind.PROPOSAL).first()
    assert note is not None and "غير مناسب" in note.body
    assert note.deep_link == "/me/proposals"


def test_employer_notified_when_invitation_rejected(employer, category, worker):
    set_setting("jobs.auto_publish", True)
    _post_hire(employer, category, worker)
    invitation = Invitation.objects.get(worker=worker, employer=employer)
    Notification.objects.filter(user=employer).delete()  # ignore the proposal-side noise
    resp = auth(worker).post(f"/api/v1/invitations/{invitation.id}/reject", {"reason": "مشغول"}, format="json")
    assert resp.status_code == 200
    note = Notification.objects.filter(user=employer, kind=Notification.Kind.INVITATION).first()
    assert note is not None and "مشغول" in note.body
