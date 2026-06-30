"""End-to-end checks for the platform-wide phone rule across the fields that carry a phone/WhatsApp
number: the phone-OTP request, the freelancer's private contact channel, and the Instapay payout
handle. Israel (+972) is rejected and valid numbers are stored canonicalised to E.164.
"""
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.services import set_setting
from apps.payments.models import PayoutMethod

pytestmark = [pytest.mark.integration, pytest.mark.django_db]

REQUEST_OTP = "/api/v1/auth/phone/request-otp"
PROFILE = "/api/v1/me/profile"
PAYOUTS = "/api/v1/me/payout-methods"


@pytest.fixture()
def client():
    user = User.objects.create_user(email="w@example.com", active_mode="find_job")
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_otp_request_rejects_israel(client):
    set_setting("profiles.phone_verification", True)
    resp = client.post(REQUEST_OTP, {"phone": "+972512345678"}, format="json")
    assert resp.status_code == 400
    assert b"blocked_phone_region" in resp.content


class TestPrivateContact:
    def test_phone_channel_normalised_to_e164(self, client):
        resp = client.patch(
            PROFILE,
            {"private_contact_channel": "whatsapp", "private_contact_value": "+966 50 000 1234"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["private_contact_value"] == "+966500001234"

    def test_invalid_phone_channel_rejected(self, client):
        resp = client.patch(
            PROFILE,
            {"private_contact_channel": "phone", "private_contact_value": "+96650"},
            format="json",
        )
        assert resp.status_code == 400
        assert "private_contact_value" in resp.json().get("fields", resp.json())

    def test_israel_rejected_on_private_contact(self, client):
        resp = client.patch(
            PROFILE,
            {"private_contact_channel": "phone", "private_contact_value": "+972512345678"},
            format="json",
        )
        assert resp.status_code == 400

    def test_email_channel_is_not_phone_validated(self, client):
        resp = client.patch(
            PROFILE,
            {"private_contact_channel": "email", "private_contact_value": "me@example.com"},
            format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["private_contact_value"] == "me@example.com"


class TestInstapayPayout:
    def _post(self, client, link_or_phone):
        return client.post(
            PAYOUTS,
            {
                "kind": "instapay",
                "label": "أرباحي",
                "details": {"link_or_phone": link_or_phone, "display_name": "Ahmed"},
            },
            format="json",
        )

    def test_phone_handle_normalised_to_e164(self, client):
        resp = self._post(client, "+20 100 123 4567")
        assert resp.status_code == 201
        method = PayoutMethod.objects.get(pk=resp.json()["id"])
        assert method.details["link_or_phone"] == "+201001234567"

    def test_invalid_phone_handle_rejected(self, client):
        resp = self._post(client, "+2010")  # phone-shaped but not a valid number
        assert resp.status_code == 400
        assert b"invalid_phone" in resp.content

    def test_payment_link_passes_through(self, client):
        resp = self._post(client, "https://ipn.eg/pay/abc")
        assert resp.status_code == 201
        method = PayoutMethod.objects.get(pk=resp.json()["id"])
        assert method.details["link_or_phone"] == "https://ipn.eg/pay/abc"
