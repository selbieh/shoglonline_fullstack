"""FCM push adapter (FR-NOT-2). Stub-by-default like the PayPal/Google adapters:
in dev it logs and returns True; wire real FCM credentials for production."""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def send_push(*, user_id: int, title: str, body: str, deep_link: str = "", collapse_key: str = "") -> bool:
    if getattr(settings, "FCM_STUB", True):
        logger.info("[push-stub] uid=%s «%s» link=%s", user_id, title, deep_link)
        return True
    # PHASE5+: real FCM HTTP v1 dispatch using a service-account token and the
    # user's registered device tokens. Data-only payload for foreground chat (FR-NOT-2).
    return False
