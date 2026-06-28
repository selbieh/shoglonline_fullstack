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
        # Content-Type is REQUIRED even though the body is empty — PayPal rejects a bodyless
        # capture with 415 UNSUPPORTED_MEDIA_TYPE otherwise.
        headers={"Authorization": f"Bearer {_token()}", "Content-Type": "application/json"},
        timeout=20,
    )
    if res.status_code not in (200, 201):
        logger.error("paypal capture failed: %s %s", res.status_code, res.text[:200])
        return False
    return res.json().get("status") == "COMPLETED"


def payout(*, email: str, amount: str, currency: str, sender_batch_id: str, note: str = "") -> dict:
    """Send a withdrawal to the recipient's PayPal account (PayPal Payouts API, FR-PAY-3/8).

    Returns {payout_batch_id, status}. Idempotent on `sender_batch_id`: PayPal rejects a repeated
    batch id, so a retry after a crash can never double-pay — we treat the duplicate as success and
    surface the same batch (the caller stores it as gateway_ref).
    """
    if _stub():
        return {"payout_batch_id": f"STUBPO-{sender_batch_id}", "status": "SUCCESS"}

    res = requests.post(
        f"{_base_url()}/v1/payments/payouts",
        headers={"Authorization": f"Bearer {_token()}"},
        json={
            "sender_batch_header": {
                "sender_batch_id": sender_batch_id,
                "recipient_type": "EMAIL",
                "email_subject": "وصلتك دفعة من شغل أونلاين",
            },
            "items": [{
                "recipient_type": "EMAIL",
                "receiver": email,
                "amount": {"value": amount, "currency": currency},
                "note": note,
                "sender_item_id": f"{sender_batch_id}-1",
            }],
        },
        timeout=20,
    )
    if res.status_code in (200, 201):
        header = res.json().get("batch_header", {})
        return {"payout_batch_id": header.get("payout_batch_id", ""),
                "status": header.get("batch_status", "PENDING")}
    # A repeated sender_batch_id means we already paid this withdrawal — not an error.
    if res.status_code == 400 and "BATCH_ID_ALREADY_EXISTS" in res.text:
        logger.warning("paypal payout duplicate batch %s — already paid", sender_batch_id)
        return {"payout_batch_id": sender_batch_id, "status": "DUPLICATE"}
    logger.error("paypal payout failed: %s %s", res.status_code, res.text[:200])
    raise PayPalError("payout")


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
