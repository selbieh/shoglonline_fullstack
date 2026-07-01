"""Mint a JWT access/refresh pair for an existing account (operator / E2E helper).

A shell-only convenience (like get_login_code / seed_lifecycle) so automated backend-flow tests can
obtain a session without driving the interactive OTP/Google login — which is rate-limited and not the
thing those tests are exercising. NEVER exposed over HTTP. Prints `{"access","refresh"}` as one JSON
line on stdout.

Usage:
  python manage.py mint_token --email worker@edge.test
"""
import json

from django.core.management.base import BaseCommand, CommandError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Print a fresh JWT access/refresh pair for an account (E2E/operator helper)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True, help="account email")

    def handle(self, *args, **options):
        try:
            user = User.objects.get(email__iexact=options["email"])
        except User.DoesNotExist as exc:
            raise CommandError(f"no user with email {options['email']!r}") from exc
        refresh = RefreshToken.for_user(user)
        self.stdout.write(json.dumps({"access": str(refresh.access_token), "refresh": str(refresh)}))
