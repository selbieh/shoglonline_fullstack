"""Admin-tunable worker-profile publish gate (profiles.publish_min_completeness).

Rule D-1: a worker submits the profile for publication; the gate is the configurable
`profiles.publish_min_completeness` threshold (default 70; 0 disables the gate so any profile
publishes). Whether a passing request goes live or to PENDING_REVIEW is governed separately by
`profiles.auto_publish`.
"""
from decimal import Decimal

import pytest

from apps.core.services import set_setting
from apps.profiles.models import WorkerProfile


def _profile(user, *, scalars=True) -> WorkerProfile:
    """A profile at a deterministic completeness: the 4 scalar checks = 50% (4 of 8), or 0%."""
    p, _ = WorkerProfile.objects.get_or_create(user=user)
    if scalars:
        p.bio_title = "مطوّر واجهات"
        p.overview = "خبرة واسعة في بناء الأنظمة"
        p.expertise_level = "expert"
        p.hourly_rate = Decimal("15.00")
        p.save()
    return p


@pytest.mark.django_db
class TestPublishCompletenessThreshold:
    def test_default_threshold_blocks_incomplete(self, as_user, worker):
        p = _profile(worker)
        assert p.completeness_pct == 50  # 4 of 8 checks filled
        res = as_user(worker).post("/api/v1/me/profile/publish")
        assert res.status_code == 400
        body = res.json()
        assert body["code"] == "profile_incomplete"
        assert body["required_pct"] == 70  # default
        assert body["completeness_pct"] == 50

    def test_lower_threshold_allows_publish(self, as_user, worker):
        _profile(worker)  # 50%
        set_setting("profiles.publish_min_completeness", 40)
        res = as_user(worker).post("/api/v1/me/profile/publish")
        assert res.status_code == 200
        p = WorkerProfile.objects.get(user=worker)
        # auto_publish defaults OFF → submit lands in PENDING_REVIEW
        assert p.publish_state == WorkerProfile.PublishState.PENDING_REVIEW

    def test_zero_threshold_publishes_all(self, as_user, worker):
        _profile(worker, scalars=False)  # 0% completeness
        assert WorkerProfile.objects.get(user=worker).completeness_pct == 0
        set_setting("profiles.publish_min_completeness", 0)
        res = as_user(worker).post("/api/v1/me/profile/publish")
        assert res.status_code == 200  # no gate at all

    def test_higher_threshold_requires_more(self, as_user, worker):
        _profile(worker)  # 50%
        set_setting("profiles.publish_min_completeness", 80)
        res = as_user(worker).post("/api/v1/me/profile/publish")
        assert res.status_code == 400
        assert res.json()["required_pct"] == 80

    def test_threshold_with_auto_publish_goes_live(self, as_user, worker):
        _profile(worker)  # 50%
        set_setting("profiles.publish_min_completeness", 0)
        set_setting("profiles.auto_publish", True)
        res = as_user(worker).post("/api/v1/me/profile/publish")
        assert res.status_code == 200
        assert WorkerProfile.objects.get(user=worker).publish_state == WorkerProfile.PublishState.PUBLISHED

    def test_contact_info_diverts_autopublish_to_review(self, as_user, worker):
        """Soft gate: overview that looks like contact info goes to review even with auto-publish ON."""
        p = _profile(worker)
        p.overview = "خبرتي واسعة — للتواصل راسلني واتساب 0501234567"
        p.save()
        set_setting("profiles.publish_min_completeness", 0)
        set_setting("profiles.auto_publish", True)
        res = as_user(worker).post("/api/v1/me/profile/publish")
        assert res.status_code == 200  # not rejected
        assert WorkerProfile.objects.get(user=worker).publish_state == WorkerProfile.PublishState.PENDING_REVIEW

    def test_clean_digital_word_still_publishes(self, as_user, worker):
        """Regression: 'الرقمية' (digital) in the overview must not trip the contact guard."""
        p = _profile(worker)
        p.overview = "خبرة في تصميم الهويات البصرية للمنصات الرقمية"
        p.save()
        set_setting("profiles.publish_min_completeness", 0)
        set_setting("profiles.auto_publish", True)
        res = as_user(worker).post("/api/v1/me/profile/publish")
        assert res.status_code == 200
        assert WorkerProfile.objects.get(user=worker).publish_state == WorkerProfile.PublishState.PUBLISHED

    def test_threshold_is_public_setting(self):
        from rest_framework.test import APIClient

        body = APIClient().get("/api/v1/settings/public").json()
        assert body["profiles.publish_min_completeness"] == 70
