"""Unit tests for the shared phone validator (apps/core/phone.py).

One rule behind every phone/WhatsApp field: a valid international number in E.164 form, Arabic
digits normalized, and Israel (+972) excluded — the same exclusion the frontend dropdown enforces.
"""
import pytest
from django.core.exceptions import ValidationError

from apps.core import phone as ph

pytestmark = pytest.mark.unit


def test_normalize_folds_arabic_digits_and_trims():
    assert ph.normalize_phone("  +٩٦٦٥٠٠٠٠١٢٣٤  ") == "+966500001234"


@pytest.mark.parametrize(
    "value, expected",
    [
        ("+966500001234", "+966500001234"),
        ("+966 50 000 1234", "+966500001234"),
        ("+20 100 123 4567", "+201001234567"),
        ("+٩٦٦٥٠٠٠٠١٢٣٤", "+966500001234"),  # Eastern-Arabic digits
    ],
)
def test_format_e164_canonicalises_valid_numbers(value, expected):
    assert ph.format_e164(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "123",  # too short / no country code
        "0500001234",  # missing '+' country code
        "+9665",  # too short for the region
        "not a phone",
        "+966999",  # parses but is not a valid number
    ],
)
def test_invalid_numbers_rejected(value):
    with pytest.raises(ValidationError) as exc:
        ph.parse_phone(value)
    assert exc.value.code == "invalid_phone"


def test_israel_is_rejected_as_blocked_region():
    with pytest.raises(ValidationError) as exc:
        ph.parse_phone("+972512345678")
    assert exc.value.code == "blocked_phone_region"


def test_validate_phone_allows_empty():
    assert ph.validate_phone("") == ""
    assert ph.validate_phone(None) is None


def test_validate_phone_passes_valid_and_raises_on_bad():
    assert ph.validate_phone("+966500001234") == "+966500001234"
    with pytest.raises(ValidationError):
        ph.validate_phone("+972500001234")  # Israel
    with pytest.raises(ValidationError):
        ph.validate_phone("abc")


@pytest.mark.parametrize(
    "value, is_phone",
    [
        ("+201001234567", True),
        ("0100 123 4567", True),
        ("(20) 100-1234567", True),
        ("https://ipn.eg/pay/xyz", False),
        ("user@instapay", False),
        ("", False),
    ],
)
def test_looks_like_phone(value, is_phone):
    assert ph.looks_like_phone(value) is is_phone
