"""P1-02 — the publish completeness gate must agree with what the onboarding wizard collects.

The wizard collects bio_title / overview / expertise_level / hourly_rate / skills / languages and
shows the user a % built from exactly those fields. Before the fix, completeness_pct also averaged
educations / employments — which the wizard never collects — so a user who filled every wizard field
saw "100%" yet got a 400 profile_incomplete at publish. This test pins the gate to the wizard fields.
"""
import pytest

from apps.catalog.models import Skill
from apps.profiles.models import WorkerLanguage, WorkerProfile, WorkerSkill

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

PUBLISH = "/api/v1/me/profile/publish"


def _wizard_complete_profile(user) -> WorkerProfile:
    """Fill exactly the six fields the onboarding wizard collects — nothing else."""
    profile, _ = WorkerProfile.objects.get_or_create(user=user)
    profile.bio_title = "مطوّر برمجيات"
    profile.overview = "نبذة كافية عن الخبرة والمشاريع"
    profile.expertise_level = WorkerProfile.ExpertiseLevel.EXPERT
    profile.hourly_rate = 20
    profile.save()
    skill = Skill.objects.create(name_ar="برمجة", slug="coding")
    WorkerSkill.objects.create(profile=profile, skill=skill)
    WorkerLanguage.objects.create(profile=profile, name="العربية", proficiency="native")
    return profile


def test_full_wizard_profile_passes_the_publish_gate(as_user, worker):
    """A profile with all six wizard fields filled (and no education/employment) reaches 100% and
    is accepted by the publish endpoint — the bug produced a 400 here."""
    profile = _wizard_complete_profile(worker)
    assert profile.completeness_pct == 100  # was 75% before the fix (6/8)
    assert not profile.educations.exists() and not profile.employments.exists()

    res = as_user(worker).post(PUBLISH, format="json")
    assert res.status_code == 200, res.json()


def test_below_threshold_still_blocks(as_user, worker):
    # only 4 of the 6 wizard checks (no skills, no languages) → ~66% < 70% default gate.
    profile, _ = WorkerProfile.objects.get_or_create(user=worker)
    profile.bio_title = "مطوّر"
    profile.overview = "نبذة"
    profile.expertise_level = WorkerProfile.ExpertiseLevel.EXPERT
    profile.hourly_rate = 20
    profile.save()
    assert profile.completeness_pct < 70
    res = as_user(worker).post(PUBLISH, format="json")
    assert res.status_code == 400
    assert res.json()["code"] == "profile_incomplete"
