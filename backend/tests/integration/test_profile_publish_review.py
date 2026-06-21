"""Profile publish review (rule D-1) — publishing requires ADMIN approval.

A worker submits at ≥70% completeness → PENDING_REVIEW; an admin approves (→ PUBLISHED) or
rejects (→ REJECTED + a required reason). The admin sees the completeness % (admin UI).
"""
import pytest

from apps.profiles.models import Education, Employment, WorkerProfile
from apps.profiles.services import review_profile_publish

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

PUBLISH = "/api/v1/me/profile/publish"


def _complete_profile(user) -> WorkerProfile:
    """Build a ≥70%-complete profile (6/8 of the completeness checks = 75%)."""
    profile, _ = WorkerProfile.objects.get_or_create(user=user)
    profile.bio_title = "مطوّر برمجيات"
    profile.overview = "نبذة كافية عن الخبرة والمشاريع"
    profile.expertise_level = WorkerProfile.ExpertiseLevel.EXPERT
    profile.hourly_rate = 20
    profile.save()
    Education.objects.create(profile=profile, school="جامعة")
    Employment.objects.create(profile=profile, company="شركة", job_title="مطوّر")
    return profile


def test_publish_below_threshold_is_rejected(as_user, worker):
    res = as_user(worker).post(PUBLISH, format="json")
    assert res.status_code == 400
    assert res.json()["code"] == "profile_incomplete"
    assert "completeness_pct" in res.json()


def test_publish_complete_goes_to_pending_review(as_user, worker):
    _complete_profile(worker)
    res = as_user(worker).post(PUBLISH, format="json")
    assert res.status_code == 200
    profile = WorkerProfile.objects.get(user=worker)
    # NOT published yet — waits for admin approval (rule D-1).
    assert profile.publish_state == WorkerProfile.PublishState.PENDING_REVIEW


def test_admin_approve_publishes(worker, staff):
    profile = _complete_profile(worker)
    profile.publish_state = WorkerProfile.PublishState.PENDING_REVIEW
    profile.save(update_fields=["publish_state"])

    review_profile_publish(profile, approve=True, reviewer=staff)

    profile.refresh_from_db()
    assert profile.publish_state == WorkerProfile.PublishState.PUBLISHED
    assert profile.publish_reviewed_by_id == staff.id


def test_admin_reject_requires_reason(worker, staff):
    profile = _complete_profile(worker)
    from rest_framework.exceptions import ValidationError

    with pytest.raises(ValidationError):
        review_profile_publish(profile, approve=False, reviewer=staff, reason="")


def test_admin_reject_sets_reason_and_state(worker, staff):
    profile = _complete_profile(worker)

    review_profile_publish(profile, approve=False, reviewer=staff, reason="نقص في معلومات الخبرة")

    profile.refresh_from_db()
    assert profile.publish_state == WorkerProfile.PublishState.REJECTED
    assert profile.publish_reject_reason == "نقص في معلومات الخبرة"
