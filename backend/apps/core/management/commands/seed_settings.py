from django.core.management.base import BaseCommand

from apps.core.models import GlobalSetting
from apps.core.services import DEFAULTS


class Command(BaseCommand):
    help = "Seed the Global Settings catalog with SRS §22.1 defaults (idempotent)."

    def handle(self, *args, **options):
        created = 0
        for key, (value, vtype, category, is_public) in DEFAULTS.items():
            _, was_created = GlobalSetting.objects.get_or_create(
                key=key,
                defaults={
                    "value": value,
                    "value_type": vtype,
                    "category": category,
                    "is_public": is_public,
                },
            )
            created += int(was_created)
        self.stdout.write(self.style.SUCCESS(f"Settings seeded ({created} created)."))
