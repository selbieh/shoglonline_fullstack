"""Firebase Admin SDK access — the backend's *control plane* for chat.

The heavy data (messages) and the real-time connections live in Firestore; the backend only:
  * mints per-user **custom tokens** (identity the web client signs into Firestore with), and
  * owns the **conversation documents** (participants, status, names) via the Admin SDK, which
    bypasses security rules — clients can never create or rename a conversation.

Stub-by-default (FIRESTORE_STUB) so dev/test need no external credentials and the firebase-admin
package is only imported on the real path.
"""
import json
import logging
from functools import lru_cache

from django.conf import settings

logger = logging.getLogger(__name__)


def is_stub() -> bool:
    return getattr(settings, "FIRESTORE_STUB", True)


@lru_cache(maxsize=1)
def _app():
    """Initialize (once) the Firebase Admin app from a service-account path or inline JSON."""
    import firebase_admin
    from firebase_admin import credentials

    raw = (settings.FIREBASE_CREDENTIALS or "").strip()
    if not raw:
        raise RuntimeError("FIREBASE_CREDENTIALS is not configured (and FIRESTORE_STUB is off)")
    cred = credentials.Certificate(json.loads(raw) if raw.startswith("{") else raw)
    return firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})


@lru_cache(maxsize=1)
def db():
    """The Firestore Admin client (writes bypass security rules)."""
    from firebase_admin import firestore as admin_firestore

    return admin_firestore.client(_app())


def mint_custom_token(user) -> str:
    """A Firebase custom token scoped to this Django user (uid == user.id).

    Security rules key off request.auth.uid, so this token *is* the user's chat identity.
    Google sign-in tokens are never reused as Firebase creds (FR-AUTH-3 analogue, SEC-3).
    """
    if is_stub():
        return f"stub-firebase-token:{user.id}"
    from firebase_admin import auth

    # Pass the explicit app — minting is usually the FIRST Firebase call (before any db() write),
    # so the default app may not be initialized yet. _app() is lru_cached, so this is a no-op after.
    token = auth.create_custom_token(str(user.id), {"email": user.email}, app=_app())
    return token.decode() if isinstance(token, bytes) else token
