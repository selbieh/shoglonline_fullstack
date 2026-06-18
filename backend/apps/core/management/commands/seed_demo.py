"""One-shot demo/E2E seed (idempotent).

Runs the canonical seeders (settings, catalog, landing) and adds the fixtures E2E + manual QA
rely on: bid plans, ticket types, a baseline affiliate commission rule, and the core CMS pages
(about / terms / privacy). Safe to re-run — every row is keyed and uses get_or_create /
update_or_create, so nothing duplicates.

    docker compose exec backend python manage.py seed_demo
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.affiliate.models import CommissionRule
from apps.bids.models import BidPlan
from apps.cms.models import ContentPage
from apps.tickets.models import TicketType

BID_PLANS = [
    # (name, bids_count, cost, description)
    ("باقة البداية", 10, 5, "10 عروض — مناسبة للبداية"),
    ("الباقة الاحترافية", 30, 12, "30 عرضًا بسعر مخفّض"),
    ("باقة الأعمال", 75, 25, "75 عرضًا لأصحاب النشاط الكثيف"),
]

TICKET_TYPES = [
    # (name_ar, slug, is_dispute)
    ("استفسار عام", "general", False),
    ("مشكلة تقنية", "technical", False),
    ("الدفع والمحفظة", "billing", False),
    ("نزاع على عقد", "contract-dispute", True),
]

CONTENT_PAGES = [
    # (slug, title, body)
    ("about", "من نحن", "منصة شغل أونلاين تربط أصحاب العمل بالمستقلين بثقة وضمان."),
    ("terms", "الشروط والأحكام", "باستخدامك المنصة فإنك توافق على الشروط والأحكام التالية ..."),
    ("privacy", "سياسة الخصوصية", "نحترم خصوصيتك ونحمي بياناتك وفق السياسة التالية ..."),
]


class Command(BaseCommand):
    help = "Seed demo/E2E fixtures: settings, catalog, landing, bid plans, ticket types, " \
           "an affiliate rule, and core CMS pages (idempotent)."

    def handle(self, *args, **options):
        # Reuse the canonical seeders so demo data stays consistent with production defaults.
        for cmd in ("seed_settings", "seed_catalog", "seed_landing"):
            call_command(cmd)

        plans = 0
        for name, count, cost, desc in BID_PLANS:
            _, created = BidPlan.objects.get_or_create(
                name=name,
                defaults={"bids_count": count, "cost": cost, "description": desc, "is_active": True},
            )
            plans += int(created)

        types = 0
        for name_ar, slug, is_dispute in TICKET_TYPES:
            _, created = TicketType.objects.get_or_create(
                slug=slug,
                defaults={"name_ar": name_ar, "is_dispute": is_dispute, "is_active": True},
            )
            types += int(created)

        # A single baseline rule (5% on any party) is enough for affiliate E2E flows.
        _, rule_created = CommissionRule.objects.get_or_create(
            applies_to=CommissionRule.AppliesTo.ANY,
            rate_pct=5,
            defaults={"is_active": True},
        )

        pages = 0
        for slug, title, body in CONTENT_PAGES:
            _, created = ContentPage.objects.get_or_create(
                slug=slug,
                defaults={"title": title, "body": body, "is_published": True},
            )
            pages += int(created)

        self.stdout.write(self.style.SUCCESS(
            f"Demo seeded: {plans} bid plans, {types} ticket types, "
            f"{'1' if rule_created else '0'} affiliate rule, {pages} CMS pages."
        ))
