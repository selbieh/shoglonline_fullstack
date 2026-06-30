"""`dedupe_skills` management command — collapses the duplicate Skill rows the
legacy import leaves behind (same name_ar under several WP term_ids, slug kept
unique by a term-id suffix).

The contract under test: keep the most-referenced row and reassign EVERY
reference (worker skills, job skill tags) onto the keeper before deleting the
losers — dropping, not repointing, rows that would collide with the keeper's
own UNIQUE(parent, skill) link.
"""
import pytest
from django.core.management import call_command

from apps.catalog.models import Skill
from apps.profiles.models import WorkerSkill
from tests.factories import JobFactory, SkillFactory, WorkerProfileFactory

pytestmark = pytest.mark.django_db


def _skill(name, slug):
    return SkillFactory(name_ar=name, slug=slug)


def test_apply_keeps_most_referenced_and_reassigns_all_refs():
    name = "3D Design"
    busy = _skill(name, "3d-design")           # 2 refs -> keeper
    dupe = _skill(name, "3d-design-884")        # 1 ref

    wp = WorkerProfileFactory()
    WorkerSkill.objects.create(profile=wp, skill=busy)
    job_keep = JobFactory()
    job_keep.skills.add(busy)

    job_move = JobFactory()
    job_move.skills.add(dupe)

    call_command("dedupe_skills", apply=True)

    assert Skill.objects.filter(id=busy.id).exists()
    assert not Skill.objects.filter(id=dupe.id).exists()
    # The loser's job tag now points at the keeper — nothing orphaned.
    assert list(job_move.skills.values_list("id", flat=True)) == [busy.id]
    # Keeper's clean slug is preserved (not the suffixed one).
    busy.refresh_from_db()
    assert busy.slug == "3d-design"


def test_collision_rows_are_dropped_not_repointed():
    name = "Figma"
    keeper = _skill(name, "figma")
    loser = _skill(name, "figma-915")

    # A worker who already has BOTH skills, and a job tagged with BOTH — repointing
    # the loser would violate UNIQUE(profile/job, skill); the loser rows must drop.
    wp = WorkerProfileFactory()
    WorkerSkill.objects.create(profile=wp, skill=keeper)
    WorkerSkill.objects.create(profile=wp, skill=loser)
    job = JobFactory()
    job.skills.add(keeper, loser)

    call_command("dedupe_skills", apply=True)

    assert not Skill.objects.filter(id=loser.id).exists()
    # Exactly one link survives per parent (no duplicate, no IntegrityError).
    assert WorkerSkill.objects.filter(profile=wp).count() == 1
    assert WorkerSkill.objects.get(profile=wp).skill_id == keeper.id
    assert list(job.skills.values_list("id", flat=True)) == [keeper.id]


def test_dry_run_writes_nothing():
    name = "Adobe Photoshop"
    keeper = _skill(name, "adobe-photoshop")
    dupe = _skill(name, "adobe-photoshop-896")
    job = JobFactory()
    job.skills.add(dupe)

    call_command("dedupe_skills")  # no --apply

    assert Skill.objects.filter(id__in=[keeper.id, dupe.id]).count() == 2
    assert list(job.skills.values_list("id", flat=True)) == [dupe.id]


def test_no_duplicates_is_a_noop():
    a = _skill("Blender", "blender")
    b = _skill("Webflow", "webflow")
    call_command("dedupe_skills", apply=True)
    assert Skill.objects.filter(id__in=[a.id, b.id]).count() == 2


def test_normalize_folds_arabic_spelling_variants():
    # Same word, alef-hamza vs bare alef — only collapsed under --normalize.
    a = _skill("إدخال البيانات", "data-entry")
    b = _skill("ادخال البيانات", "data-entry-2")

    call_command("dedupe_skills", apply=True)  # exact match: both survive
    assert Skill.objects.filter(id__in=[a.id, b.id]).count() == 2

    call_command("dedupe_skills", normalize=True, apply=True)
    assert Skill.objects.filter(id__in=[a.id, b.id]).count() == 1
