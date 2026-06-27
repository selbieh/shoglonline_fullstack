"""Seed a funded, active job lifecycle for the E2E (Playwright) suite.

Builds — deterministically and fast, via the service layer — the whole pre-chat state the UI
lifecycle spec needs: a published freelancer (profile + service + portfolio), a published job, a
submitted proposal, a funded client wallet, and an accepted proposal that auto-opens an ACTIVE
contract + conversation. Prints the resulting ids as JSON on stdout so the spec can navigate to the
exact job/contract/conversation. The spec then drives the chat + delivery + release through the UI.

This is the code-to-design seam for E2E only (parallels `release_warranties --contract`); it is never
wired into production startup. Re-running it creates a fresh job/proposal/contract for the same two
accounts.

Usage:
  python manage.py seed_lifecycle --client client@e2e.test --worker freelancer@e2e.test
"""
import json
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import User
from apps.bids.models import BidLedger
from apps.catalog.models import Category
from apps.core.services import set_setting
from apps.gigs.models import Service
from apps.jobs import services as js
from apps.jobs.models import Job
from apps.payments import services as pay
from apps.payments.models import Transaction
from apps.profiles.models import Education, Employment, PortfolioItem, WorkerProfile

BUDGET = Decimal("150")
DEPOSIT = Decimal("500")


class Command(BaseCommand):
    help = "Seed a funded active contract + conversation for the E2E lifecycle spec (prints JSON)."

    def add_arguments(self, parser):
        parser.add_argument("--client", required=True, help="employer account email")
        parser.add_argument("--worker", required=True, help="freelancer account email")

    def handle(self, *args, **options):
        # land objects published/live directly (no admin-review detour)
        set_setting("profiles.auto_publish", True)
        set_setting("services.auto_publish", True)
        set_setting("jobs.auto_publish", True)
        set_setting("proposals.auto_publish", True)
        set_setting("payments.commission_pct", 10)
        set_setting("contracts.warranty_days", 60)

        employer, _ = User.objects.get_or_create(email=options["client"], defaults={"first_name": "عميل"})
        worker, _ = User.objects.get_or_create(email=options["worker"], defaults={"first_name": "مستقل"})
        # keep the worker in bids across repeated seed runs (each run consumes one on submit)
        from apps.bids.services import bid_balance
        if bid_balance(worker) < 1:
            BidLedger.objects.create(user=worker, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)

        category, _ = Category.objects.get_or_create(
            slug="dev", defaults={"name_ar": "برمجة وتطوير", "name_en": "Development"})

        # ---- freelancer: published profile (≥70%) + a live service + a portfolio item ----
        profile, _ = WorkerProfile.objects.get_or_create(user=worker)
        profile.bio_title = "مطوّر واجهات"
        profile.overview = "نبذة كافية عن الخبرة والمشاريع السابقة لإكمال الملف"
        profile.expertise_level = WorkerProfile.ExpertiseLevel.EXPERT
        profile.hourly_rate = 20
        profile.publish_state = WorkerProfile.PublishState.PUBLISHED
        profile.save()
        Education.objects.get_or_create(profile=profile, school="جامعة")
        Employment.objects.get_or_create(profile=profile, company="شركة", job_title="مطوّر")
        Service.objects.get_or_create(
            worker=worker, title="تصميم واجهات احترافية",
            defaults={"description": "أصمّم واجهات ويب حديثة ومتجاوبة بدقة عالية وجودة ممتازة",
                      "category": category, "base_price": Decimal("120"), "delivery_days": 5,
                      "status": Service.Status.LIVE, "published_at": timezone.now()})
        PortfolioItem.objects.get_or_create(
            profile=profile, title="مشروع متجر إلكتروني",
            defaults={"media_type": PortfolioItem.MediaType.LINK, "url": "https://example.com/work"})

        # ---- client: published job (via the publish service so the slug is generated) ----
        job = Job.objects.create(
            employer=employer, title="بناء موقع تعريفي", description="وصف تفصيلي للوظيفة وكامل المتطلبات",
            category=category, budget_min=Decimal("100"), budget_max=Decimal("300"))
        job = js.submit_for_publication(job)

        # ---- freelancer applies ----
        proposal = js.submit_proposal(
            worker=worker, job=job, budget=BUDGET, delivery_days=10,
            description="خطة تنفيذ مفصّلة للمشروع", answers={})

        # ---- client funds wallet, then accepts → active contract + conversation ----
        pay.post(pay.get_wallet(employer), type=Transaction.Type.DEPOSIT,
                 bucket=Transaction.Bucket.AVAILABLE, amount=DEPOSIT, note="e2e seed")
        contract = js.accept_proposal(proposal)
        conversation = contract.conversations.first()

        self.stdout.write(json.dumps({
            "employer_id": employer.id,
            "worker_id": worker.id,
            "job_id": job.id,
            "job_slug": job.slug,
            "proposal_id": proposal.id,
            "contract_id": contract.id,
            "conversation_id": conversation.id if conversation else None,
            "budget": str(BUDGET),
            "worker_earning": str(contract.worker_earning),
        }))
