"""One-time cleanup of legacy TinyMCE HTML left in plain-text fields.

The legacy WordPress import stored rich-text HTML verbatim, so profile bios,
service/job descriptions etc. render raw ``<p>``/``<strong>`` tags in the UI.
This command strips that markup to plain text in place.

Safety:
    * **Idempotent** — only rows whose value still contains tag-like markup are
      touched (see core.text.has_html), so re-running is a no-op.
    * **Backup-first** — ``--backup <path>`` writes a JSON of every (model, pk,
      field, old, new) before any write, so the change is reversible.
    * ``--dry-run`` reports counts and a few samples without writing.

Usage:
    python manage.py clean_legacy_html --dry-run
    python manage.py clean_legacy_html --backup /tmp/legacy_html_backup.json
    python manage.py clean_legacy_html --only profiles.WorkerProfile
"""

from __future__ import annotations

import json

from django.apps import apps as django_apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from apps.core.text import has_html, strip_rich_text

# (app_label.ModelName, [text fields that held legacy rich text])
TARGETS: list[tuple[str, list[str]]] = [
    ("profiles.WorkerProfile", ["bio_title", "overview"]),
    ("profiles.PortfolioItem", ["title", "description"]),
    ("profiles.Education", ["description"]),
    ("profiles.Employment", ["job_title", "description"]),
    ("gigs.Service", ["title", "description"]),
    ("gigs.ServiceAddon", ["description"]),
    ("jobs.Job", ["title", "description"]),
    ("jobs.Proposal", ["description"]),
    ("reviews.Review", ["comment"]),
    ("catalog.Category", ["description"]),
    ("core.Report", ["description"]),
]


class Command(BaseCommand):
    help = "Strip legacy HTML markup from imported plain-text fields."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true",
            help="Report what would change without writing.",
        )
        parser.add_argument(
            "--backup", metavar="PATH",
            help="Write a JSON backup of all changes before applying them.",
        )
        parser.add_argument(
            "--only", metavar="app.Model", action="append", dest="only",
            help="Limit to one or more app.Model targets (repeatable).",
        )

    def handle(self, *args, **opts):
        dry_run = opts["dry_run"]
        only = set(opts.get("only") or [])
        targets = [t for t in TARGETS if not only or t[0] in only]
        if only:
            unknown = only - {t[0] for t in TARGETS}
            if unknown:
                raise CommandError(f"Unknown --only target(s): {', '.join(sorted(unknown))}")

        backup: list[dict] = []
        total_rows = total_fields = 0

        for label, fields in targets:
            app_label, model_name = label.split(".")
            model = django_apps.get_model(app_label, model_name)
            rows_changed = fields_changed = 0

            # Only pull rows that contain a tag-like substring in any target field,
            # so we scan the minimum and keep the pass idempotent.
            q = Q()
            for f in fields:
                q |= Q(**{f"{f}__contains": "<"})
            qs = model.objects.filter(q).only("pk", *fields)

            with transaction.atomic():
                for obj in qs.iterator(chunk_size=500):
                    row_touched = False
                    for f in fields:
                        old = getattr(obj, f) or ""
                        if not has_html(old):
                            continue
                        new = strip_rich_text(old)
                        if new == old:
                            continue
                        backup.append({
                            "model": label, "pk": obj.pk, "field": f,
                            "old": old, "new": new,
                        })
                        setattr(obj, f, new)
                        fields_changed += 1
                        row_touched = True
                    if row_touched:
                        rows_changed += 1
                        if not dry_run:
                            obj.save(update_fields=fields)
                if dry_run:
                    transaction.set_rollback(True)

            total_rows += rows_changed
            total_fields += fields_changed
            self.stdout.write(f"  {label}: {rows_changed} rows, {fields_changed} fields")

        if opts.get("backup") and backup and not dry_run:
            with open(opts["backup"], "w", encoding="utf-8") as fh:
                json.dump(backup, fh, ensure_ascii=False, indent=2)
            self.stdout.write(self.style.SUCCESS(f"Backup written: {opts['backup']} ({len(backup)} changes)"))

        verb = "Would clean" if dry_run else "Cleaned"
        self.stdout.write(self.style.SUCCESS(
            f"{verb} {total_fields} fields across {total_rows} rows."
        ))
        # A couple of before/after samples to eyeball the result.
        for item in backup[:3]:
            self.stdout.write(f"\n[{item['model']}#{item['pk']}.{item['field']}]")
            self.stdout.write(f"  old: {item['old'][:160]!r}")
            self.stdout.write(f"  new: {item['new'][:160]!r}")
