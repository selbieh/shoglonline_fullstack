"""Seed the *baseline* two accounts the full-workflow E2E (Playwright) suite drives through the UI.

Unlike `seed_lifecycle` (which pre-builds a funded, ACTIVE contract so the chat spec can start
mid-journey), this command deliberately stops BEFORE any job / proposal / contract exists: the
`full-workflow` spec creates the job, funds the wallet, applies, accepts, delivers, approves and
withdraws entirely through real browser clicks. All this command guarantees is a clean, deterministic
starting point:

  * platform settings tuned so objects land published/accepted without an admin-review detour,
  * an employer account (mode = hire) and a worker account (mode = find-a-job),
  * the worker publishable + in bids so they can actually submit a proposal,
  * a saved PayPal payout method for the worker (the wallet withdrawal button stays disabled without
    one — see frontend/app/wallet/page.tsx),
  * at least one catalog category (so the job-create category picker has an option).

Setting `active_mode` also makes stub login return `first_login=false`, so the spec's direct page
navigations aren't bounced to /onboarding/mode (auth/api/views.py: `first_login = created or not
active_mode`).

Idempotent — re-running reuses the same two accounts and tops the worker's bids back up. Prints the
resulting handles as JSON on stdout so the spec can log in as each party.

This is an E2E-only seam (parallels `seed_lifecycle` / `release_warranties --contract`); it is never
wired into production startup.

Usage:
  python manage.py seed_e2e --employer employer@e2e.test --worker worker@e2e.test
"""
import json

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.bids.models import BidLedger
from apps.bids.services import bid_balance
from apps.catalog.models import Category
from apps.core.services import set_setting
from apps.payments.models import PayoutMethod
from apps.profiles.models import Education, Employment, WorkerProfile


class Command(BaseCommand):
    help = "Seed the baseline employer + worker accounts for the full-workflow E2E spec (prints JSON)."

    def add_arguments(self, parser):
        parser.add_argument("--employer", default="employer@e2e.test", help="employer account email")
        parser.add_argument("--worker", default="worker@e2e.test", help="freelancer account email")

    def handle(self, *args, **options):
        # Land jobs/proposals/profiles live directly (no admin-review detour) and pin the money knobs
        # the spec asserts against (10% commission, 60-day warranty).
        set_setting("profiles.auto_publish", True)
        set_setting("jobs.auto_publish", True)
        set_setting("proposals.auto_publish", True)
        set_setting("payments.commission_pct", 10)
        set_setting("contracts.warranty_days", 60)

        employer, _ = User.objects.get_or_create(
            email=options["employer"],
            defaults={"first_name": "عميل", "active_mode": User.Mode.FIND_WORKER},
        )
        if not employer.active_mode:  # ensure first_login=false on stub sign-in
            employer.active_mode = User.Mode.FIND_WORKER
            employer.save(update_fields=["active_mode"])

        worker, _ = User.objects.get_or_create(
            email=options["worker"],
            defaults={"first_name": "مستقل", "active_mode": User.Mode.FIND_JOB},
        )
        if not worker.active_mode:
            worker.active_mode = User.Mode.FIND_JOB
            worker.save(update_fields=["active_mode"])

        # Keep the worker in bids across repeated runs (each UI apply consumes one on submit).
        if bid_balance(worker) < 5:
            BidLedger.objects.create(user=worker, delta=10, reason=BidLedger.Reason.SIGNUP_GRANT)

        # A published worker profile (≥70% complete) so the worker may submit a proposal.
        profile, _ = WorkerProfile.objects.get_or_create(user=worker)
        profile.bio_title = "مطوّر واجهات"
        profile.overview = "نبذة كافية عن الخبرة والمشاريع السابقة لإكمال الملف الشخصي"
        profile.expertise_level = WorkerProfile.ExpertiseLevel.EXPERT
        profile.hourly_rate = 20
        profile.publish_state = WorkerProfile.PublishState.PUBLISHED
        profile.save()
        Education.objects.get_or_create(profile=profile, school="جامعة")
        Employment.objects.get_or_create(profile=profile, company="شركة", job_title="مطوّر")

        # A saved PayPal payout method — the wallet withdrawal button is disabled without one.
        PayoutMethod.objects.get_or_create(
            user=worker,
            kind=PayoutMethod.Kind.PAYPAL,
            defaults={
                "label": "PayPal E2E",
                "details": {"paypal_email": worker.email},
                "is_default": True,
            },
        )

        # At least one catalog category for the job-create picker (seed_catalog usually already ran).
        category, _ = Category.objects.get_or_create(
            slug="dev", defaults={"name_ar": "برمجة وتطوير", "name_en": "Development"}
        )

        self.stdout.write(json.dumps({
            "employer_email": employer.email,
            "worker_email": worker.email,
            "employer_id": employer.id,
            "worker_id": worker.id,
            "category_slug": category.slug,
        }))
