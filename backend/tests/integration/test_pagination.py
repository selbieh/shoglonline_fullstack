"""Pagination contract for every public listing endpoint.

The four public lists — freelancers, services, jobs, and the works gallery — all page through the
shared limit/offset paginator (apps.core.api.pagination.StandardLimitOffsetPagination:
default_limit=20, max_limit=100). The FE listing pages ("عرض المزيد") and the `seed --bulk` filler
both depend on this envelope ({count, next, previous, results}) and on ?limit=&offset= slicing, so
this locks the behaviour in for all four endpoints at once.
"""
import pytest
from rest_framework.test import APIClient

from apps.gigs.models import Service
from apps.jobs.models import Job
from apps.profiles.models import PortfolioItem, WorkerProfile
from tests.factories import JobFactory, ServiceFactory, UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

FREELANCERS = "/api/v1/freelancers"
SERVICES = "/api/v1/services"
JOBS = "/api/v1/jobs"
GALLERY = "/api/v1/freelancers/portfolio"
ALL = [FREELANCERS, SERVICES, JOBS, GALLERY]

# A field in each endpoint's `ordering_fields` that we populate with a unique, increasing value per
# row — so limit/offset slicing has a deterministic total order (no overlap/gaps across pages).
ORDER_BY = {
    FREELANCERS: "hourly_rate",
    SERVICES: "base_price",
    JOBS: "budget_max",
    GALLERY: "views_count",
}


def _online_worker():
    user = UserFactory()
    WorkerProfileFactory(user=user, visibility=WorkerProfile.Visibility.ONLINE)
    return user


def _seed(endpoint, n):
    """Create exactly n rows the given public list will return, each with a unique sort key."""
    if endpoint == FREELANCERS:
        for i in range(n):
            user = UserFactory()
            WorkerProfileFactory(
                user=user, visibility=WorkerProfile.Visibility.ONLINE, hourly_rate=i + 1
            )
    elif endpoint == SERVICES:
        for i in range(n):
            ServiceFactory(status=Service.Status.LIVE, base_price=i + 1)
    elif endpoint == JOBS:
        for i in range(n):
            JobFactory(status=Job.Status.PUBLISHED, budget_min=1, budget_max=i + 1)
    elif endpoint == GALLERY:
        worker = _online_worker()
        PortfolioItem.objects.bulk_create(
            PortfolioItem(profile=worker.worker_profile, title=f"عمل {i}", views_count=i + 1)
            for i in range(n)
        )


@pytest.mark.parametrize("endpoint", ALL)
def test_envelope_and_default_page_size(endpoint):
    """25 rows → the default (no params) page returns the {count,next,previous,results} envelope
    with exactly default_limit=20 results, the full count, no previous, and a next link."""
    _seed(endpoint, 25)

    body = APIClient().get(endpoint).json()

    assert set(body) >= {"count", "next", "previous", "results"}
    assert body["count"] == 25
    assert len(body["results"]) == 20            # default_limit
    assert body["previous"] is None
    assert body["next"] is not None              # a second page exists


@pytest.mark.parametrize("endpoint", ALL)
def test_limit_offset_walks_every_row_once(endpoint):
    """?limit=&offset= slices a 25-row set into 10/10/5 non-overlapping pages that together cover
    the whole set, with correct next/previous boundary links — the contract the FE "عرض المزيد"
    button relies on (it re-requests with offset = items already loaded)."""
    _seed(endpoint, 25)
    client = APIClient()
    order = ORDER_BY[endpoint]

    pages = [
        client.get(f"{endpoint}?ordering={order}&limit=10&offset={off}").json()
        for off in (0, 10, 20)
    ]

    assert [len(p["results"]) for p in pages] == [10, 10, 5]
    assert pages[0]["previous"] is None and pages[0]["next"] is not None    # first page
    assert pages[-1]["next"] is None and pages[-1]["previous"] is not None  # last page
    assert all(p["count"] == 25 for p in pages)                            # count is the total

    ids = [row["id"] for p in pages for row in p["results"]]
    assert len(ids) == len(set(ids)) == 25       # every row seen exactly once, none repeated


def test_max_limit_caps_one_huge_request():
    """A limit above max_limit (100) is capped at 100 rows even when more exist; count stays the
    true total and a next link still points past the cap. Run on the cheapest endpoint to build
    (one worker + bulk portfolio rows)."""
    worker = _online_worker()
    PortfolioItem.objects.bulk_create(
        PortfolioItem(profile=worker.worker_profile, title=f"عمل {i}") for i in range(101)
    )

    body = APIClient().get(f"{GALLERY}?limit=1000").json()

    assert body["count"] == 101
    assert len(body["results"]) == 100           # max_limit cap, not 101
    assert body["next"] is not None              # the 101st row is on the next page
