"""Log hygiene (SEC §16): redact secrets/PANs/tokens before anything is written, plus a JSON
formatter for structured logs. A test asserts nothing sensitive leaks into log output."""
import json
import logging
import re

# Order matters: consume the whole Authorization value (incl. a "Bearer " prefix) first, then
# standalone bearer tokens, then key/value secrets, then bare card-number-length digit runs.
_REDACTIONS = (
    (re.compile(r"(?i)\bauthorization\b\s*[:=]\s*\S.*"), "authorization: [REDACTED]"),
    (re.compile(r"(?i)\bbearer\s+\S+"), "bearer [REDACTED]"),
    (re.compile(r"(?i)\b(password|secret|token|api[_-]?key|gateway_token|access|refresh)\b"
                r"(\"?\s*[:=]\s*\"?)[^\s\"',}\]]+"), r"\1\2[REDACTED]"),
    (re.compile(r"\b\d{13,19}\b"), "[REDACTED_PAN]"),
)


def redact(text: str) -> str:
    for pattern, repl in _REDACTIONS:
        text = pattern.sub(repl, text)
    return text


class RedactingFilter(logging.Filter):
    """Scrubs sensitive substrings from every record (message + interpolated args)."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            rendered = record.getMessage()
        except Exception:  # noqa: BLE001 — never let logging hygiene break logging
            return True
        cleaned = redact(rendered)
        if cleaned != rendered:
            record.msg = cleaned
            record.args = ()
        return True


class JsonFormatter(logging.Formatter):
    """Structured JSON line per record (NFR-MNT-4). Redacts defensively in case the filter is off."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "level": record.levelname,
            "logger": record.name,
            "message": redact(record.getMessage()),
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
        }
        if record.exc_info:
            payload["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False)
