"""PayPal provider (the ONLY gateway — product decision, June 2026).

Two modes:
- STUB (default in dev, PAYPAL_STUB=1): no network; orders auto-approve via the
  confirm endpoint so the full flow is testable locally without credentials.
- LIVE: PayPal REST v2 Orders (deposits) + Payouts (withdrawals). Set
  PAYPAL_CLIENT_ID / PAYPAL_SECRET / PAYPAL_BASE_URL (sandbox or live).

Card data never touches our servers — PCI-DSS SAQ-A posture (SEC-8).
"""
import base64
import logging
import uuid

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class PayPalError(Exception):
    pass


def _base_url() -> str:
    return getattr(settings, "PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com")


def _stub() -> bool:
    return getattr(settings, "PAYPAL_STUB", True)


def _token() -> str:
    auth = base64.b64encode(
        f"{settings.PAYPAL_CLIENT_ID}:{settings.PAYPAL_SECRET}".encode()
    ).decode()
    res = requests.post(
        f"{_base_url()}/v1/oauth2/token",
        headers={"Authorization": f"Basic {auth}"},
        data={"grant_type": "client_credentials"},
        timeout=20,
    )
    if res.status_code != 200:
        raise PayPalError(f"token: {res.status_code}")
    return res.json()["access_token"]


def create_order(amount: str, currency: str, return_url: str, cancel_url: str) -> dict:
    """Returns {order_id, approval_url}."""
    if _stub():
        order_id = f"STUB-{uuid.uuid4().hex[:12].upper()}"
        return {"order_id": order_id, "approval_url": f"{return_url}?token={order_id}&stub=1"}

    res = requests.post(
        f"{_base_url()}/v2/checkout/orders",
        headers={"Authorization": f"Bearer {_token()}"},
        json={
            "intent": "CAPTURE",
            "purchase_units": [{"amount": {"currency_code": currency, "value": amount}}],
            "application_context": {"return_url": return_url, "cancel_url": cancel_url},
        },
        timeout=20,
    )
    if res.status_code not in (200, 201):
        logger.error("paypal create_order failed: %s %s", res.status_code, res.text[:200])
        raise PayPalError("create_order")
    data = res.json()
    approval = next(link["href"] for link in data["links"] if link["rel"] == "approve")
    return {"order_id": data["id"], "approval_url": approval}


def capture_order(order_id: str) -> bool:
    """Capture after buyer approval. Stub orders always capture."""
    if _stub():
        return order_id.startswith("STUB-")
    res = requests.post(
        f"{_base_url()}/v2/checkout/orders/{order_id}/capture",
        headers={"Authorization": f"Bearer {_token()}"},
        timeout=20,
    )
    if res.status_code not in (200, 201):
        logger.error("paypal capture failed: %s %s", res.status_code, res.text[:200])
        return False
    return res.json().get("status") == "COMPLETED"


def get_order_status(order_id: str) -> str:
    """For the reconciliation sweep (FR-PAY-2)."""
    if _stub():
        return "COMPLETED"
    res = requests.get(
        f"{_base_url()}/v2/checkout/orders/{order_id}",
        headers={"Authorization": f"Bearer {_token()}"},
        timeout=20,
    )
    return res.json().get("status", "UNKNOWN") if res.status_code == 200 else "UNKNOWN"
