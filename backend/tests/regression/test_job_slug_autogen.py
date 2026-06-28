"""Regression: a Job must never persist with an empty slug.

`Job.slug` is unique=True with blank=True. Jobs created outside the API's
submit_for_publication path — via the Django admin (slug is readonly there), a management
command, or the small race window between the serializer INSERT and the slug-assigning save —
were stored with slug="". Because the column is unique, the *first* blank-slug row then
collided with every subsequent blank-slug INSERT, raising IntegrityError → 500. Worse, while
one blank-slug row existed it bricked *all* API job posting (the serializer inserts slug="" too).

Fixed by generating a unique slug in Job.save() whenever slug is blank, so no code path can
persist an empty slug. (FR-JOB-1)
"""
import pytest

from apps.jobs.models import Job
from tests.factories import CategoryFactory, UserFactory

pytestmark = [pytest.mark.regression, pytest.mark.django_db, pytest.mark.srs("FR-JOB-1")]


def _slugless(title="وظيفة بدون slug", **kw):
    """Create a Job the way the admin / a management command does — without supplying a slug."""
    return Job.objects.create(
        employer=kw.pop("employer", None) or UserFactory(),
        title=title, description="وصف كافٍ للاختبار",
        category=kw.pop("category", None) or CategoryFactory(),
        budget_min=100, budget_max=500, status=Job.Status.PUBLISHED, **kw,
    )


def test_slugless_job_gets_a_nonempty_slug():
    job = _slugless()
    assert job.slug, "save() must auto-generate a slug when none is supplied"
    assert Job.objects.filter(slug="").count() == 0


def test_two_slugless_jobs_same_title_do_not_collide():
    cat = CategoryFactory()
    j1 = _slugless(title="نفس العنوان", category=cat)
    j2 = _slugless(title="نفس العنوان", category=cat)  # would IntegrityError before the fix
    assert j1.slug and j2.slug
    assert j1.slug != j2.slug


def test_existing_slugless_row_does_not_block_new_jobs():
    # Force a legacy blank-slug row past save() (simulating a pre-fix database) ...
    legacy = _slugless()
    Job.objects.filter(pk=legacy.pk).update(slug="")
    assert Job.objects.filter(slug="").count() == 1
    # ... a brand-new job must still be creatable (no global block).
    fresh = _slugless(title="وظيفة جديدة")
    assert fresh.slug
    assert fresh.pk != legacy.pk
