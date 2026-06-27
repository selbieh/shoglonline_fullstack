"""Release contract warranties on demand.

Production runs this hourly as the `release-due-warranties` Celery beat task; this command exposes
the same release for ops and for E2E tests that can't wait 60 days for the warranty window. With
`--contract <id>` it force-expires that contract's warranty (sets `warranty_ends_at` into the past)
and releases it immediately — the seam the Playwright lifecycle spec shells into to drive the
worker's earnings into `available` and flip the chat read-only. With no argument it runs the normal
due sweep.
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.contracts.models import Contract
from apps.contracts.services import release_warranty
from apps.contracts.tasks import release_due_warranties


class Command(BaseCommand):
    help = "Release due contract warranties (or force-release one with --contract for E2E)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--contract", type=int, default=None,
            help="Force-expire and release this contract's warranty now (E2E helper).",
        )

    def handle(self, *args, **options):
        contract_id = options["contract"]
        if contract_id is not None:
            contract = Contract.objects.get(pk=contract_id)
            # pull the warranty window into the past so the (idempotent) release fires immediately
            Contract.objects.filter(pk=contract.pk).update(
                warranty_ends_at=timezone.now() - timedelta(days=1))
            release_warranty(contract.refresh_from_db() or contract)
            self.stdout.write(self.style.SUCCESS(f"Released warranty for contract {contract_id}."))
            return

        released = release_due_warranties()
        self.stdout.write(self.style.SUCCESS(f"Released {released} due warranty(ies)."))
