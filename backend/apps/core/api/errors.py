"""Helper to raise domain errors that render as the standard {code, message_ar} envelope
(see apps/core/api/exception_handler.py). Use instead of ad-hoc `Response({...}, status=400)`
so every error path is consistent for the frontend."""
from rest_framework.exceptions import ValidationError


def api_error(code: str, message_ar: str) -> ValidationError:
    """`raise api_error("invalid_rating", "...")` → 400 {code, message_ar}."""
    return ValidationError({"code": code, "message_ar": message_ar})
