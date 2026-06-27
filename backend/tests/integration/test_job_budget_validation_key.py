"""P2-04: a budget_min > budget_max error must be keyed to `budget_max`, matching the
client-side rule on /jobs/new so applyApiError marks the same input the user sees."""
import pytest
from rest_framework.test import APIClient

from apps.core.services import set_setting

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


@pytest.fixture(autouse=True)
def _auto_publish():
    set_setting("jobs.auto_publish", True)


def test_budget_min_gt_max_error_is_keyed_to_budget_max(employer, category):
    res = auth(employer).post(
        "/api/v1/me/jobs",
        {
            "title": "تصميم هوية بصرية",
            "description": "وصف تفصيلي للوظيفة المطلوبة",
            "category": category.pk,
            "budget_min": "500",
            "budget_max": "100",
        },
        format="json",
    )
    assert res.status_code == 400, res.content
    fields = res.json().get("fields", {})
    # The error must land on budget_max (the input the client highlights), not budget_min.
    assert "budget_max" in fields, fields
    assert "budget_min" not in fields, fields
