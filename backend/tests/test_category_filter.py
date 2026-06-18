"""Jobs list: ?category=<parent> is descendant-aware and accepts id or slug (FR-JOB-3)."""
import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.catalog.models import Category
from apps.jobs.models import Job


def _job(emp, cat, sub=None, title="job"):
    return Job.objects.create(employer=emp, title=title, slug=title, description="d", category=cat,
                              subcategory=sub, budget_min=10, budget_max=100,
                              status=Job.Status.PUBLISHED, published_at=timezone.now())


@pytest.mark.django_db
def test_parent_category_returns_child_jobs():
    emp = User.objects.create_user(email="e@e.com")
    parent = Category.objects.create(name_ar="برمجة", name_en="Dev", slug="dev")
    child = Category.objects.create(name_ar="ويب", name_en="Web", slug="web", parent=parent)
    other = Category.objects.create(name_ar="تصميم", name_en="Design", slug="design")

    _job(emp, parent, title="parent-job")
    _job(emp, child, title="child-job")              # category IS the child
    _job(emp, parent, sub=child, title="sub-tagged") # category=parent, subcategory=child
    _job(emp, other, title="other-job")              # unrelated

    c = APIClient()
    # by parent id → all three under the parent tree, not the unrelated one
    by_id = c.get(f"/api/v1/jobs?category={parent.id}").json()
    titles = {j["title"] for j in by_id["results"]}
    assert titles == {"parent-job", "child-job", "sub-tagged"}

    # by parent slug → same result (SEO-friendly)
    by_slug = c.get("/api/v1/jobs?category=dev").json()
    assert by_slug["count"] == 3

    # selecting the child returns jobs categorized OR subcategorized as that child
    by_child = c.get(f"/api/v1/jobs?category={child.id}").json()
    assert {j["title"] for j in by_child["results"]} == {"child-job", "sub-tagged"}


@pytest.mark.django_db
def test_unknown_category_returns_empty():
    c = APIClient()
    assert c.get("/api/v1/jobs?category=99999").json()["count"] == 0
    assert c.get("/api/v1/jobs?category=does-not-exist").json()["count"] == 0


@pytest.mark.django_db
def test_services_category_descendant_and_slug():
    from decimal import Decimal

    from apps.gigs.models import Service
    wk = User.objects.create_user(email="wk2@e.com")
    parent = Category.objects.create(name_ar="برمجة", name_en="Dev2", slug="dev2")
    child = Category.objects.create(name_ar="ويب", name_en="Web2", slug="web2", parent=parent)

    def svc(cat, slug, sub=None):
        return Service.objects.create(worker=wk, title=slug, slug=slug, description="d", category=cat,
                                      subcategory=sub, base_price=Decimal("50"), delivery_days=3,
                                      status=Service.Status.LIVE)
    svc(parent, "p-svc")
    svc(child, "c-svc")
    svc(Category.objects.create(name_ar="x", name_en="x2", slug="other2"), "o-svc")

    c = APIClient()
    by_id = c.get(f"/api/v1/services?category={parent.id}").json()
    assert {s["title"] for s in by_id["results"]} == {"p-svc", "c-svc"}
    by_slug = c.get("/api/v1/services?category=dev2").json()
    assert by_slug["count"] == 2
