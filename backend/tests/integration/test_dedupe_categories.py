"""`dedupe_categories` management command — collapses the duplicate Category rows
the legacy import leaves behind (same name_ar across three WP taxonomies).

The contract under test: keep the row with the most complete subtree, and
reassign EVERY reference (services, jobs, worker profiles, child categories)
onto the keeper before deleting the losers, so nothing is orphaned.
"""
import pytest
from django.core.management import call_command

from apps.catalog.models import Category
from apps.jobs.models import Job
from tests.factories import (
    CategoryFactory,
    JobFactory,
    ServiceFactory,
    WorkerProfileFactory,
)

pytestmark = pytest.mark.django_db


def _cat(name, slug, parent=None):
    return CategoryFactory(name_ar=name, slug=slug, parent=parent)


def test_apply_keeps_complete_tree_and_reassigns_all_refs():
    name = "البرمجة وتكنولوجيا المعلومات"
    # service_categories copy: the only one with a subtree -> the keeper.
    keeper = _cat(name, "prog-services")
    child_a = _cat("تطوير الويب", "prog-web", parent=keeper)
    child_b = _cat("تطبيقات الموبايل", "prog-mobile", parent=keeper)
    svc = ServiceFactory(category=keeper)

    # wt-specialization copy: leaf, but holds the worker main_category links.
    spec = _cat(name, "prog-spec")
    wp = WorkerProfileFactory(main_category=spec)

    # project_cat copy: leaf, holds the jobs.
    proj = _cat(name, "prog-projects")
    job = JobFactory(category=proj)

    call_command("dedupe_categories", apply=True)

    # Losers gone, keeper (the complete tree) stays.
    assert Category.objects.filter(id=keeper.id).exists()
    assert not Category.objects.filter(id__in=[spec.id, proj.id]).exists()

    # Every reference now points at the keeper — nothing nulled, nothing orphaned.
    svc.refresh_from_db()
    wp.refresh_from_db()
    job.refresh_from_db()
    assert svc.category_id == keeper.id
    assert wp.main_category_id == keeper.id
    assert job.category_id == keeper.id

    # The keeper's own subtree is intact.
    assert set(keeper.children.values_list("id", flat=True)) == {child_a.id, child_b.id}


def test_two_complete_trees_keeps_the_larger_and_reparents_children():
    name = "الوسائط المتعددة"
    big = _cat(name, "media-big")          # subtree of 2
    big_c1 = _cat("تصميم الفيديو", "media-big-video", parent=big)
    _cat("صوتيات", "media-big-audio", parent=big)

    small = _cat(name, "media-small")      # subtree of 1 -> loser
    moved = _cat("تصوير", "media-small-photo", parent=small)

    call_command("dedupe_categories", apply=True)

    assert Category.objects.filter(id=big.id).exists()
    assert not Category.objects.filter(id=small.id).exists()
    # small's unique child is reparented onto the keeper (not cascade-deleted).
    moved.refresh_from_db()
    assert moved.parent_id == big.id
    assert big.children.filter(id__in=[big_c1.id, moved.id]).count() == 2


def test_leaf_group_keeps_most_referenced_row():
    name = "إدخال البيانات"
    seed_leaf = _cat(name, "data-entry-seed")          # 0 refs
    busy = _cat(name, "data-entry-busy")               # 2 refs -> keeper
    light = _cat(name, "data-entry-light")             # 1 ref
    WorkerProfileFactory(main_category=busy)
    ServiceFactory(category=busy)
    JobFactory(category=light)

    call_command("dedupe_categories", apply=True)

    assert Category.objects.filter(id=busy.id).exists()
    assert not Category.objects.filter(id__in=[seed_leaf.id, light.id]).exists()
    assert Job.objects.get(category=busy)  # light's job moved onto the keeper


def test_dry_run_writes_nothing():
    name = "تصميم وإبداع"
    keeper = _cat(name, "design-keeper")
    _cat("شعارات", "design-child", parent=keeper)
    dupe = _cat(name, "design-dupe")
    wp = WorkerProfileFactory(main_category=dupe)

    call_command("dedupe_categories")  # no --apply

    # Both rows still present, reference untouched.
    assert Category.objects.filter(id__in=[keeper.id, dupe.id]).count() == 2
    wp.refresh_from_db()
    assert wp.main_category_id == dupe.id


def test_no_duplicates_is_a_noop():
    a = _cat("استشارات", "consult-a")
    b = _cat("ترجمة", "translate-b")
    call_command("dedupe_categories", apply=True)
    assert Category.objects.filter(id__in=[a.id, b.id]).count() == 2
