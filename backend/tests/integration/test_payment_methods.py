"""Saved payment methods (FR-PAY-4): tokenized add/list/default/delete, owner-scoped, and the
hard guarantee that a raw PAN is never accepted or persisted (PCI SAQ-A)."""
import pytest
from rest_framework.test import APIClient

from apps.payments.models import PaymentMethod
from tests.factories import UserFactory

pytestmark = [pytest.mark.integration, pytest.mark.django_db]


def auth(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_add_returns_masked_without_token():
    user = UserFactory()
    resp = auth(user).post("/api/v1/me/payment-methods",
                           {"type": "card", "gateway_token": "tok_abc123", "brand": "visa", "last4": "4242"},
                           format="json")
    assert resp.status_code == 201
    data = resp.json()
    assert data["last4"] == "4242" and data["brand"] == "visa"
    assert "gateway_token" not in data  # token is never exposed


def test_raw_pan_field_rejected():
    user = UserFactory()
    resp = auth(user).post("/api/v1/me/payment-methods",
                           {"card_number": "4242424242424242", "gateway_token": "tok"}, format="json")
    assert resp.status_code == 400
    assert resp.json()["code"] == "pan_forbidden"
    assert not PaymentMethod.objects.filter(user=user).exists()  # nothing persisted


def test_token_that_is_a_bare_pan_rejected():
    user = UserFactory()
    resp = auth(user).post("/api/v1/me/payment-methods",
                           {"gateway_token": "4242 4242 4242 4242"}, format="json")
    assert resp.status_code == 400
    assert resp.json()["code"] == "pan_forbidden"


def test_only_token_and_mask_persisted():
    user = UserFactory()
    auth(user).post("/api/v1/me/payment-methods",
                    {"gateway_token": "tok_xyz", "last4": "1111"}, format="json")
    method = PaymentMethod.objects.get(user=user)
    assert method.gateway_token == "tok_xyz"
    assert len(method.last4) <= 4  # only a masked tail, never a full PAN


def test_first_method_default_then_switch_and_delete():
    user = UserFactory()
    m1 = auth(user).post("/api/v1/me/payment-methods", {"gateway_token": "tok1"}, format="json").json()
    m2 = auth(user).post("/api/v1/me/payment-methods", {"gateway_token": "tok2"}, format="json").json()
    assert m1["is_default"] is True and m2["is_default"] is False

    auth(user).patch(f"/api/v1/me/payment-methods/{m2['id']}", {"is_default": True}, format="json")
    assert PaymentMethod.objects.get(pk=m2["id"]).is_default is True
    assert PaymentMethod.objects.get(pk=m1["id"]).is_default is False

    assert auth(user).delete(f"/api/v1/me/payment-methods/{m1['id']}").status_code == 204
    assert PaymentMethod.objects.filter(user=user).count() == 1


def test_methods_are_owner_scoped():
    user, other = UserFactory(), UserFactory()
    pm = auth(user).post("/api/v1/me/payment-methods", {"gateway_token": "tok"}, format="json").json()
    assert auth(other).delete(f"/api/v1/me/payment-methods/{pm['id']}").status_code == 404
    assert auth(other).get("/api/v1/me/payment-methods").json() == []
