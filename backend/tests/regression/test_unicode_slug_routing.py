"""Regression: public job detail must resolve for Arabic (unicode) slugs.

Job.slug is generated with allow_unicode=True, but the route used Django's `<slug:>` converter
whose regex is ASCII-only ([-a-zA-Z0-9_]+), so every Arabic-titled job's public page 404'd
(FR-JOB-3 / SEO). Fixed by switching the route to `<str:slug>` (as services already does)."""
import pytest
from rest_framework.test import APIClient

from apps.jobs.models import Job
from tests.factories import CategoryFactory, UserFactory

pytestmark = [pytest.mark.regression, pytest.mark.django_db, pytest.mark.srs("FR-JOB-3")]


def test_arabic_slug_job_detail_resolves():
    job = Job.objects.create(
        employer=UserFactory(), title="تصميم هوية بصرية احترافية",
        description="وصف", category=CategoryFactory(),
        budget_min=100, budget_max=200, status=Job.Status.PUBLISHED,
        slug="تصميم-هوية-بصرية",
    )
    res = APIClient().get(f"/api/v1/jobs/{job.slug}")
    assert res.status_code == 200
    assert res.json()["id"] == job.id
