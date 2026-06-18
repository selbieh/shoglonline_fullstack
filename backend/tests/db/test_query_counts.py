"""N+1 guards (Part 11 step 8): hot public list endpoints must issue a BOUNDED number of queries
regardless of row count — `select_related`/`prefetch_related` keep them flat. A regression that drops
the prefetch (one query per row) blows the bound and fails here."""
import pytest
from rest_framework.test import APIClient

from apps.gigs.models import Service
from apps.jobs.models import Job
from apps.profiles.models import WorkerProfile, WorkerSkill
from tests.factories import (
    CategoryFactory,
    JobFactory,
    ServiceFactory,
    SkillFactory,
    UserFactory,
    WorkerProfileFactory,
)

pytestmark = [pytest.mark.db, pytest.mark.django_db]


def test_jobs_list_is_not_n_plus_1(django_assert_max_num_queries):
    cat = CategoryFactory()
    skills = [SkillFactory() for _ in range(3)]
    for _ in range(8):
        job = JobFactory(category=cat, status=Job.Status.PUBLISHED)
        job.skills.set(skills)  # skill_names is a SerializerMethodField → would N+1 without prefetch

    # bounded: count/results page + category + prefetched skills — NOT one query per job
    with django_assert_max_num_queries(8):
        res = APIClient().get("/api/v1/jobs")
    assert res.status_code == 200
    assert res.json()["count"] == 8


def test_services_list_is_not_n_plus_1(django_assert_max_num_queries):
    cat = CategoryFactory()
    for _ in range(8):
        ServiceFactory(category=cat, status=Service.Status.LIVE)
    with django_assert_max_num_queries(8):
        res = APIClient().get("/api/v1/services")
    assert res.status_code == 200


def test_freelancers_list_is_not_n_plus_1(django_assert_max_num_queries):
    skills = [SkillFactory() for _ in range(3)]
    for _ in range(8):
        profile = WorkerProfileFactory(user=UserFactory(), visibility=WorkerProfile.Visibility.ONLINE)
        for skill in skills:
            WorkerSkill.objects.create(profile=profile, skill=skill)
    with django_assert_max_num_queries(8):
        res = APIClient().get("/api/v1/freelancers")
    assert res.status_code == 200
    assert res.json()["count"] == 8
