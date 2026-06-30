"""Remove duplicate categories left behind by the legacy import.

The legacy import (``import_from_legacy``) loads three separate WordPress
taxonomies — ``wt-specialization`` (worker main field), ``project_cat`` (jobs)
and ``service_categories`` (gigs, the copy that carries the full subcategory
tree) — into the single :class:`~apps.catalog.models.Category` table. The same
concept therefore exists as up to three rows with an identical ``name_ar`` and
only the ``service_categories`` copy keeps the "complete tree" (children).

This command groups categories by exact ``name_ar`` and, for every duplicate
group, keeps the row with the **most complete subtree** ("complete tree"). When
two rows both have a tree it keeps the larger one (FR: "if two have a complete
tree, remove one"). Before deleting the losers it **reassigns every reference**
— services, jobs, worker profiles, subscriptions, skills and child categories —
onto the keeper, so no row is orphaned and nothing cascades away.

Idempotent and dry-run by default. ``--apply`` performs the work in a single
transaction.

    python manage.py dedupe_categories             # preview only, writes nothing
    python manage.py dedupe_categories --apply      # perform the merge + delete
    python manage.py dedupe_categories --normalize  # fold Arabic alef/hamza variants
"""
from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.catalog.models import Category

# Arabic letter folding for the optional --normalize match (alef/hamza/ya/ta-marbuta + tashkeel).
_FOLD = {ord(c): "ا" for c in "إأآا"}
_FOLD.update({ord("ى"): "ي", ord("ئ"): "ي", ord("ؤ"): "و", ord("ة"): "ه"})


def _normalize_ar(s: str) -> str:
    s = (s or "").translate(_FOLD)
    s = "".join(ch for ch in s if not ("ً" <= ch <= "ْ"))  # strip tashkeel
    return " ".join(s.split())


