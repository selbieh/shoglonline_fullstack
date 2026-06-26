"""Block external contact details in public free-text (ppt slide-01).

Freelancers and clients must communicate and transact on-platform, so public-facing free text
(profile overview, portfolio/service descriptions, job posts, …) may not carry emails, phone
numbers, URLs, or messaging handles. This is the single reusable detector; serializers call
``validate_no_contact`` on the specific free-text fields (never on legitimate URL fields such as
``verification_link`` / ``project_link`` / ``intro_video``). The frontend shows a soft hint, but
this server-side check is the real guarantee.
"""
import re

from rest_framework import serializers

# Normalize Eastern-Arabic / Persian digits to ASCII so phone detection works on Arabic input.
_DIGIT_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

# obfuscated email: "name at host dot com" / "name@host.com" / "name (at) host (dot) com"
_EMAIL = re.compile(
    r"[A-Za-z0-9._%+\-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\bat\b)\s*"
    r"[A-Za-z0-9.\-]+\s*(?:\.|\(\s*dot\s*\)|\bdot\b)\s*[A-Za-z]{2,}",
    re.I,
)
# explicit links + bare domains on common TLDs
_URL = re.compile(
    r"(?:https?://|www\.)\S+"
    r"|\b[A-Za-z0-9\-]+\.(?:com|net|org|io|me|co|info|biz|app|link|sa|kw|ae|eg|qa|bh|om)\b",
    re.I,
)
# 7+ digit run (optionally +, spaces, dashes, parens) — catches phone numbers, not years/prices<7
_PHONE = re.compile(r"\+?\d(?:[\d\s\-().]{5,})\d")
# messaging apps + "contact me" handles. Latin handles need no boundary; the Arabic keywords are
# wrapped in Arabic-letter boundaries so a keyword like "رقمي" (my number) doesn't match inside an
# unrelated word such as "الرقمية" (digital) or "البريدية" — substring matches were false positives.
_HANDLES = re.compile(
    r"(?:whats\s?app|wa\.me|t\.me|tele\s?gram|insta\s?gram|snap\s?chat|@[A-Za-z0-9_.]{3,})",
    re.I,
)
_HANDLES_AR = re.compile(
    r"(?<![ء-ي])"
    r"(?:واتس(?:اب)?|تلي?[غج]رام|انست[غا]رام?|سناب(?:\s?شات)?|راسلني|كلمني|تواصل\s?مع[يى]?"
    r"|رقم[يى]|جوال[يى]|بريد[يى]|ايميل[يى]?)"
    r"(?![ء-ي])",
)


def contains_contact_info(text) -> bool:
    """True if ``text`` appears to contain an email, phone, URL, or messaging handle."""
    if not text:
        return False
    norm = str(text).translate(_DIGIT_MAP)
    return bool(
        _EMAIL.search(norm)
        or _URL.search(norm)
        or _PHONE.search(norm)
        or _HANDLES.search(norm)
        or _HANDLES_AR.search(norm)
    )


def validate_no_contact(value):
    """DRF field-level validator: reject external contact info in a free-text field."""
    if contains_contact_info(value):
        raise serializers.ValidationError(
            "لا يُسمح بإدراج وسائل تواصل خارجية (هاتف، بريد إلكتروني، روابط، أو حسابات تواصل). "
            "التواصل والتعاقد يتمّان داخل المنصة فقط."
        )
    return value
