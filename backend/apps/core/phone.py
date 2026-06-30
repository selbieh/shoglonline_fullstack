"""Reusable phone-number validation for every phone/WhatsApp field on the platform.

All phone inputs (account OTP, the freelancer's private contact channel, the CMS footer phone,
Instapay payout handles, …) flow through here so the rule is identical everywhere: the value must
be a valid international number in E.164 form (``+<country code><number>``), and Israel (+972) is
not accepted — mirroring the country-code dropdown on the frontend, which omits Israel. Keeping the
check in one place means a request that bypasses the UI (a raw API call) is rejected just the same.

Built on the ``phonenumbers`` library (Google's libphonenumber port). The validators raise Django's
``ValidationError`` so they work both as model-field validators (admin + ModelForm) and inside DRF
serializers — DRF re-wraps a Django ``ValidationError`` raised from a field validator.
"""
import re

import phonenumbers
from django.core.exceptions import ValidationError

# Normalize Eastern-Arabic / Persian digits to ASCII (users on Arabic keyboards type "٠١…").
_DIGIT_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

# Country calling codes that are not accepted anywhere on the platform. Israel (+972) is excluded
# to match the frontend dropdown; centralising it here closes the raw-API bypass.
BLOCKED_CALLING_CODES = {972}

# Chars allowed in a "this is a phone, not a URL/handle" string — used by the Instapay field, which
# accepts either a payment link or a phone number.
_PHONE_SHAPE = re.compile(r"^\+?[\d\s\-()]+$")

INVALID_PHONE_MSG = (
    "رقم هاتف غير صالح. أدخل الرقم بالصيغة الدولية مع رمز الدولة، مثل +9665XXXXXXXX."
)
BLOCKED_PHONE_MSG = "رمز الدولة المُدخل غير مدعوم."


def normalize_phone(value) -> str:
    """ASCII-fold Arabic digits and trim surrounding whitespace. Does not strip inner spaces —
    ``phonenumbers`` tolerates them."""
    return str(value or "").translate(_DIGIT_MAP).strip()


def parse_phone(value) -> phonenumbers.PhoneNumber:
    """Parse ``value`` to a libphonenumber object or raise ``ValidationError``.

    The number must carry its country code (lead with ``+``); the UI always submits ``+<cc><num>``.
    Rejects unparseable, invalid, and blocked-calling-code (Israel) numbers.
    """
    raw = normalize_phone(value)
    if not raw.startswith("+"):
        raise ValidationError(INVALID_PHONE_MSG, code="invalid_phone")
    try:
        number = phonenumbers.parse(raw, None)
    except phonenumbers.NumberParseException as exc:
        raise ValidationError(INVALID_PHONE_MSG, code="invalid_phone") from exc
    if number.country_code in BLOCKED_CALLING_CODES:
        raise ValidationError(BLOCKED_PHONE_MSG, code="blocked_phone_region")
    if not phonenumbers.is_valid_number(number):
        raise ValidationError(INVALID_PHONE_MSG, code="invalid_phone")
    return number


def format_e164(value) -> str:
    """Validate and return the canonical E.164 string (``+<cc><digits>``, no spaces)."""
    return phonenumbers.format_number(parse_phone(value), phonenumbers.PhoneNumberFormat.E164)


def validate_phone(value):
    """Django/DRF field validator. Empty values pass (use ``blank=True`` / ``allow_blank`` to gate
    presence); any non-empty value must be a valid, non-blocked international number."""
    if value in (None, ""):
        return value
    parse_phone(value)
    return value


def looks_like_phone(value) -> bool:
    """True when ``value`` is shaped like a phone number (digits, spaces, +, -, parens) rather than
    a URL or handle — lets a dual-purpose field validate the phone case without rejecting links."""
    raw = normalize_phone(value)
    return bool(raw) and bool(_PHONE_SHAPE.match(raw))
