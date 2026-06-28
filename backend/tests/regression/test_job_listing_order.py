"""Regression: the public job board must order newest-first deterministically.

The frontend always requests ``/jobs?ordering=-published_at``. DRF's plain ``OrderingFilter``
runs ``queryset.order_by('-published_at')``, which *replaces* the model's
``Meta.ordering = ['-published_at', '-created_at']`` — dropping the tiebreaker. When several jobs
share the same ``published_at`` (a bulk admin-approval, a seed import, or just same-instant
publishes), the database returns the tied rows in an arbitrary order: "newest" looks wrong and,
because limit/offset re-evaluates the order per page, rows shuffle between pages so "load more"
duplicates and skips items.

Fixed by StableOrderingFilter, which appends a primary-key tiebreaker to every applied ordering,
giving a total, stable order. (FR-JOB-3)
"""
import pytest
from rest_framework.test import APIClient

from apps.jobs.models import Job
from tests.factories import CategoryFactory, UserFactory

pytestmark = [pytest.mark.regression, pytest.mark.django_db, pytest.mark.srs("FR-JOB-3")]


def _published(slug, published_at, **kw):
    return Job.objects.create(
        employer=kw.pop("employer", None) or UserFactory(),
        title=kw.pop("title", f"job {slug}"), slug=slug, description="وصف كافٍ للاختبار",
        category=kw.pop("category", None) or CategoryFactory(),
        budget_min=100, budget_max=500, status=Job.Status.PUBLISHED,
        is_private=False, published_at=published_at, **kw,
    )


def test_jobs_tied_on_published_at_are_ordered_by_pk_desc():
    from django.utils import timezone

    ts = timezone.now()
    # three jobs sharing the EXACT same published_at — ties before the fix were arbitrary
    a = _published("tie-a", ts)
    b = _published("tie-b", ts)
    c = _published("tie-c", ts)

    resp = APIClient().get("/api/v1/jobs", {"ordering": "-published_at"})
    assert resp.status_code == 200
    ids = [row["id"] for row in resp.data["results"]]
    # newest-pk-first is the deterministic, expected order for equal timestamps
    assert ids == [c.id, b.id, a.id]


def test_paginated_jobs_tied_on_published_at_do_not_overlap():
    from django.utils import timezone

    ts = timezone.now()
    jobs = [_published(f"page-{i:02d}", ts) for i in range(5)]

    client = APIClient()
    page1 = client.get("/api/v1/jobs", {"ordering": "-published_at", "limit": 2, "offset": 0})
    page2 = client.get("/api/v1/jobs", {"ordering": "-published_at", "limit": 2, "offset": 2})
    page3 = client.get("/api/v1/jobs", {"ordering": "-published_at", "limit": 2, "offset": 4})

    seen = [r["id"] for p in (page1, page2, page3) for r in p.data["results"]]
    # every job appears exactly once across the pages — no duplicates, no gaps
    assert sorted(seen) == sorted(j.id for j in jobs)
    assert len(seen) == len(set(seen))
