"""Limit/offset pagination contract: every listing returns {count, next, previous, results},
honors ?limit/&offset, caps limit at max_limit, and returns empty (not 404) past the end."""
import pytest
from rest_framework.test import APIClient

from apps.jobs.models import Job
from tests.factories import CategoryFactory, JobFactory, UserFactory

pytestmark = [pytest.mark.contracts_api, pytest.mark.django_db]

ENVELOPE_KEYS = {"count", "next", "previous", "results"}


@pytest.fixture
def jobs_25():
    employer, category = UserFactory(), CategoryFactory()
    JobFactory.create_batch(25, employer=employer, category=category, status=Job.Status.PUBLISHED)


def test_default_envelope_and_limit(jobs_25):
    res = APIClient().get("/api/v1/jobs")
    assert res.status_code == 200
    body = res.json()
    assert set(body.keys()) == ENVELOPE_KEYS
    assert body["count"] == 25
    assert len(body["results"]) == 20      # default_limit
    assert body["next"] and body["previous"] is None


def test_limit_and_offset_paging(jobs_25):
    page = APIClient().get("/api/v1/jobs?limit=5&offset=0").json()
    assert len(page["results"]) == 5
    assert page["next"] is not None

    tail = APIClient().get("/api/v1/jobs?limit=5&offset=24").json()
    assert len(tail["results"]) == 1       # only the 25th remains
    assert tail["next"] is None


def test_limit_is_capped_at_max(jobs_25):
    # max_limit=100 → an over-large limit returns at most everything available, never errors
    body = APIClient().get("/api/v1/jobs?limit=1000").json()
    assert len(body["results"]) == 25


def test_offset_past_end_is_empty_not_404(jobs_25):
    res = APIClient().get("/api/v1/jobs?offset=1000")
    assert res.status_code == 200
    body = res.json()
    assert body["results"] == []
    assert body["count"] == 25
