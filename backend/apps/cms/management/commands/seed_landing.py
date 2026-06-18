"""Seed default landing-page sections + cards (idempotent).

Mirrors the built-in home page so the site looks right out of the box, while
letting admins edit every section/card afterwards. Re-running never duplicates
(keyed by section.key); it only creates missing sections.
"""
from django.core.management.base import BaseCommand

from apps.cms.models import LandingCard, LandingSection

SECTIONS = [
    {
        "key": "hero", "kind": "hero", "order": 0,
        "heading": "وظّف أفضل المستقلين أو ابدأ عملك التالي — بثقة",
        "subheading": "حساب واحد للوضعين، مدفوعات محمية بالضمان، ودخول عبر جوجل بنقرة. تصفّح الآن بدون تسجيل.",
        "cta_primary_label": "💼 تصفّح الوظائف", "cta_primary_link": "/jobs",
        "cta_secondary_label": "🛍 تصفّح الخدمات", "cta_secondary_link": "/services",
        "cards": [],
    },
    {
        "key": "features", "kind": "cards", "order": 1, "heading": "",
        "cards": [
            {"icon": "🛡", "title": "مدفوعات بالضمان", "subtitle": "المبلغ محجوز حتى تسلّم وتُقبل الأعمال."},
            {"icon": "🔁", "title": "حساب واحد، وضعان", "subtitle": "بدّل بين «أبحث عن عمل» و«أوظّف» فورًا."},
            {"icon": "🔒", "title": "دخول عبر جوجل", "subtitle": "تسجيل آمن بنقرة واحدة بلا كلمات مرور."},
            {"icon": "⚡", "title": "سريع وآني", "subtitle": "إشعارات ومحادثات لحظية بين الطرفين."},
        ],
    },
    {
        "key": "categories", "kind": "categories", "order": 2, "heading": "تصفّح حسب الفئة",
        "cards": [
            {"icon": "💻", "title": "برمجة وتقنية", "link": "/jobs"},
            {"icon": "🎨", "title": "تصميم وإبداع", "link": "/jobs"},
            {"icon": "✍️", "title": "كتابة وترجمة", "link": "/jobs"},
            {"icon": "📣", "title": "تسويق رقمي", "link": "/jobs"},
            {"icon": "📊", "title": "أعمال ومالية", "link": "/jobs"},
            {"icon": "🎙️", "title": "صوتيات", "link": "/jobs"},
            {"icon": "☎️", "title": "مبيعات ودعم", "link": "/jobs"},
            {"icon": "🧭", "title": "استشارات", "link": "/jobs"},
        ],
    },
    {
        "key": "steps", "kind": "steps", "order": 3, "heading": "كيف تعمل المنصة؟",
        "cards": [
            {"icon": "١", "title": "تصفّح بحرية", "subtitle": "استعرض الوظائف والخدمات وابحث وفلتر دون تسجيل."},
            {"icon": "٢", "title": "سجّل بنقرة", "subtitle": "دخول عبر جوجل فقط — بلا كلمات مرور — عند التقديم أو الشراء."},
            {"icon": "٣", "title": "اعمل بأمان", "subtitle": "مدفوعات بنظام الضمان: تُحجز وتُحرَّر بعد التسليم والقبول."},
        ],
    },
    {
        "key": "cta", "kind": "cta", "order": 4,
        "heading": "جاهز للبدء؟ حساب واحد للوضعين",
        "subheading": "سجّل بنقرة عبر جوجل — وادفع أو اعمل بأمان الضمان",
        "cta_primary_label": "المتابعة باستخدام جوجل", "cta_primary_link": "/signin",
        "cards": [],
    },
]


class Command(BaseCommand):
    help = "Seed default landing sections + cards (idempotent)."

    def handle(self, *args, **options):
        made = 0
        for spec in SECTIONS:
            cards = spec.pop("cards")
            section, created = LandingSection.objects.get_or_create(
                key=spec["key"], defaults=spec
            )
            spec["cards"] = cards  # restore for idempotent re-runs
            if not created:
                continue
            made += 1
            for i, c in enumerate(cards):
                LandingCard.objects.create(section=section, order=i, **c)
        self.stdout.write(self.style.SUCCESS(f"Landing seeded ({made} new sections)."))
