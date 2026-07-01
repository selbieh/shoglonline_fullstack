"""Sidebar badges + dashboard action-queue (FR-ADM-1): live 'needs-action' counts.

A badge callback must return the count when a queue has work and None when it's empty (so the
sidebar badge is hidden, not shown as "0"), and the dashboard action-queue must list only the
non-zero queues, each with a deep link to its filtered changelist.
"""
import pytest

from apps.core import admin_badges
from apps.core.analytics import DASHBOARD_RANGES, _clamp_days
from apps.jobs.models import Job
from tests.factories import JobFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def test_counts_cover_every_queue():
    counts = admin_badges.actionable_counts()
    for key, *_ in admin_badges.ACTION_QUEUE:
        assert key in counts, f"actionable_counts missing queue '{key}'"


def test_badge_is_hidden_when_zero():
    # Empty DB → no pending work → callback returns None so Unfold renders no badge.
    assert admin_badges.jobs(None) is None
    assert admin_badges.disputes(None) is None


def test_badge_shows_count_when_work_pending():
    JobFactory(status=Job.Status.PENDING_REVIEW)
    JobFactory(status=Job.Status.PENDING_REVIEW)
    assert admin_badges.jobs(None) == 2


def test_action_queue_lists_only_nonzero_with_links():
    JobFactory(status=Job.Status.PENDING_REVIEW)
    queue = admin_badges.action_queue()
    keys = {q["label"] for q in queue}
    jobs_entry = next(q for q in queue if q["count"] and "وظائف" in q["label"])
    assert jobs_entry["count"] == 1
    assert jobs_entry["link"] and "status__exact=pending_review" in jobs_entry["link"]
    # queues with no pending work are omitted entirely (not shown as zero)
    assert all(q["count"] > 0 for q in queue)
    assert "تذاكر دعم مفتوحة" not in keys  # no open tickets created


def test_badge_never_raises_on_error(monkeypatch):
    """A badge must never 500 the admin — a failing count degrades to a hidden badge."""
    def boom():
        raise RuntimeError("db down")
    monkeypatch.setattr(admin_badges, "_compute_counts", boom)
    from django.core.cache import cache
    cache.delete(admin_badges._CACHE_KEY)
    assert admin_badges.jobs(None) is None


@pytest.mark.parametrize("raw,expected", [
    (None, 14), ("", 14), ("abc", 14), ("999", 14),  # bad / out-of-range → default
    ("7", 7), (30, 30), ("90", 90),                    # valid presets pass through
])
def test_clamp_days(raw, expected):
    assert _clamp_days(raw) == expected
    assert expected in DASHBOARD_RANGES


def _nav_badge_paths():
    """Every `badge` import path declared on a sidebar nav item."""
    from config.unfold import UNFOLD
    paths = []
    for group in UNFOLD["SIDEBAR"]["navigation"]:
        for item in group.get("items", []):
            if isinstance(item.get("badge"), str):
                paths.append(item["badge"])
    return paths


def test_every_sidebar_badge_path_is_importable():
    """Guard: Unfold swallows a bad badge import path (ImportError → no badge, no error), so a typo
    would silently kill a badge. Assert each declared path resolves to a callable."""
    from django.utils.module_loading import import_string
    paths = _nav_badge_paths()
    assert paths, "no sidebar badges declared — did the nav config change?"
    for path in paths:
        fn = import_string(path)  # raises ImportError on a typo — the whole point
        assert callable(fn), f"badge {path} is not callable"
