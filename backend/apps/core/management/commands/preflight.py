"""Go-live preflight (Part 12 steps 4 + 18): assert the running config + database are production-ready
before traffic is cut over. Exits non-zero on any FAIL so it can gate a deploy pipeline; WARN items
are advisory. Run inside the target environment:  python manage.py preflight
"""
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.core.models import GlobalSetting
from apps.core.services import DEFAULTS

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"


class Command(BaseCommand):
    help = "Validate production-readiness of the current settings + database (launch gate)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--strict", action="store_true",
            help="Treat WARN as FAIL (exit non-zero on advisories too).",
        )

    def handle(self, *args, **options):
        results: list[tuple[str, str, str]] = []

        def check(name, ok, detail="", *, warn_only=False):
            status = PASS if ok else (WARN if warn_only else FAIL)
            results.append((name, status, detail))

        # --- config hardening -------------------------------------------------
        check("DEBUG is off", settings.DEBUG is False, f"DEBUG={settings.DEBUG}")
        check("Google SSO stub is off", getattr(settings, "GOOGLE_AUTH_STUB", False) is False)
        check("PayPal stub is off", getattr(settings, "PAYPAL_STUB", False) is False)
        check(
            "SECRET_KEY is not the dev default",
            settings.SECRET_KEY and "insecure-dev-key" not in settings.SECRET_KEY,
        )
        check(
            "ALLOWED_HOSTS is real",
            bool(settings.ALLOWED_HOSTS) and settings.ALLOWED_HOSTS not in (["*"], ["localhost", "127.0.0.1"]),
            f"{settings.ALLOWED_HOSTS}",
        )
        check(
            "Email backend is not the console",
            "console" not in settings.EMAIL_BACKEND,
            settings.EMAIL_BACKEND,
        )
        check(
            "TLS redirect is on",
            getattr(settings, "SECURE_SSL_REDIRECT", False) is True,
            warn_only=True,
        )
        check(
            "Sentry DSN is configured",
            bool(getattr(settings, "SENTRY_DSN", "")),
            warn_only=True,
        )
        check(
            "S3 media storage is enabled",
            settings.STORAGES["default"]["BACKEND"] != "django.core.files.storage.FileSystemStorage",
            "media on local FS — fine only if a persistent volume is mounted",
            warn_only=True,
        )

        # --- database state ---------------------------------------------------
        executor = MigrationExecutor(connection)
        unapplied = executor.migration_plan(executor.loader.graph.leaf_nodes())
        check("All migrations applied", not unapplied, f"{len(unapplied)} unapplied")

        seeded = set(GlobalSetting.objects.values_list("key", flat=True))
        missing = sorted(set(DEFAULTS) - seeded)
        check(
            "Global settings seeded",
            not missing,
            f"missing: {', '.join(missing)}" if missing else "",
        )

        # --- report -----------------------------------------------------------
        styles = {PASS: self.style.SUCCESS, WARN: self.style.WARNING, FAIL: self.style.ERROR}
        for name, status, detail in results:
            line = f"[{status}] {name}" + (f" — {detail}" if detail else "")
            self.stdout.write(styles[status](line))

        failed = [r for r in results if r[1] == FAIL]
        warned = [r for r in results if r[1] == WARN]
        if failed or (options["strict"] and warned):
            self.stderr.write(self.style.ERROR(
                f"\nPreflight FAILED: {len(failed)} failure(s), {len(warned)} warning(s)."
            ))
            raise SystemExit(1)
        self.stdout.write(self.style.SUCCESS(
            f"\nPreflight passed ({len(warned)} warning(s))."
        ))
