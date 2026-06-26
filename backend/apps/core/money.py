"""Single source of truth for how money is rendered in user-facing text.

Canonical format (chosen product-wide, matches the frontend lib/currency.ts):
    "<amount> دولار أمريكي"   e.g. 100 -> "100 دولار أمريكي"
    a range -> "500–1500 دولار أمريكي"

Use these helpers for any string a customer reads (notifications, emails, PDFs).
Do NOT use them for API/JSON numeric fields — the frontend formats those itself.
"""

USD_LABEL_AR = "دولار أمريكي"


def fmt_usd(amount) -> str:
    """Format a single amount as '<amount> دولار أمريكي'."""
    return f"{amount} {USD_LABEL_AR}"


def fmt_usd_range(low, high) -> str:
    """Format a min–max range as '<low>–<high> دولار أمريكي' (single label)."""
    return f"{low}–{high} {USD_LABEL_AR}"
