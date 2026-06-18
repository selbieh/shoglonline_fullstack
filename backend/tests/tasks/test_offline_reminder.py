"""Offline reminder (BR-16 / FR-PROF-5): a worker Offline past the threshold gets one reminder
per offline window; going back online re-anchors the timer and re-arms the reminder."""
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.notifications.models import Notification
from apps.profiles.models import WorkerProfile
from apps.profiles.tasks import send_offline_reminders
from tests.factories import UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.tasks, pytest.mark.django_db]


def _offline_for(profile, days):
    WorkerProfile.objects.filter(pk=profile.pk).update(
        visibility=WorkerProfile.Visibility.OFFLINE,
        visibility_changed_at=timezone.now() - timedelta(days=days),
        offline_reminder_sent=False,
    )


def test_fires_at_threshold_then_idempotent():
    user = UserFactory()
    profile = WorkerProfileFactory(user=user)
    _offline_for(profile, 11)  # default profiles.offline_reminder_days = 10

    assert send_offline_reminders() == 1
    profile.refresh_from_db()
    assert profile.offline_reminder_sent is True
    assert Notification.objects.filter(user=user).exists()
    # once per window — a second sweep sends nothing
    assert send_offline_reminders() == 0


def test_not_fired_before_threshold():
    profile = WorkerProfileFactory(user=UserFactory())
    _offline_for(profile, 3)
    assert send_offline_reminders() == 0


def test_frozen_worker_is_not_reminded():
    from apps.accounts.models import User
    user = UserFactory()
    profile = WorkerProfileFactory(user=user)
    _offline_for(profile, 20)
    User.objects.filter(pk=user.pk).update(status=User.Status.FROZEN)
    assert send_offline_reminders() == 0  # don't nudge frozen/deleted accounts


def test_online_worker_is_never_reminded():
    profile = WorkerProfileFactory(user=UserFactory(), visibility=WorkerProfile.Visibility.ONLINE)
    WorkerProfile.objects.filter(pk=profile.pk).update(
        visibility_changed_at=timezone.now() - timedelta(days=60)
    )
    assert send_offline_reminders() == 0


def test_going_back_online_reanchors_and_rearms():
    """The BR-16 anchor bug fix: toggling visibility via the API bumps visibility_changed_at and
    clears the once-per-window flag, so a future offline window can fire again."""
    user = UserFactory()
    profile = WorkerProfileFactory(user=user, visibility=WorkerProfile.Visibility.OFFLINE)
    WorkerProfile.objects.filter(pk=profile.pk).update(
        offline_reminder_sent=True, visibility_changed_at=timezone.now() - timedelta(days=40)
    )

    client = APIClient()
    client.force_authenticate(user)
    resp = client.patch("/api/v1/me/profile", {"visibility": "online"}, format="json")
    assert resp.status_code == 200

    profile.refresh_from_db()
    assert profile.offline_reminder_sent is False  # re-armed
    assert profile.visibility_changed_at >= timezone.now() - timedelta(minutes=1)  # re-anchored
