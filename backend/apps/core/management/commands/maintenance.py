"""Flip the public-site maintenance switch (Part 12 step 3 drill / Part 04 middleware).

    python manage.py maintenance on      # public site → Arabic 503 + Retry-After; admin stays up
    python manage.py maintenance off
    python manage.py maintenance status

Writes through core.services.set_setting so the change is audited (SettingChangeLog) and the 60s
settings cache is busted — the flip takes effect platform-wide within the cache TTL.
"""
from django.core.management.base import BaseCommand

from apps.core.services import get_setting, set_setting

KEY = "platform.maintenance_mode"


class Command(BaseCommand):
    help = "Toggle platform.maintenance_mode (on|off|status)."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=["on", "off", "status"])

    def handle(self, *args, **options):
        action = options["action"]
        if action == "status":
            state = "ON" if get_setting(KEY) else "OFF"
            self.stdout.write(f"maintenance_mode is {state}")
            return
        set_setting(KEY, action == "on")
        self.stdout.write(self.style.SUCCESS(f"maintenance_mode set {action.upper()}"))
