"""Repost & rehire (FR-JOB-11/12): public/private/specific repost links source_job; rehire
pre-fills a private invited job from a prior completed engagement (no bid); strangers can't be rehired."""
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.contracts.models import Contract
from apps.core.services import set_setting
from apps.jobs import services as job_svc
from apps.jobs.models import Invitation, Job, Proposal
from tests.factories import JobFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_repost_public_links_source():
    employer = UserFactory()
    source = JobFactory(employer=employer, status=Job.Status.CLOSED)
    resp = auth(employer).post(f"/api/v1/me/jobs/{source.pk}/repost",
                               {"visibility": "public", "title": "إعادة نشر"}, format="json")
    assert resp.status_code == 201
    new = Job.objects.exclude(pk=source.pk).get(source_job=source)
    assert new.is_private is False
    assert new.title == "إعادة نشر"
    assert new.category_id == source.category_id  # copied


def test_repost_private_to_specific_worker_creates_invitation():
    employer, worker = UserFactory(), UserFactory()
    source = JobFactory(employer=employer)
    resp = auth(employer).post(f"/api/v1/me/jobs/{source.pk}/repost",
                               {"visibility": "specific", "worker_id": worker.id}, format="json")
    assert resp.status_code == 201
    new = Job.objects.exclude(pk=source.pk).get(source_job=source)
    assert new.is_private is True and new.invited_worker_id == worker.id
    assert Invitation.objects.filter(job=new, worker=worker).exists()


def test_repost_private_reuses_source_invited_worker():
    """'Private to the same worker' — reposting a private job reuses its invited_worker."""
    employer, worker = UserFactory(), UserFactory()
    source = JobFactory(employer=employer, is_private=True, invited_worker=worker)
    resp = auth(employer).post(f"/api/v1/me/jobs/{source.pk}/repost",
                               {"visibility": "private"}, format="json")
    assert resp.status_code == 201
    new = Job.objects.exclude(pk=source.pk).get(source_job=source)
    assert new.invited_worker_id == worker.id
    assert Invitation.objects.filter(job=new, worker=worker).exists()


def test_repost_private_without_worker_is_rejected():
    employer = UserFactory()
    source = JobFactory(employer=employer)  # public source, no invited_worker
    resp = auth(employer).post(f"/api/v1/me/jobs/{source.pk}/repost",
                               {"visibility": "private"}, format="json")
    assert resp.status_code == 400
    assert resp.json()["code"] == "worker_required"


def test_repost_by_non_owner_404():
    employer, other = UserFactory(), UserFactory()
    source = JobFactory(employer=employer)
    resp = auth(other).post(f"/api/v1/me/jobs/{source.pk}/repost", {"visibility": "public"}, format="json")
    assert resp.status_code == 404


def test_private_repost_is_not_broadcast(mailoutbox):
    """A private/invited job must never fan out to category subscribers (FR-JOB-12)."""
    from apps.subscriptions.models import CategorySubscription
    employer, worker, subscriber = UserFactory(), UserFactory(), UserFactory()
    source = JobFactory(employer=employer)
    CategorySubscription.objects.create(user=subscriber, category=source.category)
    set_setting("jobs.auto_publish", True)  # would normally trigger fanout on publish
    auth(employer).post(f"/api/v1/me/jobs/{source.pk}/repost",
                        {"visibility": "specific", "worker_id": worker.id}, format="json")
    assert not any(subscriber.email in m.to for m in mailoutbox)


def _completed_contract(employer, worker):
    job = JobFactory(employer=employer, status=Job.Status.COMPLETED)
    return Contract.objects.create(
        employer=employer, worker=worker, job=job, title="عمل سابق", scope="نطاق العمل",
        budget=Decimal("100"), status=Contract.Status.COMPLETED, completed_at=timezone.now(),
    )


def test_rehire_prefills_private_invited_job_no_bid():
    employer, worker = UserFactory(), UserFactory()
    _completed_contract(employer, worker)
    set_setting("jobs.auto_publish", True)  # publish immediately so the worker can propose

    resp = auth(employer).post("/api/v1/me/rehire", {"worker_id": worker.id}, format="json")
    assert resp.status_code == 201
    new = Job.objects.filter(employer=employer, is_private=True, invited_worker=worker).latest("id")
    assert new.title == "عمل سابق"  # pre-filled from the prior contract
    assert Invitation.objects.filter(job=new, worker=worker).exists()

    # the invited worker proposes with ZERO bids → no bid is consumed (BR-7)
    proposal = job_svc.submit_proposal(worker=worker, job=new, budget=100, delivery_days=3,
                                       description="عرض", answers={})
    assert proposal.bid_consumed is False
    assert proposal.status in Proposal.OPEN_STATUSES


def test_rehire_stranger_blocked():
    employer, stranger = UserFactory(), UserFactory()
    resp = auth(employer).post("/api/v1/me/rehire", {"worker_id": stranger.id}, format="json")
    assert resp.status_code == 400
    assert resp.json()["code"] == "no_prior_engagement"
