"""Seed real remote-work categories + subcategories (FR-JOB-13). Idempotent.

Run by entrypoint.sh on boot; safe to re-run. Keyed by slug so renames/reorders
never duplicate. Subcategories link to their parent via `parent`.
"""
from django.core.management.base import BaseCommand
from django.utils.text import slugify

from apps.catalog.models import Category

# (ar, en, icon, [ (sub_ar, sub_en), ... ])
CATALOG = [
    ("برمجة وتقنية", "Programming & Tech", "💻", [
        ("تطوير الويب", "Web Development"),
        ("تطبيقات الموبايل", "Mobile Apps"),
        ("الخلفية وواجهات API", "Backend & APIs"),
        ("DevOps والسحابة", "DevOps & Cloud"),
        ("اختبار وضمان الجودة", "QA & Testing"),
        ("البيانات والذكاء الاصطناعي", "Data & AI"),
        ("ووردبريس", "WordPress"),
    ]),
    ("تصميم وإبداع", "Design & Creative", "🎨", [
        ("تصميم واجهات وتجربة المستخدم", "UI/UX Design"),
        ("تصميم جرافيك", "Graphic Design"),
        ("الشعارات والهوية", "Logo & Branding"),
        ("الرسم والإليستريشن", "Illustration"),
        ("مونتاج الفيديو", "Video Editing"),
        ("موشن جرافيك", "Motion Graphics"),
    ]),
    ("كتابة وترجمة", "Writing & Translation", "✍️", [
        ("كتابة المحتوى", "Content Writing"),
        ("كتابة إعلانية", "Copywriting"),
        ("الترجمة", "Translation"),
        ("التدقيق اللغوي", "Proofreading"),
        ("الكتابة التقنية", "Technical Writing"),
    ]),
    ("تسويق رقمي", "Digital Marketing", "📣", [
        ("تحسين محركات البحث", "SEO"),
        ("إدارة وسائل التواصل", "Social Media"),
        ("الإعلانات المدفوعة", "Paid Ads / PPC"),
        ("التسويق بالبريد", "Email Marketing"),
        ("التسويق عبر المؤثرين", "Influencer Marketing"),
    ]),
    ("مبيعات ودعم", "Sales & Support", "☎️", [
        ("دعم العملاء", "Customer Support"),
        ("مساعد افتراضي", "Virtual Assistant"),
        ("توليد العملاء المحتملين", "Lead Generation"),
        ("إدخال البيانات", "Data Entry"),
    ]),
    ("أعمال ومالية", "Business & Finance", "📊", [
        ("المحاسبة", "Accounting"),
        ("مسك الدفاتر", "Bookkeeping"),
        ("التحليل المالي", "Financial Analysis"),
        ("خطط العمل", "Business Plans"),
        ("إدارة المشاريع", "Project Management"),
    ]),
    ("صوتيات", "Audio & Voice", "🎙️", [
        ("التعليق الصوتي", "Voice Over"),
        ("مونتاج البودكاست", "Podcast Editing"),
        ("إنتاج الموسيقى", "Music Production"),
    ]),
    ("استشارات", "Consulting", "🧭", [
        ("استشارات قانونية", "Legal Consulting"),
        ("الموارد البشرية", "HR Consulting"),
        ("التطوير المهني", "Career Coaching"),
    ]),
]


class Command(BaseCommand):
    help = "Seed remote-work categories + subcategories (idempotent)."

    def handle(self, *args, **options):
        cats = subs = 0
        for order, (ar, en, icon, children) in enumerate(CATALOG):
            slug = slugify(en)
            parent, created = Category.objects.update_or_create(
                slug=slug,
                defaults={"name_ar": ar, "name_en": en, "icon": icon, "order": order,
                          "is_active": True, "parent": None},
            )
            cats += int(created)
            for sub_order, (sub_ar, sub_en) in enumerate(children):
                _, sub_created = Category.objects.update_or_create(
                    slug=slugify(f"{en}-{sub_en}"),
                    defaults={"name_ar": sub_ar, "name_en": sub_en, "parent": parent,
                              "order": sub_order, "is_active": True},
                )
                subs += int(sub_created)
        self.stdout.write(self.style.SUCCESS(
            f"Catalog seeded: {cats} new categories, {subs} new subcategories "
            f"(total {Category.objects.count()} rows)."
        ))
