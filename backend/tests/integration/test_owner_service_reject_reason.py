"""P2-23 regression: the owner service-detail endpoint must expose `reject_reason` so the UI can
show a rejected service's reason next to the مرفوضة chip (it was missing from the serializer's
fields, so the API never returned it)."""
import pytest
from rest_framework.test import APIClient

from apps.gigs.models import Service
from tests.factories import CategoryFactory, ServiceFactory, UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def test_owner_service_detail_exposes_reject_reason():
    worker = UserFactory()
    service = ServiceFactory(
        worker=worker, category=CategoryFactory(), base_price=100,
        status=Service.Status.REJECTED, reject_reason="يحتوي على معلومات تواصل",
    )
    c = APIClient()
    c.force_authenticate(worker)

    data = c.get(f"/api/v1/me/services/{service.pk}").json()
    assert data["status"] == "rejected"
    assert data["reject_reason"] == "يحتوي على معلومات تواصل"
