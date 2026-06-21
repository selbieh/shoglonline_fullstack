"""Category subscriptions (FR-SUB-1) — fills the gap noted in the QA plan.

GET/PUT /me/category-subscriptions is replace-all and account-level (mode-independent).
"""
import pytest

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

URL = "/api/v1/me/category-subscriptions"


def test_requires_auth(api_client):
    assert api_client.get(URL).status_code in (401, 403)


def test_empty_by_default(as_user, worker):
    assert as_user(worker).get(URL).json() == []


def test_put_replaces_full_set(as_user, worker, category):
    client = as_user(worker)

    res = client.put(URL, [{"category": category.id, "subcategory": None}], format="json")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["category"] == category.id
    assert data[0]["category_name"] == category.name_ar

    # GET reflects the saved set.
    assert len(client.get(URL).json()) == 1

    # PUT is replace-all → an empty list clears everything.
    assert client.put(URL, [], format="json").json() == []


def test_put_invalid_category_returns_400(as_user, worker):
    res = as_user(worker).put(URL, [{"category": 999999}], format="json")
    assert res.status_code == 400


def test_subscriptions_are_per_user(as_user, worker, employer, category):
    as_user(worker).put(URL, [{"category": category.id, "subcategory": None}], format="json")
    # A different user starts empty (no leakage across accounts).
    from rest_framework.test import APIClient

    other = APIClient()
    other.force_authenticate(employer)
    assert other.get(URL).json() == []
