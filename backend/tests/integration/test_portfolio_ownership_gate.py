"""P1-04 regression: the ownership gate (slide-23 تأكيد الملكية) must be enforced server-side on
portfolio create, so the inline quick-add path can't bypass it by simply not sending the flag."""
import pytest
from rest_framework.test import APIClient

from apps.profiles.models import PortfolioItem, WorkerProfile
from tests.factories import UserFactory, WorkerProfileFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def _online_worker():
    user = UserFactory()
    WorkerProfileFactory(user=user, visibility=WorkerProfile.Visibility.ONLINE)
    return user


def _auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_create_rejected_without_ownership_confirmation():
    """Before the fix the item was created (201); now an unconfirmed create is a 400 and nothing
    is persisted."""
    user = _online_worker()
    res = _auth(user).post(
        "/api/v1/me/portfolio",
        {"title": "عمل بلا تأكيد", "media_type": "link", "url": "https://x.example"},
        format="json",
    )
    assert res.status_code == 400, res.content
    assert "ownership_confirmed" in res.json().get("fields", res.json())
    assert not PortfolioItem.objects.filter(profile=user.worker_profile).exists()


def test_create_succeeds_with_ownership_confirmed():
    user = _online_worker()
    res = _auth(user).post(
        "/api/v1/me/portfolio",
        {"title": "عمل مؤكَّد", "media_type": "link", "url": "https://x.example",
         "ownership_confirmed": True},
        format="json",
    )
    assert res.status_code == 201, res.content
    assert PortfolioItem.objects.filter(
        profile=user.worker_profile, ownership_confirmed=True
    ).exists()
