"""Merge duplicate skills left behind by the legacy import.

The legacy import (``import_from_legacy``) loads the WordPress ``skills``
taxonomy into :class:`~apps.catalog.models.Skill`, but the same concept often
exists under several WordPress ``term_id``s (e.g. "3D Design" = 705 *and* 884).
The import keeps the slug unique by suffixing the term_id (``3d-design`` vs
``3d-design-884``), so the rows slip past the unique-slug constraint and surface
as *identical* names in every skill picker (the "duplicate مهارات" the catalog
shows).

This command groups active skills by exact ``name_ar`` and, for every duplicate
group, keeps the **most-referenced** row (tie-break: lowest id, which is the
original un-suffixed slug). Before deleting the losers it reassigns every
reference — worker skills and job skill tags — onto the keeper. Both join tables
are ``UNIQUE(parent, skill)``, so a loser row whose parent already carries the
keeper is dropped rather than repointed (repointing would collide).

Idempotent and dry-run by default. ``--apply`` performs the work in a single
transaction.

    python manage.py dedupe_skills              # preview only, writes nothing
    python manage.py dedupe_skills --apply       # perform the merge + delete
    python manage.py dedupe_skills --normalize   # fold Arabic alef/hamza variants
"""
from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.catalog.models import Skill
from apps.jobs.models import Job
from apps.profiles.models import WorkerSkill

# Arabic letter folding for the optional --normalize match (alef/hamza/ya/ta-marbuta + tashkeel).
_FOLD = {ord(c): "ا" for c in "إأآا"}
_FOLD.update({ord("ى"): "ي", ord("ئ"): "ي", ord("ؤ"): "و", ord("ة"): "ه"})


def _normalize_ar(s: str) -> str:
    s = (s or "").translate(_FOLD)
    s = "".join(ch for ch in s if not ("ً" <= ch <= "ْ"))  # strip tashkeel
    return " ".join(s.split())


class Command(BaseCommand):
    help = "Merge duplicate skills (same name_ar), keeping the most-referenced row."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Write changes. Without it the command only prints the plan (dry-run).",
        )
        parser.add_argument(
            "--normalize", action="store_true",
            help="Group by Arabic-normalized name (fold alef/hamza/ya spelling variants).",
        )

    # ── relations ────────────────────────────────────────────────────────────
    def _relations(self):
        """Join tables that reference Skill. Each row is ``UNIQUE(parent, skill)``,
        so reassignment must drop collisions rather than repoint them.
        Returns (label, model, skill_fk_column, parent_column)."""
        return [
            ("worker skills", WorkerSkill, "skill_id", "profile_id"),
            ("job skill tags", Job.skills.through, "skill_id", "job_id"),
        ]

    def _assert_full_coverage(self, relations):
        """Fail loudly if a reverse relation to Skill isn't handled, rather than
        silently orphaning (or cascade-deleting) its rows when a loser is removed."""
        handled = {model for _label, model, _fk, _parent in relations}
        missing = set()
        for f in Skill._meta.get_fields(include_hidden=True):
            if not (f.is_relation and f.auto_created and not f.concrete):
                continue
            model = f.through if f.many_to_many else f.related_model
            if model not in handled:
                missing.add(model.__name__)
        if missing:
            raise CommandError(
                "dedupe_skills cannot reassign references from "
                f"{', '.join(sorted(missing))}; add them to _relations() first."
            )

    def _ref_count(self, sid, relations):
        return sum(model.objects.filter(**{fk: sid}).count() for _l, model, fk, _p in relations)

    # ── main ─────────────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        apply = opts["apply"]
        normalize = opts["normalize"]
        relations = self._relations()
        self._assert_full_coverage(relations)

        rows = list(Skill.objects.filter(is_active=True).values("id", "name_ar", "slug", "legacy_id"))
        by_id = {r["id"]: r for r in rows}

        # Group by (normalized) name, keep only groups with > 1 member.
        groups = defaultdict(list)
        for r in rows:
            key = _normalize_ar(r["name_ar"]) if normalize else r["name_ar"]
            groups[key].append(r["id"])
        dup_groups = {k: v for k, v in groups.items() if len(v) > 1}

        if not dup_groups:
            self.stdout.write(self.style.SUCCESS("No duplicate skills found — nothing to do."))
            return

        # Reference counts only for the rows we might touch (keeps queries bounded).
        member_ids = {i for ids in dup_groups.values() for i in ids}
        refs = {i: self._ref_count(i, relations) for i in member_ids}

        # Choose a keeper per group and build the loser -> keeper remap.
        remap: dict[int, int] = {}
        plan = []  # (name, keeper_id, [loser_ids])
        for _key, ids in sorted(dup_groups.items()):
            # Most data references, then lowest id (the original un-suffixed slug).
            keeper = max(ids, key=lambda i: (refs[i], -i))
            losers = sorted(i for i in ids if i != keeper)
            for lid in losers:
                remap[lid] = keeper
            plan.append((by_id[keeper]["name_ar"], keeper, losers))

        self._print_plan(plan, by_id, refs, apply, normalize)

        if not apply:
            self.stdout.write(self.style.WARNING(
                "\nDRY-RUN — no changes written. Re-run with --apply to perform the merge."
            ))
            return

        self._apply(remap, relations)
        self.stdout.write(self.style.SUCCESS(
            f"\nApplied: merged {len(remap)} duplicate skills across {len(plan)} groups "
            f"(references reassigned, {Skill.objects.filter(is_active=True).count()} active rows remain)."
        ))

    # ── reporting ────────────────────────────────────────────────────────────
    def _print_plan(self, plan, by_id, refs, apply, normalize):
        mode = "APPLY" if apply else "DRY-RUN"
        match = "Arabic-normalized" if normalize else "exact name_ar"
        rows_to_remove = sum(len(losers) for _n, _k, losers in plan)
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Deduplicate skills [{mode}] — match: {match} — "
            f"{len(plan)} duplicate groups, {rows_to_remove} rows to remove\n"
        ))
        for name, keeper, losers in plan:
            k = by_id[keeper]
            self.stdout.write(self.style.SUCCESS(f"• {name}"))
            self.stdout.write(f"    KEEP   id={keeper:<5} refs={refs[keeper]:<5} slug={k['slug']!r}")
            for lid in losers:
                lr = by_id[lid]
                self.stdout.write(self.style.WARNING(
                    f"    remove id={lid:<5} refs={refs[lid]:<5} slug={lr['slug']!r}  -> reassign to {keeper}"
                ))

    # ── mutation ─────────────────────────────────────────────────────────────
    @transaction.atomic
    def _apply(self, remap, relations):
        for loser, keeper in remap.items():
            for _label, model, fk, parent in relations:
                # Drop loser rows whose parent already carries the keeper — repointing
                # them would violate the UNIQUE(parent, skill) constraint.
                keeper_parents = model.objects.filter(**{fk: keeper}).values(parent)
                model.objects.filter(**{fk: loser, f"{parent}__in": keeper_parents}).delete()
                model.objects.filter(**{fk: loser}).update(**{fk: keeper})

        # Losers now hold no references; deleting them orphans nothing.
        Skill.objects.filter(id__in=list(remap)).delete()
