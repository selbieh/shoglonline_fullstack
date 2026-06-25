"""Jobs/proposals/invitations/watchlist over the API (FR-JOB-*). Exercises the view layer
(permissions, 201/204/400 branches) the service-level suite doesn't reach."""
import pytest
from rest_framework.test import APIClient

from apps.core.services import set_setting
from apps.jobs.models import Invitation, Job, Proposal
from tests.factories import UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture
def worker_with_bids():
    from apps.bids.models import BidLedger
    u = UserFactory()
    BidLedger.objects.create(user=u, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)
    return u


@pytest.fixture(autouse=True)
def _auto_publish():
    set_setting("jobs.auto_publish", True)
    set_setting("proposals.auto_publish", True)


def _create_job(employer, category, **over):
    payload = {
        "title": "تصميم هوية بصرية",
        "description": "وصف تفصيلي للوظيفة المطلوبة",
        "category": category.pk,
        "budget_min": "100",
        "budget_max": "200",
        **over,
    }
    res = auth(employer).post("/api/v1/me/jobs", payload, format="json")
    assert res.status_code == 201, res.content
    return res.json()


def test_create_then_public_detail_and_listing(employer, category):
    job = _create_job(employer, category)
    assert job["status"] == Job.Status.PUBLISHED

    # public detail by slug (anon)
    detail = APIClient().get(f"/api/v1/jobs/{job['slug']}")
    assert detail.status_code == 200
    assert detail.json()["id"] == job["id"]

    # owner listing
    mine = auth(employer).get("/api/v1/me/jobs")
    assert mine.json()["count"] == 1


def test_public_budget_filters(employer, category):
    _create_job(employer, category, budget_min="100", budget_max="200")
    _create_job(employer, category, budget_min="900", budget_max="1000")
    # jobs whose range overlaps [budget_min=850, budget_max=950] → only the second
    res = APIClient().get("/api/v1/jobs?budget_min=850&budget_max=950")
    assert res.status_code == 200
    assert res.json()["count"] == 1


def test_owner_can_patch_before_proposals(employer, category):
    job = _create_job(employer, category)
    res = auth(employer).patch(
        f"/api/v1/me/jobs/{job['id']}",
        {"title": "عنوان محدّث", "description": job["description"], "category": category.pk,
         "budget_min": "100", "budget_max": "200"},
        format="json",
    )
    assert res.status_code == 200
    assert res.json()["title"] == "عنوان محدّث"


def test_employer_lists_rates_and_rejects_proposal(employer, category, worker_with_bids):
    job = _create_job(employer, category)
    sub = auth(worker_with_bids).post(
        f"/api/v1/jobs/{job['id']}/proposals",
        {"budget": "150", "delivery_days": 10, "description": "خطتي"}, format="json",
    )
    assert sub.status_code == 201
    pid = sub.json()["id"]

    listing = auth(employer).get(f"/api/v1/me/jobs/{job['id']}/proposals")
    assert listing.status_code == 200 and listing.json()["count"] == 1

    # private rating 1–5 (BR-8)
    assert auth(employer).post(f"/api/v1/proposals/{pid}/rate", {"rating": 4}, format="json").status_code == 200
    assert auth(employer).post(f"/api/v1/proposals/{pid}/rate", {"rating": 9}, format="json").status_code == 400

    # reject requires a reason (FR-JOB-9)
    assert auth(employer).post(f"/api/v1/proposals/{pid}/reject", {}, format="json").status_code == 400
    ok = auth(employer).post(f"/api/v1/proposals/{pid}/reject", {"reason": "غير مناسب"}, format="json")
    assert ok.status_code == 200
    assert Proposal.objects.get(pk=pid).status == Proposal.Status.REJECTED


def test_worker_cancels_own_proposal(employer, category, worker_with_bids):
    job = _create_job(employer, category)
    pid = auth(worker_with_bids).post(
        f"/api/v1/jobs/{job['id']}/proposals",
        {"budget": "150", "delivery_days": 10, "description": "x"}, format="json",
    ).json()["id"]
    res = auth(worker_with_bids).post(f"/api/v1/proposals/{pid}/cancel", format="json")
    assert res.status_code == 200
    assert Proposal.objects.get(pk=pid).status == Proposal.Status.CANCELLED


def test_accept_proposal_creates_contract(employer, category, worker_with_bids, fund_wallet):
    fund_wallet(employer, "500")  # so the contract funds immediately
    job = _create_job(employer, category)
    pid = auth(worker_with_bids).post(
        f"/api/v1/jobs/{job['id']}/proposals",
        {"budget": "150", "delivery_days": 10, "description": "x"}, format="json",
    ).json()["id"]
    res = auth(employer).post(f"/api/v1/proposals/{pid}/accept", format="json")
    assert res.status_code == 200
    assert res.json()["contract"]["status"] == "active"


def test_invitations_flow(employer, category, worker_with_bids):
    job = _create_job(employer, category)
    inv = auth(employer).post(
        f"/api/v1/me/jobs/{job['id']}/invitations",
        {"worker_id": worker_with_bids.pk, "message": "ندعوك للتقديم"}, format="json",
    )
    assert inv.status_code == 201

    mine = auth(worker_with_bids).get("/api/v1/me/invitations")
    assert mine.json()["results"][0]["status"] == Invitation.Status.SENT
    assert mine.json()["results"][0]["worker_name"]  # recipient surfaced for both sides

    # the employer can see the invitation they SENT (mirrors gigs sent/received split)
    sent = auth(employer).get("/api/v1/me/sent-invitations")
    assert sent.status_code == 200
    rows = sent.json()["results"]
    assert len(rows) == 1 and rows[0]["status"] == Invitation.Status.SENT
    # a worker must not see another user's sent invitations
    assert auth(worker_with_bids).get("/api/v1/me/sent-invitations").json()["results"] == []

    inv_id = Invitation.objects.get(job_id=job["id"]).pk
    rej = auth(worker_with_bids).post(f"/api/v1/invitations/{inv_id}/reject", {"reason": "مشغول"}, format="json")
    assert rej.status_code == 200
    assert Invitation.objects.get(pk=inv_id).status == Invitation.Status.REJECTED


def test_watchlist_put_get_delete(employer, category, worker_with_bids):
    job = _create_job(employer, category)
    jid = job["id"]
    assert auth(worker_with_bids).put(f"/api/v1/me/watchlist/{jid}").status_code == 204
    listing = auth(worker_with_bids).get("/api/v1/me/watchlist")
    assert listing.status_code == 200 and len(listing.json()) == 1
    assert auth(worker_with_bids).delete(f"/api/v1/me/watchlist/{jid}").status_code == 204
    assert len(auth(worker_with_bids).get("/api/v1/me/watchlist").json()) == 0


def test_close_job_endpoint(employer, category):
    job = _create_job(employer, category)
    res = auth(employer).post(f"/api/v1/me/jobs/{job['id']}/close", format="json")
    assert res.status_code == 200
    assert Job.objects.get(pk=job["id"]).status == Job.Status.CLOSED


def test_my_proposals_listing(worker_with_bids, employer, category):
    job = _create_job(employer, category)
    auth(worker_with_bids).post(
        f"/api/v1/jobs/{job['id']}/proposals",
        {"budget": "150", "delivery_days": 10, "description": "x"}, format="json",
    )
    res = auth(worker_with_bids).get("/api/v1/me/proposals")
    assert res.status_code == 200 and res.json()["count"] == 1
