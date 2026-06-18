"""Injection safety (SEC §16): query params (search/filter/ordering) are parameterized by the ORM —
no 500/leak; slug path-traversal 404s; stored HTML is returned as inert JSON data, not executed."""
import pytest
from rest_framework.test import APIClient

from apps.jobs.models import Job
from tests.factories import JobFactory

pytestmark = [pytest.mark.security, pytest.mark.django_db]


@pytest.mark.parametrize("payload", [
    "' OR '1'='1",
    "'; DROP TABLE jobs_job; --",
    "1) UNION SELECT password FROM auth_user --",
])
def test_sqli_in_search_is_parameterized(payload):
    JobFactory(status=Job.Status.PUBLISHED)
    res = APIClient().get("/api/v1/jobs", {"search": payload})
    assert res.status_code == 200  # no 500, no error leak
    assert Job.objects.exists()  # table intact


def test_sqli_in_ordering_is_ignored():
    JobFactory(status=Job.Status.PUBLISHED)
    res = APIClient().get("/api/v1/jobs", {"ordering": "budget_max); DROP TABLE x; --"})
    assert res.status_code in (200, 400)  # DRF OrderingFilter only allows whitelisted fields


def test_slug_path_traversal_is_not_found():
    res = APIClient().get("/api/v1/jobs/..%2f..%2f..%2fetc%2fpasswd")
    assert res.status_code == 404


def test_stored_html_is_returned_as_inert_data():
    job = JobFactory(status=Job.Status.PUBLISHED, title="<script>alert(1)</script>")
    res = APIClient().get(f"/api/v1/jobs/{job.slug}")
    assert res.status_code == 200
    assert res.headers["Content-Type"].startswith("application/json")  # JSON, not rendered HTML
    assert res.json()["title"] == "<script>alert(1)</script>"  # stored verbatim; FE escapes on render
