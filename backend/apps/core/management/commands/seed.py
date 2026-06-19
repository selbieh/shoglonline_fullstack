"""Comprehensive Arabic test-data seeder — populates EVERY table for manual QA / demo.

Builds a realistic, fully-interconnected dataset in Arabic on top of the canonical
reference seeders (settings, catalog, landing, demo): users with both profiles,
skills, wallets + ledger, bids, jobs + proposals, services + buying requests,
contracts across every status, submissions, reviews, chat, notifications, tickets,
affiliate program, subscriptions and invoices.

Idempotent: re-running upserts by natural keys and skips append-only children whose
parent already has rows, so nothing duplicates. Money is posted through the ledger
service with deterministic idempotency keys, so balances stay coherent on every run.

    python manage.py seed             # create / upsert all demo data
    python manage.py seed --flush     # wipe transactional + demo users first, then reseed

Demo accounts use the @shoghlonline.test domain and password "demo12345"
(login locally via the Google stub, or use the admin account in /admin).
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

from apps.accounts.models import User
from apps.affiliate.models import AffiliateCommission, AffiliateProfile, Referral
from apps.bids.models import BidLedger, BidPlan
from apps.catalog.models import Category, Skill
from apps.chat.models import Conversation, ConversationMember, Message
from apps.cms.models import FAQItem
from apps.contracts.models import Contract, ContractEvent, Submission, UpdateRequest
from apps.core.models import AuditLog, SettingChangeLog
from apps.core.services import get_setting
from apps.gigs.models import BuyingRequest, Favorite, Service, ServiceAddon, ServiceFavorite
from apps.invoices.models import InvoiceLine, InvoiceRequest
from apps.jobs.models import (
    Invitation,
    Job,
    Proposal,
    ScreeningAnswer,
    ScreeningQuestion,
    WatchlistItem,
)
from apps.notifications.models import Notification
from apps.payments.models import PayoutMethod, Transaction, WithdrawalRequest
from apps.payments.services import get_platform_wallet, get_wallet, post
from apps.profiles.models import (
    Address,
    Certificate,
    Education,
    Employment,
    IDVerification,
    PortfolioItem,
    WorkerLanguage,
    WorkerSkill,
)
from apps.reviews.models import Review
from apps.subscriptions.models import CategorySubscription
from apps.tickets.models import Ticket, TicketReply, TicketType

DEMO_DOMAIN = "@shoghlonline.test"
DEMO_PASSWORD = "demo12345"

NOW = None  # set in handle() so every row in one run shares a coherent clock


def D(value) -> Decimal:
    return Decimal(str(value))


# ────────────────────────────────────────────────────────────── people
# (key, first, last, phone)  — workers go to find_job, employers to find_worker
WORKERS = [
    ("worker1", "محمد", "العتيبي", "+96550010001"),
    ("worker2", "سارة", "الأحمد", "+96550010002"),
    ("worker3", "خالد", "المنصور", "+96550010003"),
    ("worker4", "نورة", "الشمري", "+96550010004"),
    ("worker5", "يوسف", "الحربي", "+96550010005"),
    ("worker6", "ليلى", "القحطاني", "+96550010006"),
]
EMPLOYERS = [
    ("employer1", "أحمد", "الصباح", "+96550020001"),
    ("employer2", "فاطمة", "الخالد", "+96550020002"),
    ("employer3", "عبدالله", "الدوسري", "+96550020003"),
    ("employer4", "ريم", "السالم", "+96550020004"),
]

# bio_title, overview, expertise, hourly_rate, company (worker profiles)
WORKER_PROFILE = {
    "worker1": ("مطوّر ويب Full-Stack", "خبرة ٧ سنوات في بناء تطبيقات ويب عالية الأداء بـ Django وReact.",
                "expert", 18),
    "worker2": ("مصمّمة واجهات وتجربة مستخدم", "أصمّم واجهات عصرية تركّز على المستخدم بأدوات Figma.",
                "intermediate", 14),
    "worker3": ("كاتب محتوى وكوبي رايتر", "أكتب محتوى تسويقيًا ومقالات SEO تجذب العملاء وتزيد المبيعات.",
                "expert", 12),
    "worker4": ("أخصائية تسويق رقمي وSEO", "أدير حملات إعلانية وأحسّن ترتيب المواقع في محركات البحث.",
                "intermediate", 15),
    "worker5": ("مطوّر تطبيقات موبايل", "أبني تطبيقات iOS وAndroid بـ Flutter وReact Native.",
                "expert", 20),
    "worker6": ("مترجمة عربي/إنجليزي", "ترجمة احترافية للمستندات والمحتوى التقني والتسويقي.",
                "intermediate", 10),
}

EMPLOYER_COMPANY = {
    "employer1": "شركة تقنية المستقبل",
    "employer2": "متجر الأناقة للأزياء",
    "employer3": "مؤسسة نماء للاستشارات",
    "employer4": "وكالة إبداع للتسويق",
}

# subcategory_slug -> [(name_ar, slug)]
SKILLS = {
    "programming-tech-web-development": [
        ("جانغو (Django)", "django"), ("رياكت (React)", "react"),
        ("فيو (Vue.js)", "vuejs"), ("نود (Node.js)", "nodejs"), ("لارافيل (Laravel)", "laravel"),
    ],
    "programming-tech-mobile-apps": [
        ("فلاتر (Flutter)", "flutter"), ("رياكت نيتف", "react-native"),
        ("سويفت (Swift)", "swift"), ("كوتلن (Kotlin)", "kotlin"),
    ],
    "design-creative-uiux-design": [
        ("فيجما (Figma)", "figma"), ("أدوبي إكس دي", "adobe-xd"),
        ("تصميم تجربة المستخدم", "ux-design"),
    ],
    "design-creative-graphic-design": [
        ("فوتوشوب", "photoshop"), ("إليستريتور", "illustrator"),
    ],
    "writing-translation-content-writing": [
        ("كتابة المقالات", "article-writing"), ("كتابة السيو", "seo-writing"),
    ],
    "writing-translation-translation": [
        ("ترجمة عربي-إنجليزي", "ar-en-translation"),
    ],
    "digital-marketing-seo": [
        ("تحسين محركات البحث", "seo"), ("تحليل الكلمات المفتاحية", "keyword-research"),
    ],
    "digital-marketing-social-media": [
        ("إدارة السوشيال ميديا", "social-media-mgmt"),
    ],
}

FAQ = [
    ("كيف أبدأ العمل على المنصة؟",
     "سجّل دخولك عبر جوجل، أكمل ملفك الشخصي، ثم تصفّح الوظائف أو انشر خدمتك الخاصة.", "البداية"),
    ("كيف تتم حماية مدفوعاتي؟",
     "يُحجز المبلغ في الضمان عند بدء العقد ولا يُحرّر للمستقل إلا بعد قبولك للتسليم.", "المدفوعات"),
    ("ما هي العروض (Bids) وكيف أحصل عليها؟",
     "كل تقديم على وظيفة يستهلك عرضًا واحدًا. تحصل على عروض مجانية عند التسجيل ويمكنك شراء باقات إضافية.",
     "العروض"),
    ("كيف أسحب أرباحي؟",
     "اطلب السحب من محفظتك عبر PayPal بحدّ أدنى ١٠ دولارات، وتتم المعالجة خلال أيام عمل.", "المدفوعات"),
]


class Command(BaseCommand):
    help = ("Seed a full Arabic demo dataset across all tables (idempotent). "
            "Use --flush to wipe transactional + demo data first.")

    def add_arguments(self, parser):
        parser.add_argument(
            "--flush", action="store_true",
            help="Delete transactional data and @shoghlonline.test demo users before seeding.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        global NOW
        NOW = timezone.now()

        if options["flush"]:
            self._flush()

        # Canonical reference data first (settings, catalog, landing, bid plans,
        # ticket types, affiliate rule, core CMS pages) — all idempotent.
        call_command("seed_demo")
        self._faq()

        skills = self._skills()
        workers, employers, admin = self._users()
        self._worker_details(workers, skills)
        self._employer_details(employers)
        self._wallets_and_bids(workers, employers)
        self._payouts(workers)
        self._id_verification(workers)

        jobs = self._jobs(employers, workers)
        proposals = self._proposals(jobs, workers)
        self._invitations(jobs, workers)
        self._watchlist(jobs, workers)

        services = self._services(workers)
        self._favorites(services, employers)
        self._generic_favorites(workers, employers, jobs, services)
        buying_requests = self._buying_requests(services, employers)

        contracts = self._contracts(proposals, buying_requests)
        self._reviews(contracts)
        self._chat(contracts, jobs)
        self._invoices(contracts)
        self._affiliate(workers, employers, contracts)
        self._subscriptions(workers)
        self._notifications(workers, employers)
        self._tickets(workers, employers, contracts)
        self._withdrawals(contracts)
        self._audit(admin)

        self.stdout.write(self.style.SUCCESS(
            "\n✅ تم تعبئة قاعدة البيانات ببيانات تجريبية عربية كاملة.\n"
            f"   المستخدمون: {User.objects.count()} | الوظائف: {Job.objects.count()} | "
            f"العروض: {Proposal.objects.count()} | الخدمات: {Service.objects.count()} | "
            f"العقود: {Contract.objects.count()} | المراجعات: {Review.objects.count()}\n"
            f"   حساب الأدمن: admin{DEMO_DOMAIN} / كلمة المرور: {DEMO_PASSWORD}\n"
        ))

    # ───────────────────────────────────────────────────────── flush
    def _flush(self):
        """Wipe transactional data (in FK-safe order) + demo users. Reference data stays."""
        self.stdout.write(self.style.WARNING("⚠️  flushing transactional data…"))
        for model in (
            AffiliateCommission, Review, InvoiceLine, InvoiceRequest, TicketReply, Ticket,
            Message, ConversationMember, Conversation, ContractEvent, Submission, UpdateRequest,
            Contract, BuyingRequest, ServiceFavorite, ServiceAddon, Service,
            WatchlistItem, Invitation, ScreeningAnswer, ScreeningQuestion, Proposal, Job,
            Transaction, WithdrawalRequest, BidLedger, Referral, AffiliateProfile,
            CategorySubscription, Notification,
        ):
            model.objects.all().delete()
        # Wallets (incl. platform) — Transactions already gone, so PROTECT is satisfied.
        from apps.payments.models import Wallet
        Wallet.objects.all().delete()
        User.objects.filter(email__endswith=DEMO_DOMAIN).delete()  # cascades profiles, addresses…

    # ───────────────────────────────────────────────────────── reference extras
    def _faq(self):
        for order, (q, a, cat) in enumerate(FAQ):
            FAQItem.objects.get_or_create(
                question=q, defaults={"answer": a, "category": cat, "order": order, "is_published": True},
            )

    def _skills(self) -> dict:
        """Create catalog skills under their subcategory. Returns {slug: Skill}."""
        out = {}
        for sub_slug, items in SKILLS.items():
            sub = Category.objects.filter(slug=sub_slug).first()
            for name_ar, slug in items:
                skill, _ = Skill.objects.get_or_create(
                    slug=slug, defaults={"name_ar": name_ar, "subcategory": sub, "is_active": True},
                )
                out[slug] = skill
        return out

    # ───────────────────────────────────────────────────────── users
    def _users(self):
        workers, employers = {}, {}
        for key, first, last, phone in WORKERS:
            workers[key] = self._user(f"{key}{DEMO_DOMAIN}", first, last,
                                      mode=User.Mode.FIND_JOB, phone=phone)
        for key, first, last, phone in EMPLOYERS:
            employers[key] = self._user(f"{key}{DEMO_DOMAIN}", first, last,
                                        mode=User.Mode.FIND_WORKER, phone=phone)
        admin = self._user(f"admin{DEMO_DOMAIN}", "مدير", "المنصة",
                           mode=User.Mode.FIND_WORKER, is_staff=True, is_superuser=True)
        return workers, employers, admin

    def _user(self, email, first, last, *, mode, phone="", is_staff=False, is_superuser=False):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first, "last_name": last, "active_mode": mode, "phone": phone,
                "phone_verified": bool(phone), "status": User.Status.ACTIVE,
                "terms_accepted_at": NOW, "is_staff": is_staff, "is_superuser": is_superuser,
                "avatar_url": f"https://i.pravatar.cc/150?u={email}", "last_login": NOW,
            },
        )
        if created:
            user.set_password(DEMO_PASSWORD)  # lets the admin account log into /admin
            user.save(update_fields=["password"])
        # Both profiles exist for every account (dual-role model, lazily created).
        from apps.profiles.models import EmployerProfile, WorkerProfile
        WorkerProfile.objects.get_or_create(user=user)
        EmployerProfile.objects.get_or_create(user=user)
        return user

    def _worker_details(self, workers, skills):
        from apps.profiles.models import WorkerProfile
        skill_map = {
            "worker1": ["django", "react", "nodejs"],
            "worker2": ["figma", "adobe-xd", "ux-design"],
            "worker3": ["article-writing", "seo-writing"],
            "worker4": ["seo", "keyword-research", "social-media-mgmt"],
            "worker5": ["flutter", "react-native", "swift"],
            "worker6": ["ar-en-translation", "article-writing"],
        }
        # ppt slide-02/03/07: enriched profile per worker (display name, field+specialization,
        # years, availability, weekly hours, client notes, intro video, a certificate).
        extra = {
            "worker1": {"name": "أحمد المطيري", "cat": "programming-tech", "sub": "programming-tech-web-development", "years": 6, "avail": "available_now", "hours": 35, "notes": "متاح للمشاريع طويلة الأمد.", "video": "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "cert": ("شهادة Django للمحترفين", "Udemy", 2021)},
            "worker2": {"name": "سارة العنزي", "cat": "design-creative", "sub": "design-creative-graphic-design", "years": 5, "avail": "available_now", "hours": 30, "notes": "أهتم بالتفاصيل والهوية المتكاملة.", "video": "", "cert": ("Adobe Certified Professional", "Adobe", 2020)},
            "worker3": {"name": "منى الخالدي", "cat": "writing-translation", "sub": "writing-translation-content-writing", "years": 4, "avail": "available_soon", "hours": 25, "notes": "محتوى عربي أصيل ومحسّن للسيو.", "video": "", "cert": ("شهادة تسويق المحتوى", "HubSpot", 2022)},
            "worker4": {"name": "خالد الرشيد", "cat": "digital-marketing", "sub": None, "years": 7, "avail": "available_now", "hours": 40, "notes": "خبير سيو وحملات مدفوعة.", "video": "", "cert": ("Google Ads Certified", "Google", 2023)},
            "worker5": {"name": "فهد العتيبي", "cat": "programming-tech", "sub": "programming-tech-mobile-apps", "years": 5, "avail": "available_soon", "hours": 30, "notes": "تطبيقات موبايل عالية الأداء.", "video": "", "cert": ("Flutter Bootcamp", "Coursera", 2022)},
            "worker6": {"name": "نورة السالم", "cat": "writing-translation", "sub": "writing-translation-translation", "years": 8, "avail": "available_now", "hours": 20, "notes": "ترجمة دقيقة مع مراجعة لغوية.", "video": "", "cert": ("شهادة الترجمة المعتمدة", "ATA", 2019)},
        }
        for key, user in workers.items():
            wp = WorkerProfile.objects.get(user=user)
            title, overview, level, rate = WORKER_PROFILE[key]
            wp.bio_title = title
            wp.overview = overview
            wp.expertise_level = level
            wp.hourly_rate = D(rate)
            wp.visibility = WorkerProfile.Visibility.ONLINE
            ex = extra.get(key)
            if ex:
                wp.display_name = ex["name"]
                wp.main_category = Category.objects.filter(slug=ex["cat"]).first()
                wp.specialization = Category.objects.filter(slug=ex["sub"]).first() if ex["sub"] else None
                wp.years_experience = ex["years"]
                wp.availability = ex["avail"]
                wp.weekly_hours = ex["hours"]
                wp.client_notes = ex["notes"]
                wp.intro_video = ex["video"]
            wp.save()

            if ex and not wp.certificates.exists():
                cname, issuer, year = ex["cert"]
                Certificate.objects.create(
                    profile=wp, name=cname, issuer=issuer, cert_type="شهادة احترافية",
                    issued_year=year, skills=skill_map.get(key, [])[:2],
                )

            for slug in skill_map.get(key, []):
                if slug in skills:
                    WorkerSkill.objects.get_or_create(
                        profile=wp, skill=skills[slug],
                        defaults={"efficiency": WorkerSkill.Efficiency.ADVANCED},
                    )
            # Append-only children — only seed once (when none exist yet).
            if not wp.educations.exists():
                Education.objects.create(
                    profile=wp, school="جامعة الكويت", area_of_study="علوم الحاسب",
                    degree="بكالوريوس", date_from="2014", date_to="2018",
                    description="تخرّج بتقدير امتياز مع مرتبة الشرف.",
                )
            if not wp.employments.exists():
                Employment.objects.create(
                    profile=wp, company="شركة سابقة", job_title=title, city="الكويت",
                    country="الكويت", period_from="2018", period_to="حتى الآن",
                    description="عملت ضمن فريق متكامل على مشاريع متنوعة.",
                )
            if not wp.languages.exists():
                WorkerLanguage.objects.create(profile=wp, name="العربية",
                                              proficiency=WorkerLanguage.Proficiency.NATIVE)
                WorkerLanguage.objects.create(profile=wp, name="الإنجليزية",
                                              proficiency=WorkerLanguage.Proficiency.ADVANCED)
            if not wp.portfolio.exists():
                PortfolioItem.objects.create(
                    profile=wp, title=f"مشروع نموذجي — {title}",
                    description="نموذج من أعمالي السابقة يوضّح جودة التنفيذ والالتزام بالمواعيد.",
                    project_type=title, project_link="https://example.com",
                    duration_value=2, duration_unit="month",
                    skills=skill_map.get(key, [])[:3], completed_at="2023-06-01",
                    ownership_confirmed=True,
                )
            if not user.addresses.exists():
                Address.objects.create(user=user, country="الكويت", city="مدينة الكويت",
                                       state="العاصمة", time_zone="Asia/Kuwait", is_primary=True)

    def _employer_details(self, employers):
        from apps.profiles.models import EmployerProfile
        for key, user in employers.items():
            ep = EmployerProfile.objects.get(user=user)
            ep.company_name = EMPLOYER_COMPANY[key]
            ep.field = "تجارة إلكترونية"
            ep.country = "الكويت"
            ep.city = "مدينة الكويت"
            ep.timezone = "Asia/Kuwait"
            ep.save()
            if not user.addresses.exists():
                Address.objects.create(user=user, country="الكويت", city="حولي",
                                       time_zone="Asia/Kuwait", is_primary=True)

    # ───────────────────────────────────────────────────────── money + bids
    def _wallets_and_bids(self, workers, employers):
        get_platform_wallet()
        # Everyone gets the free signup grant; employers also top up their wallet.
        for user in list(workers.values()) + list(employers.values()):
            BidLedger.objects.get_or_create(
                user=user, reason=BidLedger.Reason.SIGNUP_GRANT,
                defaults={"delta": int(get_setting("bids.signup_grant", 10))},
            )
        for user in employers.values():
            self._deposit(user, 2000, key=f"seed-topup-{user.id}")
        # One worker buys a bid plan (needs available funds first).
        buyer = workers["worker1"]
        self._deposit(buyer, 100, key=f"seed-topup-{buyer.id}")
        plan = BidPlan.objects.order_by("bids_count").first()
        if plan and not BidLedger.objects.filter(user=buyer, reason=BidLedger.Reason.PURCHASE).exists():
            wallet = get_wallet(buyer)
            post(wallet, type=Transaction.Type.BID_PURCHASE, bucket=Transaction.Bucket.AVAILABLE,
                 amount=-plan.cost, note=f"شراء باقة «{plan.name}»",
                 idempotency_key=f"seed-bidplan-{buyer.id}")
            BidLedger.objects.create(user=buyer, delta=plan.bids_count,
                                     reason=BidLedger.Reason.PURCHASE, plan=plan)

    def _deposit(self, user, amount, *, key):
        post(get_wallet(user), type=Transaction.Type.DEPOSIT, bucket=Transaction.Bucket.AVAILABLE,
             amount=D(amount), gateway="paypal", note="شحن المحفظة", idempotency_key=key)

    def _cat(self, slug):
        return Category.objects.get(slug=slug)

    # ───────────────────────────────────────────────────────── jobs
    def _jobs(self, employers, workers):
        published = timezone.now()
        # key, employer, title, desc, cat, sub, status, budget_min/max, skills, [questions]
        specs = [
            ("job-web", "employer1", "تطوير متجر إلكتروني متكامل بـ Django",
             "نبحث عن مطوّر لبناء متجر إلكتروني متكامل يشمل سلة الشراء وبوابة الدفع ولوحة تحكم.",
             "programming-tech", "programming-tech-web-development", Job.Status.PUBLISHED,
             300, 800, ["django", "react"],
             ["كم عدد المتاجر التي طوّرتها سابقًا؟", "هل سبق أن دمجت بوابة دفع؟"]),
            ("job-mobile", "employer1", "تطبيق موبايل لخدمة التوصيل",
             "تطبيق توصيل بنظامي iOS وAndroid مع تتبّع مباشر للطلبات وإشعارات فورية.",
             "programming-tech", "programming-tech-mobile-apps", Job.Status.IN_PROGRESS,
             500, 1200, ["flutter"], []),
            ("job-logo", "employer2", "تصميم هوية بصرية لمتجر أزياء",
             "نحتاج تصميم شعار وهوية بصرية كاملة لمتجر أزياء عصري يستهدف الشباب.",
             "design-creative", "design-creative-graphic-design", Job.Status.PUBLISHED,
             150, 400, ["photoshop", "illustrator"],
             ["أرفق رابط معرض أعمالك."]),
            ("job-content", "employer3", "كتابة محتوى تسويقي لمدونة",
             "كتابة ١٠ مقالات تسويقية محسّنة لمحركات البحث في مجال الاستشارات الإدارية.",
             "writing-translation", "writing-translation-content-writing", Job.Status.COMPLETED,
             100, 300, ["article-writing", "seo-writing"], []),
            ("job-seo", "employer4", "تحسين محركات البحث لموقع شركة",
             "تحليل الموقع الحالي وتحسين ترتيبه في نتائج البحث لكلمات مفتاحية مستهدفة.",
             "digital-marketing", "digital-marketing-seo", Job.Status.PUBLISHED,
             200, 500, ["seo", "keyword-research"], []),
            ("job-draft", "employer2", "حملة إعلانية على السوشيال ميديا",
             "إدارة حملة إعلانية لمدة شهر على منصات التواصل الاجتماعي. (مسودة قيد الإعداد)",
             "digital-marketing", "digital-marketing-social-media", Job.Status.DRAFT,
             250, 600, ["social-media-mgmt"], []),
            ("job-review", "employer3", "مساعد افتراضي لإدخال البيانات",
             "مطلوب مساعد افتراضي لإدخال بيانات المنتجات في نظام إدارة المخزون. (بانتظار المراجعة)",
             "sales-support", None, Job.Status.PENDING_REVIEW, 80, 200, [], []),
        ]
        jobs = {}
        for i, (key, emp_key, title, desc, cat, sub, status, bmin, bmax, skill_slugs, questions) in enumerate(specs):
            slug = f"{slugify(title, allow_unicode=True)}-{i + 1}"
            emp = employers[emp_key]
            live = status in (Job.Status.PUBLISHED, Job.Status.IN_PROGRESS, Job.Status.COMPLETED)
            job, created = Job.objects.get_or_create(
                slug=slug,
                defaults={
                    "employer": emp, "title": title, "description": desc,
                    "category": self._cat(cat),
                    "subcategory": self._cat(sub) if sub else None,
                    "budget_min": D(bmin), "budget_max": D(bmax),
                    "deadline": (published + timedelta(days=30)).date(),
                    "location_type": Job.LocationType.REMOTE, "country": "الكويت", "city": "الكويت",
                    "status": status,
                    "published_at": published - timedelta(days=i) if live else None,
                    "expires_at": (published + timedelta(days=30)) if live else None,
                },
            )
            if created:
                all_skills = Skill.objects.filter(slug__in=skill_slugs)
                if all_skills:
                    job.skills.set(all_skills)
                for q_order, q in enumerate(questions):
                    ScreeningQuestion.objects.create(job=job, question=q, order=q_order, is_required=True)
            jobs[key] = job
        return jobs

    def _proposals(self, jobs, workers):
        # job_key -> [(worker_key, budget, days, status)]
        plan = {
            "job-web": [("worker1", 650, 21, Proposal.Status.SUBMITTED),
                        ("worker5", 700, 25, Proposal.Status.VIEWED)],
            "job-mobile": [("worker5", 1000, 30, Proposal.Status.ACCEPTED),
                           ("worker1", 1100, 28, Proposal.Status.REJECTED)],
            "job-logo": [("worker2", 350, 10, Proposal.Status.SUBMITTED)],
            "job-content": [("worker3", 250, 14, Proposal.Status.ACCEPTED),
                            ("worker6", 280, 12, Proposal.Status.REJECTED)],
            "job-seo": [("worker4", 400, 20, Proposal.Status.SUBMITTED)],
        }
        proposals = {}
        for job_key, rows in plan.items():
            job = jobs[job_key]
            for worker_key, budget, days, status in rows:
                worker = workers[worker_key]
                proposal, created = Proposal.objects.get_or_create(
                    job=job, worker=worker,
                    defaults={
                        "budget": D(budget), "delivery_days": days,
                        "description": "أهلاً، لديّ الخبرة المناسبة لتنفيذ هذا المشروع باحترافية وفي الموعد المحدد. "
                                       "سأبدأ فورًا بعد الاتفاق وأوافيك بتحديثات دورية.",
                        "status": status, "bid_consumed": True,
                        "viewed_at": NOW if status != Proposal.Status.SUBMITTED else None,
                    },
                )
                if created:
                    # Mirror the real flow: submitting a proposal consumes one bid.
                    BidLedger.objects.create(user=worker, delta=-1,
                                             reason=BidLedger.Reason.CONSUME, proposal=proposal)
                    job.proposals_count = job.proposals.count()
                    job.save(update_fields=["proposals_count"])
                    # Answer the job's screening questions.
                    for q in job.screening_questions.all():
                        ScreeningAnswer.objects.get_or_create(
                            proposal=proposal, question=q,
                            defaults={"answer": "نعم، لديّ خبرة سابقة موثّقة في هذا المجال."},
                        )
                proposals[(job_key, worker_key)] = proposal
        return proposals

    def _invitations(self, jobs, workers):
        invites = [("job-web", "worker1"), ("job-logo", "worker2")]
        for job_key, worker_key in invites:
            job = jobs[job_key]
            Invitation.objects.get_or_create(
                job=job, worker=workers[worker_key],
                defaults={"employer": job.employer, "status": Invitation.Status.SENT,
                          "private_message": "أعجبني ملفك الشخصي، يسعدنا تقديمك عرضًا على هذه الوظيفة."},
            )

    def _watchlist(self, jobs, workers):
        watch = [("worker3", "job-content"), ("worker4", "job-seo"), ("worker1", "job-mobile")]
        for worker_key, job_key in watch:
            WatchlistItem.objects.get_or_create(worker=workers[worker_key], job=jobs[job_key])

    # ───────────────────────────────────────────────────────── services
    def _services(self, workers):
        # key, worker, title, desc, cat, sub, price, days, status, [(addon, price, days)]
        specs = [
            ("svc-landing", "worker1", "تصميم وبرمجة صفحة هبوط احترافية",
             "أصمّم وأبرمج صفحة هبوط سريعة ومتجاوبة مع جميع الأجهزة وجاهزة لمحركات البحث.",
             "programming-tech", "programming-tech-web-development", 120, 5, Service.Status.LIVE,
             [("صفحة إضافية", 40, 2), ("دعم فني لمدة شهر", 30, 0)]),
            ("svc-logo", "worker2", "تصميم شعار احترافي بهوية كاملة",
             "شعار عصري مع ٣ خيارات وملفات مفتوحة المصدر ودليل استخدام الهوية.",
             "design-creative", "design-creative-graphic-design", 80, 3, Service.Status.LIVE,
             [("ملفات المصدر", 25, 1)]),
            ("svc-articles", "worker3", "كتابة ٥ مقالات SEO عربية",
             "محتوى عربي أصلي ومحسّن لمحركات البحث في مجال تخصصك.",
             "writing-translation", "writing-translation-content-writing", 60, 4, Service.Status.LIVE,
             [("مقالات إضافية ×٣", 30, 2)]),
            ("svc-translate", "worker6", "ترجمة احترافية حتى ٢٠٠٠ كلمة",
             "ترجمة دقيقة عربي/إنجليزي مع مراجعة لغوية كاملة.",
             "writing-translation", "writing-translation-translation", 45, 2, Service.Status.LIVE,
             []),
            ("svc-draft", "worker5", "تطوير تطبيق موبايل بسيط (مسودة)",
             "خدمة قيد الإعداد لتطوير تطبيقات بسيطة.",
             "programming-tech", "programming-tech-mobile-apps", 300, 14, Service.Status.DRAFT,
             []),
        ]
        services = {}
        for i, (key, w_key, title, desc, cat, sub, price, days, status, addons) in enumerate(specs):
            slug = f"{slugify(title, allow_unicode=True)}-{i + 1}"
            worker = workers[w_key]
            service, created = Service.objects.get_or_create(
                slug=slug,
                defaults={
                    "worker": worker, "title": title, "description": desc,
                    "category": self._cat(cat), "subcategory": self._cat(sub) if sub else None,
                    "base_price": D(price), "delivery_days": days, "status": status,
                    "published_at": NOW if status == Service.Status.LIVE else None,
                    "keywords": title.split()[:4],
                    "what_you_get": "ملفات العمل النهائية + جولتا تعديل مجانيتان + تسليم ضمن المدة المحددة + دعم بعد التسليم.",
                },
            )
            if created:
                for a_title, a_price, a_days in addons:
                    ServiceAddon.objects.create(service=service, title=a_title,
                                                price=D(a_price), extra_days=a_days)
            services[key] = service
        return services

    def _favorites(self, services, employers):
        """Employers favorite a few live services (keeps the denorm counter coherent)."""
        favs = [
            ("employer1", "svc-logo"), ("employer1", "svc-articles"),
            ("employer2", "svc-landing"), ("employer4", "svc-translate"),
        ]
        for emp_key, svc_key in favs:
            service = services[svc_key]
            _, created = ServiceFavorite.objects.get_or_create(
                user=employers[emp_key], service=service,
            )
            if created:
                service.favorites_count = service.favorites.count()
                service.save(update_fields=["favorites_count"])

    def _payouts(self, workers):
        """A default PayPal payout method per worker (ppt slides 38–42)."""
        for user in workers.values():
            PayoutMethod.objects.get_or_create(
                user=user, kind=PayoutMethod.Kind.PAYPAL,
                defaults={"label": "PayPal الأساسي", "details": {"email": user.email}, "is_default": True},
            )

    def _id_verification(self, workers):
        """Seed ID verification — some approved, one pending (ppt slide-08)."""
        statuses = {
            "worker1": IDVerification.Status.APPROVED,
            "worker2": IDVerification.Status.APPROVED,
            "worker3": IDVerification.Status.PENDING,
        }
        for key, status in statuses.items():
            user = workers.get(key)
            if user:
                IDVerification.objects.update_or_create(
                    user=user,
                    defaults={"status": status, "doc_type": "national_id", "consent": True},
                )
                if status == IDVerification.Status.APPROVED:
                    # mirror the admin-approval side effect so the «موثّق» badge shows in the UI
                    from apps.profiles.models import WorkerProfile
                    WorkerProfile.objects.filter(user=user).update(is_verified=True)

    def _generic_favorites(self, workers, employers, jobs, services):
        """Polymorphic favourites (ppt slide-43): jobs, freelancers, portfolio works."""
        for job_key in ("job-web", "job-logo"):
            job = jobs.get(job_key)
            if job:
                Favorite.objects.get_or_create(user=workers["worker1"], kind="job", object_id=job.id)
        for w_key in ("worker2", "worker5"):  # object_id = the freelancer's USER id
            w = workers.get(w_key)
            if w:
                Favorite.objects.get_or_create(user=employers["employer1"], kind="freelancer", object_id=w.id)
        item = PortfolioItem.objects.filter(profile__user=workers["worker3"]).first()
        if item:
            Favorite.objects.get_or_create(user=workers["worker2"], kind="portfolio", object_id=item.id)

    def _buying_requests(self, services, employers):
        # service_key, employer, qty, status
        specs = [
            ("svc-landing", "employer3", 1, BuyingRequest.Status.ACCEPTED),
            ("svc-logo", "employer4", 1, BuyingRequest.Status.PENDING),
            ("svc-articles", "employer2", 2, BuyingRequest.Status.REJECTED),
        ]
        out = {}
        for key, emp_key, qty, status in specs:
            service = services[key]
            emp = employers[emp_key]
            total = service.base_price * qty
            br, created = BuyingRequest.objects.get_or_create(
                service=service, employer=emp, status=status,
                defaults={
                    "quantity": qty, "total_price": total, "delivery_days": service.delivery_days,
                    "description": "أرجو تنفيذ الطلب وفق التفاصيل المرفقة وبأعلى جودة ممكنة.",
                    "reject_reason": "خارج نطاق الخدمة حاليًا." if status == BuyingRequest.Status.REJECTED else "",
                },
            )
            out[key] = br
        return out

    # ───────────────────────────────────────────────────────── contracts
    def _contracts(self, proposals, buying_requests):
        contracts = {}
        # From accepted proposals: (proposal_key, contract_status)
        from_props = [
            (("job-mobile", "worker5"), Contract.Status.ACTIVE),
            (("job-content", "worker3"), Contract.Status.COMPLETED),
        ]
        for prop_key, status in from_props:
            proposal = proposals[prop_key]
            contracts[prop_key] = self._make_contract(
                status, employer=proposal.job.employer, worker=proposal.worker,
                title=proposal.job.title, budget=proposal.budget, proposal=proposal, job=proposal.job,
            )
        # From the accepted buying request → a delivered service contract.
        br = buying_requests["svc-landing"]
        contracts["svc-landing"] = self._make_contract(
            Contract.Status.DELIVERED, employer=br.employer, worker=br.service.worker,
            title=br.service.title, budget=br.total_price, service=br.service, buying_request=br,
        )
        return contracts

    def _make_contract(self, status, *, employer, worker, title, budget, proposal=None,
                       job=None, service=None, buying_request=None):
        pct = D(get_setting("payments.commission_pct", 10))
        commission = (budget * pct / D(100)).quantize(D("0.01"))
        earning = budget - commission

        lookup = {"proposal": proposal} if proposal else {"buying_request": buying_request}
        completed = status == Contract.Status.COMPLETED
        active_like = status in (Contract.Status.ACTIVE, Contract.Status.DELIVERED, Contract.Status.DISPUTED)
        contract, created = Contract.objects.get_or_create(
            **lookup,
            defaults={
                "job": job, "service": service, "employer": employer, "worker": worker,
                "title": title, "scope": "تنفيذ المشروع وفق المتطلبات المتفق عليها مع التزام بالجودة والمواعيد.",
                "budget": budget, "deadline": (NOW + timedelta(days=20)).date(),
                "commission_pct": pct, "commission_amount": commission, "worker_earning": earning,
                "status": status,
                "activated_at": NOW - timedelta(days=5) if (active_like or completed) else None,
                "delivered_at": NOW - timedelta(days=1) if status in (Contract.Status.DELIVERED,) or completed else None,
                "completed_at": NOW if completed else None,
                "warranty_ends_at": (NOW + timedelta(days=14)) if completed else None,
                "funds_released": completed,
            },
        )
        if not created:
            return contract

        # Money: hold escrow for live contracts; release split on completion.
        cid = contract.pk
        emp_wallet = get_wallet(employer)
        wkr_wallet = get_wallet(worker)
        plat_wallet = get_platform_wallet()
        if active_like or completed:
            self._deposit(employer, budget, key=f"seed-c{cid}-emp-deposit")
            post(emp_wallet, type=Transaction.Type.CONTRACT_HOLD, bucket=Transaction.Bucket.AVAILABLE,
                 amount=-budget, note=f"حجز ضمان للعقد #{cid}", idempotency_key=f"seed-c{cid}-hold-out")
            post(emp_wallet, type=Transaction.Type.CONTRACT_HOLD, bucket=Transaction.Bucket.ESCROW_HELD,
                 amount=budget, note=f"حجز ضمان للعقد #{cid}", idempotency_key=f"seed-c{cid}-hold-in")
            post(wkr_wallet, type=Transaction.Type.EARNING, bucket=Transaction.Bucket.EARNINGS_PENDING,
                 amount=earning, note=f"أرباح معلّقة من العقد #{cid}", idempotency_key=f"seed-c{cid}-earn-pending")
        if completed:
            post(emp_wallet, type=Transaction.Type.CONTRACT_RELEASE, bucket=Transaction.Bucket.ESCROW_HELD,
                 amount=-budget, note=f"تحرير ضمان العقد #{cid}", idempotency_key=f"seed-c{cid}-release")
            post(wkr_wallet, type=Transaction.Type.EARNING, bucket=Transaction.Bucket.EARNINGS_PENDING,
                 amount=-earning, note=f"تحويل أرباح العقد #{cid}", idempotency_key=f"seed-c{cid}-earn-move")
            post(wkr_wallet, type=Transaction.Type.EARNING, bucket=Transaction.Bucket.AVAILABLE,
                 amount=earning, note=f"أرباح متاحة من العقد #{cid}", idempotency_key=f"seed-c{cid}-earn-avail")
            post(plat_wallet, type=Transaction.Type.COMMISSION, bucket=Transaction.Bucket.AVAILABLE,
                 amount=commission, note=f"عمولة المنصة من العقد #{cid}", idempotency_key=f"seed-c{cid}-commission")
            # Keep the denormalized totals coherent.
            self._bump_totals(worker, employer, earning, budget)

        # Lifecycle audit trail + a worker submission.
        ContractEvent.objects.create(contract=contract, kind="created", actor=employer,
                                     detail="تم إنشاء العقد")
        if active_like or completed:
            ContractEvent.objects.create(contract=contract, kind="funded", actor=employer,
                                         detail="تم تمويل العقد وبدء العمل")
            Submission.objects.create(
                contract=contract,
                notes="تم تسليم العمل المتفق عليه، بانتظار المراجعة." if not completed else "تم التسليم والقبول.",
                status=Submission.Status.ACCEPTED if completed else Submission.Status.OPEN,
                decided_at=NOW if completed else None,
            )
        if completed:
            ContractEvent.objects.create(contract=contract, kind="completed", actor=employer,
                                         detail="تم قبول التسليم وإتمام العقد")
        if status == Contract.Status.ACTIVE:
            # An open mid-flight term-change request to exercise that table.
            UpdateRequest.objects.create(
                contract=contract, requested_by=worker, new_deadline=(NOW + timedelta(days=30)).date(),
                message="أحتاج تمديد الموعد أسبوعًا إضافيًا لضمان الجودة.",
                status=UpdateRequest.Status.PENDING,
            )
        return contract

    def _bump_totals(self, worker, employer, earning, budget):
        from apps.profiles.models import EmployerProfile, WorkerProfile
        wp = WorkerProfile.objects.get(user=worker)
        wp.total_earned = (wp.total_earned or D(0)) + earning
        wp.save(update_fields=["total_earned"])
        ep = EmployerProfile.objects.get(user=employer)
        ep.total_spent = (ep.total_spent or D(0)) + budget
        ep.save(update_fields=["total_spent"])

    # ───────────────────────────────────────────────────────── reviews
    def _reviews(self, contracts):
        completed = [c for c in contracts.values() if c.status == Contract.Status.COMPLETED]
        for contract in completed:
            self._review(contract, contract.employer, contract.worker, 5,
                         "عمل ممتاز واحترافي، التزم بالموعد وتجاوز توقعاتي. أنصح به بشدة.")
            self._review(contract, contract.worker, contract.employer, 5,
                         "عميل متعاون وواضح في متطلباته، الدفع تم بسلاسة. شكراً للتعامل الراقي.")
            self._refresh_ratings(contract.worker)
            self._refresh_ratings(contract.employer)

    def _review(self, contract, author, subject, rating, comment):
        Review.objects.get_or_create(
            contract=contract, author=author,
            defaults={"subject": subject, "rating": rating, "comment": comment, "is_locked": False},
        )

    def _refresh_ratings(self, user):
        from django.db.models import Avg, Count

        from apps.profiles.models import EmployerProfile, WorkerProfile
        agg = Review.objects.filter(subject=user).aggregate(a=Avg("rating"), c=Count("id"))
        avg, count = (agg["a"] or 0), agg["c"]
        for Model in (WorkerProfile, EmployerProfile):
            obj = Model.objects.filter(user=user).first()
            if obj:
                obj.rating_avg = round(avg, 2)
                obj.rating_count = count
                obj.save(update_fields=["rating_avg", "rating_count"])

    # ───────────────────────────────────────────────────────── chat
    def _chat(self, contracts, jobs):
        for contract in contracts.values():
            self._conversation(
                contract.employer, contract.worker,
                context_type=Conversation.Context.CONTRACT, contract=contract,
                messages=[
                    (contract.employer, "مرحباً، سعيد ببدء العمل معك على هذا المشروع."),
                    (contract.worker, "أهلاً بك، تم استلام التفاصيل وسأبدأ التنفيذ فورًا."),
                    (contract.employer, "ممتاز، بانتظار التحديثات الأولى."),
                ],
            )
        # A proposal-context conversation on an open job.
        job = jobs["job-web"]
        first_proposal = job.proposals.first()
        if first_proposal:
            self._conversation(
                job.employer, first_proposal.worker,
                context_type=Conversation.Context.PROPOSAL, job=job,
                messages=[
                    (job.employer, "أهلاً، اطّلعت على عرضك ولديّ بعض الأسئلة حول الجدول الزمني."),
                    (first_proposal.worker, "تفضّل، يسعدني الإجابة على كل استفساراتك."),
                ],
            )

    def _conversation(self, u1, u2, *, context_type, contract=None, job=None, messages):
        user_a, user_b = (u1, u2) if u1.id < u2.id else (u2, u1)
        conv, _ = Conversation.objects.get_or_create(
            user_a=user_a, user_b=user_b, context_type=context_type, contract=contract, job=job,
            defaults={"status": Conversation.Status.ACTIVE},
        )
        for user in (user_a, user_b):
            ConversationMember.objects.get_or_create(
                conversation=conv, user=user, defaults={"last_read_at": NOW},
            )
        if not conv.messages.exists():
            last = None
            for sender, body in messages:
                last = Message.objects.create(conversation=conv, sender=sender, body=body)
            conv.last_message_snippet = messages[-1][1][:160]
            conv.last_message_at = last.created_at if last else NOW
            conv.save(update_fields=["last_message_snippet", "last_message_at"])

    # ───────────────────────────────────────────────────────── invoices
    def _invoices(self, contracts):
        completed = [c for c in contracts.values() if c.status == Contract.Status.COMPLETED]
        for i, contract in enumerate(completed):
            number = f"INV-2026-{i + 1:04d}"
            invoice, created = InvoiceRequest.objects.get_or_create(
                number=number,
                defaults={
                    "worker": contract.worker, "employer": contract.employer,
                    "period_type": InvoiceRequest.Period.MONTH,
                    "period_start": (NOW - timedelta(days=30)).date(), "period_end": NOW.date(),
                    "total": contract.worker_earning, "status": InvoiceRequest.Status.CONFIRMED,
                    "confirmed_at": NOW, "notes": "فاتورة عن الأعمال المنجزة خلال الشهر.",
                    "pdf_url": f"/media/invoices/{number}.pdf",
                },
            )
            if created:
                InvoiceLine.objects.create(
                    invoice=invoice, contract=contract,
                    description=f"عقد: {contract.title}", amount=contract.worker_earning,
                )

    # ───────────────────────────────────────────────────────── affiliate
    def _affiliate(self, workers, employers, contracts):
        referrer = workers["worker1"]
        AffiliateProfile.objects.get_or_create(
            user=referrer, defaults={"slug": slugify(f"aff-{referrer.id}"), "total_earned": D(0)},
        )
        # worker3 was referred by worker1.
        referred = workers["worker3"]
        Referral.objects.get_or_create(
            referred_user=referred,
            defaults={"referrer": referrer, "earning_window_end": (NOW + timedelta(days=180)).date()},
        )
        # Accrue commission on the completed contract where the referred user is a party.
        for contract in contracts.values():
            if contract.status == Contract.Status.COMPLETED and contract.worker_id == referred.id:
                base = contract.commission_amount
                rate = D(5)
                amount = (base * rate / D(100)).quantize(D("0.01"))
                _, created = AffiliateCommission.objects.get_or_create(
                    contract=contract, referred_user=referred,
                    defaults={"referrer": referrer, "base_amount": base, "rate_pct": rate,
                              "amount": amount, "status": AffiliateCommission.Status.ACCRUED},
                )
                if created:
                    post(get_wallet(referrer), type=Transaction.Type.AFFILIATE,
                         bucket=Transaction.Bucket.AVAILABLE, amount=amount,
                         note=f"عمولة إحالة من العقد #{contract.pk}",
                         idempotency_key=f"seed-aff-{contract.pk}-{referred.id}")
                    ap = AffiliateProfile.objects.get(user=referrer)
                    ap.total_earned = (ap.total_earned or D(0)) + amount
                    ap.save(update_fields=["total_earned"])

    # ───────────────────────────────────────────────────────── subscriptions
    def _subscriptions(self, workers):
        subs = [
            ("worker1", "programming-tech", "programming-tech-web-development"),
            ("worker2", "design-creative", None),
            ("worker4", "digital-marketing", "digital-marketing-seo"),
        ]
        for worker_key, cat_slug, sub_slug in subs:
            CategorySubscription.objects.get_or_create(
                user=workers[worker_key], category=self._cat(cat_slug),
                subcategory=self._cat(sub_slug) if sub_slug else None,
            )

    # ───────────────────────────────────────────────────────── notifications
    def _notifications(self, workers, employers):
        rows = [
            (workers["worker5"], Notification.Kind.CONTRACT, "تم قبول عرضك 🎉",
             "هنّأتك! تم قبول عرضك على وظيفة «تطبيق موبايل لخدمة التوصيل».", "/contracts"),
            (workers["worker3"], Notification.Kind.PAYMENT, "تم تحرير أرباحك 💰",
             "تم تحرير أرباح عقدك المكتمل إلى محفظتك.", "/wallet"),
            (workers["worker1"], Notification.Kind.PROPOSAL, "تمت مشاهدة عرضك",
             "اطّلع صاحب العمل على عرضك المقدّم.", "/proposals"),
            (employers["employer1"], Notification.Kind.PROPOSAL, "عرض جديد على وظيفتك",
             "تلقّيت عرضًا جديدًا على وظيفة «تطوير متجر إلكتروني».", "/jobs"),
            (employers["employer3"], Notification.Kind.SUBMISSION, "تسليم جديد بانتظار مراجعتك",
             "قام المستقل بتسليم العمل، يرجى المراجعة.", "/contracts"),
        ]
        for user, kind, title, body, link in rows:
            Notification.objects.get_or_create(
                user=user, kind=kind, title=title,
                defaults={"body": body, "deep_link": link,
                          "read_at": None, "emailed": True, "pushed": True},
            )

    # ───────────────────────────────────────────────────────── tickets
    def _tickets(self, workers, employers, contracts):
        general = TicketType.objects.filter(slug="general").first()
        dispute = TicketType.objects.filter(is_dispute=True).first()
        # A normal answered ticket.
        if general:
            ticket, created = Ticket.objects.get_or_create(
                user=workers["worker2"], type=general, title="استفسار عن طريقة سحب الأرباح",
                defaults={"message": "مرحباً، كيف يمكنني سحب أرباحي إلى حساب PayPal؟",
                          "status": Ticket.Status.ANSWERED},
            )
            if created:
                TicketReply.objects.create(
                    ticket=ticket, author=workers["worker2"],
                    message="بانتظار ردّكم، شكراً.", is_staff=False)
                TicketReply.objects.create(
                    ticket=ticket, author=employers["employer1"],
                    message="أهلاً بك، يمكنك طلب السحب من صفحة المحفظة بحدّ أدنى ١٠ دولارات.",
                    is_staff=True)
        # A dispute ticket linked to a contract.
        disputed_contract = next(iter(contracts.values()), None)
        if dispute and disputed_contract:
            Ticket.objects.get_or_create(
                user=disputed_contract.employer, type=dispute,
                title=f"نزاع حول العقد #{disputed_contract.pk}",
                defaults={"message": "هناك خلاف حول نطاق التسليم، أرجو التدخّل.",
                          "status": Ticket.Status.OPEN, "contract": disputed_contract},
            )

    # ───────────────────────────────────────────────────────── withdrawals
    def _withdrawals(self, contracts):
        """A worker with cleared earnings (completed contract) requests one payout."""
        from apps.payments.services import request_withdrawal
        completed = [c for c in contracts.values() if c.status == Contract.Status.COMPLETED]
        if not completed:
            return
        worker = completed[0].worker
        if worker.withdrawals.exists():
            return  # idempotent — only ever one demo withdrawal for this worker
        if get_wallet(worker).available >= D(10):
            request_withdrawal(worker, D(10), worker.email)

    # ───────────────────────────────────────────────────────── audit / settings log
    def _audit(self, admin):
        if not AuditLog.objects.filter(action="seed.bootstrap").exists():
            AuditLog.objects.create(actor=admin, action="seed.bootstrap", model="core",
                                    object_id="0", ip="127.0.0.1",
                                    after={"note": "تهيئة البيانات التجريبية"})
        if not SettingChangeLog.objects.filter(key="seed.demo").exists():
            SettingChangeLog.objects.create(key="seed.demo", old_value=None,
                                            new_value={"seeded": True}, changed_by=admin)
