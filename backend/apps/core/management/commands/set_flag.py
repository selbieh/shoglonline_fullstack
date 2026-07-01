"""Set a single Global Settings value (operator / E2E helper).

Coerces `true`/`false`/numbers to their native types; everything else is stored as a string.

Usage:
  python manage.py set_flag emails.enabled false
  python manage.py set_flag payments.commission_pct 10
"""
from django.core.management.base import BaseCommand

from apps.core.services import set_setting


def _coerce(raw: str):
    low = raw.strip().lower()
    if low in ("true", "false"):
        return low == "true"
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        return raw


class Command(BaseCommand):
    help = "Set one Global Settings key to a value (bool/number/string auto-coerced)."

    def add_arguments(self, parser):
        parser.add_argument("key")
        parser.add_argument("value")

    def handle(self, *args, **options):
        value = _coerce(options["value"])
        set_setting(options["key"], value)
        self.stdout.write(f"{options['key']} = {value!r}")
