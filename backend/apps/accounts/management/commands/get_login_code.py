"""Print the latest LIVE email login code for an address (operator / E2E helper).

The email OTP code is persisted in plaintext in `EmailLoginCode` on purpose — so an operator can read
it from the Django admin, and so automated end-to-end tests can drive the REAL passwordless login
(request code → read it here → verify) instead of stubbing auth. Prints `{"code": "<code>"}` (or
`{"code": null}` if none live) as one JSON line on stdout, mirroring the seed_* commands.

Usage:
  python manage.py get_login_code --email worker@e2e.test
"""
import json

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import EmailLoginCode


class Command(BaseCommand):
    help = "Print the newest unconsumed, unexpired email login code for an address (JSON)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="account email")

    def handle(self, *args, **options):
        row = (
            EmailLoginCode.objects.filter(
                email__iexact=options["email"],
                consumed_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .order_by("-created_at")
            .first()
        )
        self.stdout.write(json.dumps({"code": row.code if row else None}))
