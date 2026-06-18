"""One consistent API error envelope (TESTING_STRATEGY §13 error-envelope contract).

Every handled error — our domain errors ({code, message_ar}), DRF built-ins (401/403/404/405/429),
and serializer field validation — is normalized to a single shape so the frontend parses one
thing (no regex-scraping the body):

    { "code": "<machine_code>", "message_ar": "<arabic>", "fields": {<field errors>}? }

5xx are left to Django (not normalized here).
"""
from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler as drf_exception_handler

# default (code, Arabic message) per status when the error doesn't carry our own envelope
_STATUS_DEFAULTS = {
    400: ("bad_request", "طلب غير صالح"),
    401: ("not_authenticated", "يلزم تسجيل الدخول للمتابعة"),
    403: ("permission_denied", "غير مصرّح لك بهذا الإجراء"),
    404: ("not_found", "العنصر المطلوب غير موجود"),
    405: ("method_not_allowed", "الإجراء غير مسموح به"),
    406: ("not_acceptable", "صيغة غير مقبولة"),
    415: ("unsupported_media_type", "نوع المحتوى غير مدعوم"),
    429: ("throttled", "عدد المحاولات كبير — انتظر قليلًا ثم حاول مجددًا"),
}


def _domain_envelope(data):
    """Return our {code, message_ar} envelope if `data` is (or wraps) one, else None."""
    if isinstance(data, dict):
        if "code" in data and "message_ar" in data:
            return {"code": str(data["code"]), "message_ar": str(data["message_ar"])}
        inner = data.get("detail")
        if isinstance(inner, dict) and "code" in inner and "message_ar" in inner:
            return {"code": str(inner["code"]), "message_ar": str(inner["message_ar"])}
    return None


def api_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # unhandled exception → Django returns 500

    data = response.data
    code_default, message_default = _STATUS_DEFAULTS.get(response.status_code, ("error", "حدث خطأ"))

    envelope = _domain_envelope(data)
    if envelope is not None:
        # our domain errors raised as ValidationError/PermissionDenied({code, message_ar})
        payload = envelope
    elif isinstance(data, dict) and set(data.keys()) == {"detail"}:
        # DRF built-ins: {"detail": "..."} (auth, permission, not-found, throttle, method...)
        code = getattr(data["detail"], "code", None) or code_default
        payload = {"code": str(code), "message_ar": message_default}
    else:
        # serializer field validation: {field: [errors]} / list — keep the detail under `fields`
        payload = {"code": "validation_error", "message_ar": "تحقّق من الحقول المدخلة", "fields": data}

    if isinstance(exc, Throttled) and exc.wait:
        payload["retry_after"] = int(exc.wait)

    response.data = payload
    return response