class Command(BaseCommand):
    help = "Remove duplicate categories, keeping the one with the most complete subtree."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply", action="store_true",
            help="Write changes. Without it the command only prints the plan (dry-run).",
        )
        parser.add_argument(
            "--normalize", action="store_true",
            help="Group by Arabic-normalized name (fold alef/hamza/ya spelling variants).",
        )

    # ── helpers ──────────────────────────────────────────────────────────────
    def _relations(self):
        """Every reverse FK/O2O pointing at Category, *including* hidden ones
        (WorkerProfile.main_category / .specialization use related_name='+').
        Returns (related_model, fk_field_name, is_self_parent)."""
        rels = []
        for f in Category._meta.get_fields(include_hidden=True):
            if f.is_relation and f.auto_created and not f.concrete and (f.one_to_many or f.one_to_one):
                rels.append((f.related_model, f.field.name, f.related_model is Category))
        return rels

    def _subtree_sizes(self, rows):
        children = defaultdict(list)
        for r in rows:
            children[r["parent_id"]].append(r["id"])

        def size(cid):
            n, stack = 0, [cid]
            while stack:
                for k in children.get(stack.pop(), []):
                    n += 1
                    stack.append(k)
            return n

        return {r["id"]: size(r["id"]) for r in rows}

    def _ref_count(self, cid, relations):
        """Data references to a category (excludes the self parent/children link)."""
        return sum(
            model.objects.filter(**{field: cid}).count()
            for model, field, is_self in relations
            if not is_self
        )

    # ── main ─────────────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        apply = opts["apply"]
        normalize = opts["normalize"]
        relations = self._relations()

        rows = list(Category.objects.values("id", "parent_id", "name_ar", "slug", "legacy_id"))
        by_id = {r["id"]: r for r in rows}
        sizes = self._subtree_sizes(rows)

        # Group by (normalized) name, keep only groups with > 1 member.
        groups = defaultdict(list)
        for r in rows:
            key = _normalize_ar(r["name_ar"]) if normalize else r["name_ar"]
            groups[key].append(r["id"])
        dup_groups = {k: v for k, v in groups.items() if len(v) > 1}

        if not dup_groups:
            self.stdout.write(self.style.SUCCESS("No duplicate categories found — nothing to do."))
            return

        # Reference counts only for the rows we might touch (keeps queries bounded).
        member_ids = {i for ids in dup_groups.values() for i in ids}
        refs = {i: self._ref_count(i, relations) for i in member_ids}

        # Choose a keeper per group and build the loser -> keeper remap.
        remap: dict[int, int] = {}
        plan = []  # (name, keeper_id, [loser_ids])
        for _name, ids in sorted(dup_groups.items()):
            # Most complete subtree, then most data references, then lowest id (stable).
            keeper = max(ids, key=lambda i: (sizes[i], refs[i], -i))
            losers = sorted(i for i in ids if i != keeper)
            for lid in losers:
                remap[lid] = keeper
            plan.append((by_id[keeper]["name_ar"], keeper, losers))

        self._print_plan(plan, by_id, sizes, refs, remap, relations, apply, normalize)

        if not apply:
            self.stdout.write(self.style.WARNING(
                "\nDRY-RUN — no changes written. Re-run with --apply to perform the merge."
            ))
            return

        self._apply(remap, relations)
        self.stdout.write(self.style.SUCCESS(
            f"\nApplied: removed {len(remap)} duplicate categories across {len(plan)} groups "
            f"(references reassigned, {Category.objects.count()} rows remain)."
        ))

    # ── reporting ────────────────────────────────────────────────────────────
    def _print_plan(self, plan, by_id, sizes, refs, remap, relations, apply, normalize):
        mode = "APPLY" if apply else "DRY-RUN"
        match = "Arabic-normalized" if normalize else "exact name_ar"
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Deduplicate categories [{mode}] — match: {match} — "
            f"{len(plan)} duplicate groups, {len(remap)} rows to remove\n"
        ))
        for name, keeper, losers in plan:
            k = by_id[keeper]
            self.stdout.write(self.style.SUCCESS(
                f"• {name}"
            ))
            self.stdout.write(
                f"    KEEP   id={keeper:<4} subtree={sizes[keeper]:<3} refs={refs[keeper]:<5} "
                f"slug={k['slug']!r}"
            )
            for lid in losers:
                lr = by_id[lid]
                self.stdout.write(self.style.WARNING(
                    f"    remove id={lid:<4} subtree={sizes[lid]:<3} refs={refs[lid]:<5} "
                    f"slug={lr['slug']!r}  -> reassign to {keeper}"
                ))

        # Per-relation reassignment totals.
        losers_all = list(remap)
        self.stdout.write("\n  Reference reassignments:")
        for model, field, is_self in relations:
            n = model.objects.filter(**{f"{field}__in": losers_all}).count()
            if n:
                label = "child categories (reparented)" if is_self else f"{model.__name__}.{field}"
                self.stdout.write(f"    {n:>5}  {label}")

    # ── mutation ─────────────────────────────────────────────────────────────
    @transaction.atomic
    def _apply(self, remap, relations):
        losers = list(remap)
        # 1) Repoint every reference (incl. child categories' parent) loser -> keeper.
        #    Done per (loser -> keeper) because losers map to different keepers.
        for model, field, _is_self in relations:
            for loser, keeper in remap.items():
                model.objects.filter(**{field: loser}).update(**{field: keeper})

        # 2) Safety: break any accidental parent cycle among survivors before delete.
        self._break_cycles(losers)

        # 3) Delete the losers. All references were repointed above, so PROTECT
        #    fields no longer block and CASCADE fields have nothing to take down.
        Category.objects.filter(id__in=losers).delete()

    def _break_cycles(self, losers):
        loser_set = set(losers)
        for cat in Category.objects.exclude(id__in=losers).filter(parent__isnull=False).only("id", "parent_id"):
            seen, node = {cat.id}, cat.parent_id
            while node is not None:
                if node in seen:
                    Category.objects.filter(id=cat.id).update(parent=None)
                    self.stdout.write(self.style.WARNING(
                        f"    broke parent cycle at category id={cat.id} (set parent=None)"
                    ))
                    break
                seen.add(node)
                nxt = Category.objects.filter(id=node).values_list("parent_id", flat=True).first()
                node = nxt if node not in loser_set else None
