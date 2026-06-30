"""Plain-text helpers for legacy rich-text cleanup.

Legacy WordPress (Workreap) stored bios, overviews and descriptions as TinyMCE
HTML. That markup was imported verbatim into our plain-text fields, so the UI
renders raw ``<p>``/``<span style>``/``<strong>`` tags (often malformed:
unbalanced ``<strong>``, ``</p/>``). These helpers strip the markup down to
clean text. See ``core.management.commands.clean_legacy_html``.
"""

from __future__ import annotations

import html
import re

# Block-level tags become line breaks so paragraph structure survives the strip.
_BLOCK_RE = re.compile(
    r"(?is)<\s*/?\s*(?:p|div|br|li|tr|h[1-6]|ul|ol|blockquote)\b[^<>]*>"
)
# Conservative tag matcher: requires a letter/``!`` right after ``<`` and never
# spans another ``<``/``>``. Unlike django.utils.html.strip_tags this will NOT
# swallow prose between a stray ``<`` and a later ``>`` (e.g. "x < y > z").
_TAG_RE = re.compile(r"</?[a-zA-Z!][^<>]*>")
_INLINE_WS_RE = re.compile(r"[^\S\n]+")          # runs of spaces/tabs, keep newlines
_MULTI_NL_RE = re.compile(r"\n\s*\n\s*\n+")      # 3+ blank lines → one blank line


def has_html(value) -> bool:
    """True if ``value`` contains something that looks like an HTML tag."""
    return bool(value) and bool(_TAG_RE.search(html.unescape(str(value))))


def strip_rich_text(value) -> str:
    """Strip legacy HTML to readable plain text.

    Idempotent on already-clean text apart from whitespace normalisation, which
    is why callers should gate writes on :func:`has_html`.
    """
    if not value:
        return ""
    s = html.unescape(str(value))      # &amp; → &, &lt;p&gt; → <p>
    s = _BLOCK_RE.sub("\n", s)         # block tags → line breaks
    s = _TAG_RE.sub("", s)            # drop remaining inline tags
    s = html.unescape(s)              # entities revealed after stripping
    s = _INLINE_WS_RE.sub(" ", s)     # collapse horizontal whitespace
    s = _MULTI_NL_RE.sub("\n\n", s)   # cap blank-line runs
    return "\n".join(line.strip() for line in s.split("\n")).strip()
