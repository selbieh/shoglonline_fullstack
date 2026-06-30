"""Import core data from the legacy WordPress (Workreap) MySQL into the new Django/Postgres app.

Reads the read-only ``legacy`` connection (set ``LEGACY_DATABASE_URL``) via raw cursors and upserts
into our models, keyed on ``legacy_id`` so the command is **idempotent** — re-running updates rather
than duplicating. See docs/migration/legacy-mapping.md for the field-level mapping and decisions.

Stages run in FK-safe order:
    taxonomy → users → profiles → services → jobs → proposals

Usage:
    # everything (dry-run first to see counts without writing)
    python manage.py import_from_legacy --dry-run
    python manage.py import_from_legacy

    # a single stage, capped for a quick trial
    python manage.py import_from_legacy --only taxonomy
    python manage.py import_from_legacy --only users --limit 500

Notes:
    * ALL legacy users are imported (decision D1). ~150k have thin profiles.
    * Categories/skills are imported from the legacy taxonomy and deduped against the seed by slug (D2).
    * Phase-2 entities (contracts, payments, reviews, portfolio, chat) are intentionally NOT here yet.
"""

from __future__ import annotations

import html
import re
from datetime import timezone as _tz
from urllib.parse import unquote
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from django.db.models import Q
from django.utils.dateparse import parse_datetime
from django.utils.text import slugify
from django.utils.timezone import make_aware

# Legacy WordPress post_date columns are naive site-local time (Africa/Cairo); *_gmt columns are UTC.
_CAIRO = ZoneInfo("Africa/Cairo")

from apps.accounts.models import User
from apps.catalog.models import Category, Skill
from apps.chat.models import Conversation, Message
from apps.contracts.models import Contract, Submission
from apps.core.models import Report
from apps.gigs.models import Service, ServiceAddon
from apps.jobs.models import Job, Proposal
from apps.payments.models import Transaction, Wallet, WithdrawalRequest
from apps.profiles.models import (
    Address,
    Certificate,
    Education,
    EmployerProfile,
    Employment,
    PortfolioItem,
    WorkerLanguage,
    WorkerProfile,
    WorkerSkill,
)
from apps.reviews.models import Review
from apps.subscriptions.models import Membership
from apps.tickets.models import Ticket, TicketType

LEGACY = "legacy"
WP = "wp_"  # table prefix
STAGES = ["taxonomy", "users", "profiles", "services", "jobs", "proposals",
          "contracts", "payments", "reviews", "portfolio", "addons", "history",
          "subscriptions", "chat",
          "service_contracts", "reports", "tickets", "milestones", "disputes"]

# Workreap stores durations as enum buckets (no digits), so they must be mapped to day counts.
DURATION_DAYS = {
    "one_day": 1, "less_than_week": 3, "weekly": 7, "two_week": 14,
    "monthly": 30, "three_month": 90, "six_month": 180, "more_than_six": 210,
}

# Legacy _english_level buckets → our WorkerLanguage.Proficiency (basic/advanced/native).
ENGLISH_LEVEL = {
    "basic": "basic", "beginner": "basic",
    "conversational": "advanced", "intermediate": "advanced", "fluent": "advanced",
    "professional": "advanced", "advanced": "advanced",
    "native": "native", "mother": "native",
}


class Command(BaseCommand):
    help = "Import core data from the legacy WordPress (Workreap) MySQL into the new app."

    def add_arguments(self, parser):
        parser.add_argument("--only", default="", help=f"Comma-separated stages to run (default: all). One of: {', '.join(STAGES)}.")
        parser.add_argument("--limit", type=int, default=0, help="Cap rows per stage (0 = no cap). For quick trials.")
        parser.add_argument("--batch", type=int, default=1000, help="Read/commit batch size (default: 1000).")
        parser.add_argument("--media-base", default="",
                            help="Public base URL fronting the legacy media (your CDN/domain or the S3 "
                                 "bucket). Defaults to the configured S3 bucket, path-style.")
        parser.add_argument("--dry-run", action="store_true", help="Read + map but write nothing.")
        parser.add_argument("--mirror-firestore", action="store_true",
                            help="After the chat stage, mirror conversations/messages to Firestore "
                                 "(needs valid firebase creds + FIRESTORE_STUB=0).")
        # Legacy DB connection — pass these to override LEGACY_DATABASE_URL (used by `make migrate-legacy`).
        parser.add_argument("--db-host", default="", help="Legacy MySQL host (else uses LEGACY_DATABASE_URL).")
        parser.add_argument("--db-port", default="3306", help="Legacy MySQL port (default: 3306).")
        parser.add_argument("--db-name", default="", help="Legacy MySQL database name.")
        parser.add_argument("--db-user", default="", help="Legacy MySQL user.")
        parser.add_argument("--db-password", default="", help="Legacy MySQL password.")

    # ── entrypoint ───────────────────────────────────────────────────────────────────────────
    def handle(self, *args, **opts):
        self._register_legacy_from_args(opts)
        if LEGACY not in connections.databases:
            raise CommandError(
                "No legacy database configured. Either set LEGACY_DATABASE_URL "
                "(e.g. mysql://user:password@host.docker.internal:3307/shogl) or pass "
                "--db-host/--db-name/--db-user/--db-password."
            )
        self.failures = []
        self.dry_run = opts["dry_run"]
        self.limit = opts["limit"]
        self.batch = opts["batch"]
        self.media_base = (opts["media_base"] or self._default_media_base()).rstrip("/")
        self.mirror_firestore = opts["mirror_firestore"]
        stages = [s.strip() for s in opts["only"].split(",") if s.strip()] or STAGES
        for s in stages:
            if s not in STAGES:
                raise CommandError(f"Unknown stage '{s}'. Valid: {', '.join(STAGES)}.")

        self._check_legacy()
        if self.dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — nothing will be written."))

        for stage in stages:
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n=== stage: {stage} ==="))
            getattr(self, f"_stage_{stage}")()

        self._report_failures()
        self.stdout.write(self.style.SUCCESS("\nImport finished."))

    def _register_legacy_from_args(self, opts):
        """Register the read-only 'legacy' connection from --db-* args (overrides settings)."""
        if not opts["db_host"]:
            return
        connections.databases[LEGACY] = {
            "ENGINE": "django.db.backends.mysql",
            "NAME": opts["db_name"], "USER": opts["db_user"], "PASSWORD": opts["db_password"],
            "HOST": opts["db_host"], "PORT": str(opts["db_port"]),
            "OPTIONS": {"charset": "utf8mb4"},
            "TIME_ZONE": None, "CONN_MAX_AGE": 0, "CONN_HEALTH_CHECKS": False,
            "AUTOCOMMIT": True, "ATOMIC_REQUESTS": False,
        }

    @staticmethod
    def _default_media_base():
        """Path-style S3 base for the configured bucket (path-style works for dotted bucket names,
        which virtual-hosted-style HTTPS does not)."""
        bucket = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "")
        region = getattr(settings, "AWS_S3_REGION_NAME", "") or "us-east-1"
        return f"https://s3.{region}.amazonaws.com/{bucket}" if bucket else "https://shoghlonline.com"

    def _report_failures(self):
        if not self.failures:
            return
        from collections import Counter
        by_model = Counter(f[0] for f in self.failures)
        self.stdout.write(self.style.ERROR(
            f"\n{len(self.failures)} row(s) FAILED and were skipped: "
            + ", ".join(f"{k}={v}" for k, v in by_model.items())))
        path = "/app/import_failures.log"
        try:
            with open(path, "w") as fh:
                for model, lid, err in self.failures:
                    fh.write(f"{model}\t{lid}\t{err}\n")
            self.stdout.write(self.style.ERROR(f"  details → {path} (model, legacy_id, error)"))
        except OSError:
            pass

    # ── legacy read helpers ──────────────────────────────────────────────────────────────────
    def _check_legacy(self):
        try:
            with connections[LEGACY].cursor() as c:
                c.execute("SELECT VERSION()")
                self.stdout.write(self.style.SUCCESS(f"Legacy MySQL: {c.fetchone()[0]}"))
        except Exception as exc:  # noqa: BLE001
            raise CommandError(
                f"Cannot read the legacy DB: {exc}\n"
                "Check LEGACY_DATABASE_URL, that the host is reachable from this container "
                "(use host.docker.internal on Docker Desktop), and that mysqlclient is installed."
            )

    def _rows(self, sql, params=None):
        with connections[LEGACY].cursor() as c:
            c.execute(sql, params or [])
            cols = [d[0] for d in c.description]
            return [dict(zip(cols, r)) for r in c.fetchall()]

    def _iter_paged(self, table, id_col, where_sql, params, select="*"):
        """Yield rows in ascending id pages so we never load a giant table at once."""
        last, seen = 0, 0
        while True:
            page = self._rows(
                f"SELECT {select} FROM {table} WHERE {id_col} > %s AND ({where_sql}) "
                f"ORDER BY {id_col} ASC LIMIT %s",
                [last, *params, self.batch],
            )
            if not page:
                return
            for row in page:
                yield row
                seen += 1
                if self.limit and seen >= self.limit:
                    return
            last = page[-1][id_col]

    def _meta_map(self, table, id_col, ids, keys=None):
        """{id: {meta_key: meta_value}} for the given ids (optionally only `keys`)."""
        if not ids:
            return {}
        out: dict = {}
        ids = list(ids)
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            ph = ",".join(["%s"] * len(chunk))
            sql = f"SELECT {id_col} AS oid, meta_key, meta_value FROM {table} WHERE {id_col} IN ({ph})"
            params = list(chunk)
            if keys:
                kph = ",".join(["%s"] * len(keys))
                sql += f" AND meta_key IN ({kph})"
                params += list(keys)
            for r in self._rows(sql, params):
                out.setdefault(r["oid"], {})[r["meta_key"]] = r["meta_value"]
        return out

    def _term_map(self, object_ids, taxonomies):
        """{object_id: [term_id, ...]} for the given taxonomies."""
        if not object_ids:
            return {}
        out: dict = {}
        ids = list(object_ids)
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            ph = ",".join(["%s"] * len(chunk))
            tph = ",".join(["%s"] * len(taxonomies))
            rows = self._rows(
                f"SELECT tr.object_id AS oid, tt.term_id AS term_id FROM {WP}term_relationships tr "
                f"JOIN {WP}term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id "
                f"WHERE tr.object_id IN ({ph}) AND tt.taxonomy IN ({tph})",
                [*chunk, *taxonomies],
            )
            for r in rows:
                out.setdefault(r["oid"], []).append(r["term_id"])
        return out

    # ── value coercion ───────────────────────────────────────────────────────────────────────
    @staticmethod
    def _dt(value, assume_local=False):
        """Parse a legacy datetime → tz-aware UTC. `assume_local=True` for naive site-local
        (Africa/Cairo) sources (e.g. wp_posts.post_date, wpguppy message_sent_time); the *_gmt
        columns are already UTC so leave assume_local=False for those."""
        if not value or str(value).startswith("0000"):
            return None
        dt = value if hasattr(value, "year") else parse_datetime(str(value))
        if dt is None:
            return None
        if dt.tzinfo:
            return dt
        if assume_local:
            return make_aware(dt, _CAIRO).astimezone(_tz.utc)
        return make_aware(dt)  # naive source that is already UTC (e.g. *_gmt columns, user_registered)

    @staticmethod
    def _dec(value, default=None):
        if value in (None, "", "0", 0):
            return default if value in (None, "") else 0
        m = re.search(r"-?\d+(\.\d+)?", str(value).replace(",", ""))
        return float(m.group()) if m else default

    def _money(self, value, max_value, default=None):
        """Decimal that must fit a DecimalField and be non-negative; junk/negative → default."""
        v = self._dec(value, None)
        if v is None or v < 0 or abs(v) >= max_value:
            return default
        return v

    @staticmethod
    def _int(value, default=None):
        # NOTE: `str(value or "")` would treat the integer 0 as falsy → ""; guard it explicitly.
        m = re.search(r"-?\d+", "" if value is None else str(value))
        return int(m.group()) if m else default

    @staticmethod
    def _duration_days(value, default=None):
        """Map a Workreap duration (enum bucket OR numeric) to a day count."""
        s = (value or "").strip().lower()
        if not s:
            return default
        if s in DURATION_DAYS:
            return DURATION_DAYS[s]
        m = re.search(r"\d+", s)
        return int(m.group()) if m else default

    @staticmethod
    def _clean(value):
        return html.unescape((value or "").strip())

    @staticmethod
    def _unquote_clean(value):
        """For WP meta stored percent-encoded (e.g. _country/_address/_department), whose Arabic is
        URL-encoded (%d8%a7…). Safe on plain text (no %XX → unchanged)."""
        return html.unescape(unquote((value or "").strip())).strip()

    def _unique_slug(self, base, legacy_id):
        """Deterministic, collision-free slug: <slugified-title>-<legacy_id>."""
        s = slugify(base, allow_unicode=True)[:150] or "item"
        return f"{s}-{legacy_id}"

    @staticmethod
    def _slugify_name(name, fallback):
        """Clean unicode slug from the Arabic name (not the WP percent-encoded slug)."""
        return slugify((name or "").strip(), allow_unicode=True)[:150] or fallback

    def _set_created_at(self, model, pk, created_at):
        """created_at is auto_now_add, so it ignores assignment on INSERT — patch it post-save
        to preserve the original legacy post_date. Skipped when there's no source date."""
        if created_at is not None and not self.dry_run:
            model.objects.filter(pk=pk).update(created_at=created_at)

    def _upsert(self, model, legacy_id, defaults, create_only=None, created_at=None):
        """Idempotent upsert keyed on legacy_id. `create_only` fields are set only on insert."""
        obj = model.objects.filter(legacy_id=legacy_id).first()
        created = obj is None
        if created:
            obj = model(legacy_id=legacy_id, **(create_only or {}))
        for k, v in defaults.items():
            setattr(obj, k, v)
        if not self.dry_run:
            try:
                obj.save()
                self._set_created_at(model, obj.pk, created_at)  # backfills on re-run too (idempotent)
            except Exception as e:  # noqa: BLE001 — record the bad row and keep going
                self.failures.append((model.__name__, legacy_id, str(e)[:200]))
                return None, False
        return obj, created

    def _upsert_profile(self, model, user_id, legacy_id, defaults, created_at=None):
        """One profile per user (OneToOne). Keyed on user; legacy_id records the source post.
        A user with several legacy profile posts collapses to a single profile (last post wins)."""
        obj = model.objects.filter(user_id=user_id).first()
        created = obj is None
        if created:
            obj = model(user_id=user_id)
        obj.legacy_id = legacy_id
        for k, v in defaults.items():
            setattr(obj, k, v)
        if not self.dry_run:
            try:
                obj.save()
                self._set_created_at(model, obj.pk, created_at)  # backfills on re-run too (idempotent)
            except Exception as e:  # noqa: BLE001 — record the bad row and keep going
                self.failures.append((model.__name__, legacy_id, str(e)[:200]))
                return None, False
        return obj, created

    # ── caches ───────────────────────────────────────────────────────────────────────────────
    def _user_map(self):
        return dict(User.objects.exclude(legacy_id=None).values_list("legacy_id", "id"))

    def _category_map(self):
        return dict(Category.objects.exclude(legacy_id=None).values_list("legacy_id", "id"))

    def _skill_map(self):
        return dict(Skill.objects.exclude(legacy_id=None).values_list("legacy_id", "id"))

    def _term_names(self, taxonomies):
        """{term_id: name} for a taxonomy (small lookups like languages/department)."""
        tph = ",".join(["%s"] * len(taxonomies))
        rows = self._rows(
            f"SELECT t.term_id, t.name FROM {WP}term_taxonomy tt "
            f"JOIN {WP}terms t ON t.term_id = tt.term_id WHERE tt.taxonomy IN ({tph})", taxonomies
        )
        return {r["term_id"]: self._clean(r["name"]) for r in rows}

    @staticmethod
    def _php_strings(value):
        """Extract the string values from a PHP-serialized array (s:LEN:"...";) — for name lists."""
        if not value or not isinstance(value, str):
            return []
        return [m.group(1) for m in re.finditer(r's:\d+:"(.*?)";', value, re.S)]

    @staticmethod
    def _php_unserialize(value):
        """Minimal byte-accurate PHP unserialize (a/s/i/d/b/N). Byte-accurate string lengths matter
        for Arabic (multi-byte UTF-8). PHP arrays → dict. Returns None on any parse problem."""
        if not value:
            return None
        data = value.encode("utf-8") if isinstance(value, str) else value
        pos = 0

        def parse():
            nonlocal pos
            t = chr(data[pos])
            if t == "N":
                pos += 2
                return None
            if t == "b":
                v = data[pos + 2:pos + 3] == b"1"
                pos += 4
                return v
            if t in ("i", "d"):
                end = data.index(b";", pos)
                raw = data[pos + 2:end]
                pos = end + 1
                return int(raw) if t == "i" else float(raw)
            if t == "s":
                colon = data.index(b":", pos + 2)
                ln = int(data[pos + 2:colon])
                start = colon + 2  # past :"
                raw = data[start:start + ln]
                pos = start + ln + 2  # past ";
                return raw.decode("utf-8", "replace")
            if t == "a":
                colon = data.index(b":", pos + 2)
                n = int(data[pos + 2:colon])
                pos = colon + 2  # past :{
                out = {}
                for _ in range(n):
                    k = parse()
                    out[k] = parse()
                pos += 1  # past }
                return out
            raise ValueError(f"unexpected php token {t!r} at {pos}")

        try:
            return parse()
        except Exception:  # noqa: BLE001 — malformed legacy blob → caller treats as empty
            return None

    def _attachment_urls(self, thumb_ids):
        """Resolve attachment ids → public URL: prefer the S3 offload (wp_as3cf_items), else the
        site uploads URL via _wp_attached_file. Returns {attachment_id(int): url} (URLField ≤200)."""
        ids = sorted({i for i in (self._int(t) for t in thumb_ids) if i})
        out = {}
        if not ids:
            return out
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            ph = ",".join(["%s"] * len(chunk))
            for r in self._rows(
                f"SELECT source_id, bucket, region, path FROM {WP}as3cf_items WHERE source_id IN ({ph})", chunk
            ):
                # path-style (NOT virtual-hosted) — dotted bucket names break virtual-hosted HTTPS
                out[r["source_id"]] = f"https://s3.{r['region']}.amazonaws.com/{r['bucket']}/{r['path']}"
            missing = [c for c in chunk if c not in out]
            if missing:
                mph = ",".join(["%s"] * len(missing))
                for r in self._rows(
                    f"SELECT post_id, meta_value FROM {WP}postmeta "
                    f"WHERE meta_key='_wp_attached_file' AND post_id IN ({mph})", missing
                ):
                    out[r["post_id"]] = f"{self.media_base}/wp-content/uploads/{r['meta_value']}"
        return {k: v for k, v in out.items() if v and len(v) <= 200}

    def _fallback_category_id(self):
        cat, _ = Category.objects.get_or_create(
            slug="uncategorized", defaults={"name_ar": "غير مصنف", "is_active": True}
        )
        return cat.id

    # ── stages ───────────────────────────────────────────────────────────────────────────────
    def _stage_taxonomy(self):
        # Categories: service_categories + project_cat
        cats = self._rows(
            f"SELECT t.term_id, t.name, t.slug, tt.description, tt.parent, tt.taxonomy "
            f"FROM {WP}term_taxonomy tt JOIN {WP}terms t ON t.term_id = tt.term_id "
            f"WHERE tt.taxonomy IN ('service_categories','project_cat','wt-specialization') "
            f"ORDER BY tt.parent ASC, t.term_id ASC"
        )
        n_new = n_upd = 0
        for r in cats:
            slug = self._dedupe_slug(Category, self._slugify_name(r["name"], f"cat-{r['term_id']}"), r["term_id"])
            _, created = self._upsert(
                Category, r["term_id"],
                defaults={"name_ar": self._clean(r["name"])[:80], "description": self._clean(r["description"]),
                          "is_active": True},
                create_only={"slug": slug},
            )
            n_new += created
            n_upd += not created
        # resolve parents (second pass)
        if not self.dry_run:
            cmap = self._category_map()
            for r in cats:
                if r["parent"]:
                    parent_pk = cmap.get(r["parent"])
                    if parent_pk:
                        Category.objects.filter(legacy_id=r["term_id"]).update(parent_id=parent_pk)
        self.stdout.write(f"  categories: +{n_new} new, ~{n_upd} updated")

        # Skills
        skills = self._rows(
            f"SELECT t.term_id, t.name, t.slug FROM {WP}term_taxonomy tt "
            f"JOIN {WP}terms t ON t.term_id = tt.term_id WHERE tt.taxonomy='skills'"
        )
        s_new = s_upd = 0
        for r in skills:
            slug = self._dedupe_slug(Skill, self._slugify_name(r["name"], f"skill-{r['term_id']}"), r["term_id"])
            _, created = self._upsert(
                Skill, r["term_id"],
                defaults={"name_ar": self._clean(r["name"])[:80], "is_active": True},
                create_only={"slug": slug},
            )
            s_new += created
            s_upd += not created
        self.stdout.write(f"  skills: +{s_new} new, ~{s_upd} updated")

    def _dedupe_slug(self, model, slug, legacy_id):
        """D2: match a seeded row by slug → adopt it (set its legacy_id). Else ensure slug is free."""
        existing = model.objects.filter(slug=slug).first()
        if existing and existing.legacy_id in (None, legacy_id):
            if existing.legacy_id is None and not self.dry_run:
                existing.legacy_id = legacy_id
                existing.save(update_fields=["legacy_id"])
            return slug
        if existing:  # slug taken by a different legacy row → suffix to keep unique
            return f"{slug}-{legacy_id}"
        return slug

    def _stage_users(self):
        keys = ["first_name", "last_name", "full_name", "google", "_profile_blocked",
                "wp_capabilities", "description", "nickname"]
        n_new = n_upd = n_skip = 0
        buf = []
        for row in self._iter_paged(f"{WP}users", "ID", "1=1", []):
            buf.append(row)
            if len(buf) >= self.batch:
                a, b, c = self._flush_users(buf, keys)
                n_new += a; n_upd += b; n_skip += c
                buf = []
        if buf:
            a, b, c = self._flush_users(buf, keys)
            n_new += a; n_upd += b; n_skip += c
        self.stdout.write(f"  users: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no/dup email)")

    def _flush_users(self, rows, keys):  # autocommit: a failed row is isolated (see _upsert)
        meta = self._meta_map(f"{WP}usermeta", "user_id", [r["ID"] for r in rows], keys)
        n_new = n_upd = n_skip = 0
        for r in rows:
            m = meta.get(r["ID"], {})
            email = self._clean(r["user_email"]).lower()
            if not email:
                n_skip += 1
                continue
            # email is unique — skip if another (non-this) legacy row already owns it
            clash = User.objects.filter(email=email).exclude(legacy_id=r["ID"]).exists()
            if clash:
                n_skip += 1
                continue
            first = self._clean(m.get("first_name"))
            last = self._clean(m.get("last_name"))
            if not (first or last):
                parts = self._clean(m.get("full_name") or r.get("display_name")).split(" ", 1)
                first = parts[0]
                last = parts[1] if len(parts) > 1 else ""
            caps = m.get("wp_capabilities") or ""
            defaults = {
                "email": email,
                "first_name": first[:150],
                "last_name": last[:150],
                "google_sub": (self._clean(m.get("google"))[:64] or None),
                "date_joined": self._dt(r.get("user_registered")) or None,
                "status": User.Status.ACTIVE,  # block flag lives on the profile post (_stage_profiles), not usermeta
                "active_mode": User.Mode.FIND_WORKER if "employers" in caps else (User.Mode.FIND_JOB if "freelancers" in caps else ""),
                "is_staff": "administrator" in caps,
                "is_superuser": "administrator" in caps,
            }
            if defaults["date_joined"] is None:
                defaults.pop("date_joined")
            # google_sub is unique too — drop it on collision rather than fail the row
            if defaults["google_sub"] and User.objects.filter(google_sub=defaults["google_sub"]).exclude(legacy_id=r["ID"]).exists():
                defaults["google_sub"] = None
            _, created = self._upsert(User, r["ID"], defaults)
            n_new += created
            n_upd += not created
        return n_new, n_upd, n_skip

    def _stage_profiles(self):
        umap = self._user_map()
        smap = self._skill_map()
        lang_names = self._term_names(["languages"])
        dept_names = self._term_names(["department"])

        blocked = set()  # users whose profile post is _profile_blocked='on' → FROZEN
        # WorkerProfile ← freelancers posts (author = user) + avatar/skills/languages/address
        w_new = w_upd = w_skip = 0
        wkeys = ["_tag_line", "_perhour_rate", "_max_price", "_is_verified", "_thumbnail_id",
                 "_country", "_address", "_english_level", "_profile_blocked"]
        cmap = self._category_map()  # for wt-specialization → main_category
        for batch in self._batched_posts("freelancers", ["publish", "pending", "draft"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids, wkeys)
            urls = self._attachment_urls([meta.get(i, {}).get("_thumbnail_id") for i in ids])
            skill_terms = self._term_map(ids, ["skills"])
            lang_terms = self._term_map(ids, ["languages"])
            spec_terms = self._term_map(ids, ["wt-specialization"])
            processed = []
            for p in batch:
                uid = umap.get(p["post_author"])
                if not uid:
                    w_skip += 1
                    continue
                m = meta.get(p["ID"], {})
                state = WorkerProfile.PublishState.PUBLISHED if p["post_status"] == "publish" else WorkerProfile.PublishState.DRAFT
                defaults = {
                    "user_id": uid,
                    "display_name": self._clean(p["post_title"])[:120],
                    "overview": self._clean(p["post_content"]),
                    "bio_title": self._clean(m.get("_tag_line"))[:120],
                    "hourly_rate": self._money(m.get("_perhour_rate") or m.get("_max_price"), 10**6),
                    # legacy _experience is a serialized employment array, NOT a year count → leave null
                    "years_experience": None,
                    "is_verified": self._clean(m.get("_is_verified")) in ("1", "yes", "true"),
                    "publish_state": state,
                    "main_category_id": next((cmap[t] for t in spec_terms.get(p["ID"], []) if t in cmap), None),
                }
                obj, created = self._upsert_profile(WorkerProfile, uid, p["ID"], defaults,
                                                    created_at=self._dt(p["post_date"]))
                if obj is None:
                    continue
                w_new += created
                w_upd += not created
                if self._clean(m.get("_profile_blocked")).lower() == "on":
                    blocked.add(uid)
                processed.append({"profile": obj, "uid": uid, "post": p["ID"], "meta": m,
                                  "avatar": urls.get(self._int(m.get("_thumbnail_id")), "")})
            if not self.dry_run:
                self._enrich_workers(processed, smap, skill_terms, lang_terms, lang_names)
        self.stdout.write(f"  worker profiles: +{w_new} new, ~{w_upd} updated, {w_skip} skipped (no user)")

        # EmployerProfile ← employers posts + logo/field
        e_new = e_upd = e_skip = 0
        ekeys = ["_country", "_address", "_thumbnail_id", "_department", "_profile_blocked"]
        for batch in self._batched_posts("employers", ["publish", "pending", "draft"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids, ekeys)
            urls = self._attachment_urls([meta.get(i, {}).get("_thumbnail_id") for i in ids])
            dept_terms = self._term_map(ids, ["department"])
            for p in batch:
                uid = umap.get(p["post_author"])
                if not uid:
                    e_skip += 1
                    continue
                m = meta.get(p["ID"], {})
                # prefer the clean department taxonomy NAME; fall back to the percent-encoded meta
                field = next((dept_names[t] for t in dept_terms.get(p["ID"], []) if t in dept_names), "") \
                    or self._unquote_clean(m.get("_department"))
                defaults = {
                    "user_id": uid,
                    "company_name": self._clean(p["post_title"])[:120],
                    "country": self._unquote_clean(m.get("_country"))[:64],
                    "field": field[:120],
                    "logo_url": urls.get(self._int(m.get("_thumbnail_id")), ""),
                }
                obj, created = self._upsert_profile(EmployerProfile, uid, p["ID"], defaults,
                                                    created_at=self._dt(p["post_date"]))
                if obj is None:
                    continue
                e_new += created
                e_upd += not created
                if self._clean(m.get("_profile_blocked")).lower() == "on":
                    blocked.add(uid)
        self.stdout.write(f"  employer profiles: +{e_new} new, ~{e_upd} updated, {e_skip} skipped (no user)")
        if not self.dry_run and blocked:
            User.objects.filter(id__in=blocked).update(status=User.Status.FROZEN)
        self.stdout.write(f"  blocked → frozen: {len(blocked)} users")

    def _enrich_workers(self, processed, smap, skill_terms, lang_terms, lang_names):
        """Batched, idempotent creation of avatar / skills / languages / address sub-objects.
        Deduped by profile pk so a user with several freelancer posts is handled once."""
        items = list({x["profile"].pk: x for x in processed}.values())
        if not items:
            return
        pids = [x["profile"].pk for x in items]
        uids = [x["uid"] for x in items]

        # avatar → User.avatar_url (bulk_update; only users with a resolved url)
        want = {x["uid"]: x["avatar"] for x in items if x["avatar"]}
        if want:
            users = list(User.objects.filter(id__in=list(want)))
            for u in users:
                u.avatar_url = want[u.id]
            User.objects.bulk_update(users, ["avatar_url"])

        # WorkerSkill — only for profiles that have none yet (unique_together guards dups anyway)
        have = set(WorkerSkill.objects.filter(profile_id__in=pids).values_list("profile_id", flat=True))
        ws = [WorkerSkill(profile_id=x["profile"].pk, skill_id=smap[t])
              for x in items if x["profile"].pk not in have
              for t in skill_terms.get(x["post"], []) if t in smap]
        if ws:
            WorkerSkill.objects.bulk_create(ws, ignore_conflicts=True)

        # WorkerLanguage — only for profiles with none yet (no DB unique → dedupe in-memory)
        have = set(WorkerLanguage.objects.filter(profile_id__in=pids).values_list("profile_id", flat=True))
        wl = []
        for x in items:
            if x["profile"].pk in have:
                continue
            seen = set()
            lvl = ENGLISH_LEVEL.get(self._clean(x["meta"].get("_english_level")).lower())
            if lvl:
                wl.append(WorkerLanguage(profile_id=x["profile"].pk, name="English", proficiency=lvl))
                seen.add("english")
            for t in lang_terms.get(x["post"], []):
                name = lang_names.get(t)
                if name and name.lower() not in seen:
                    wl.append(WorkerLanguage(profile_id=x["profile"].pk, name=name[:48],
                                             proficiency=WorkerLanguage.Proficiency.ADVANCED))
                    seen.add(name.lower())
        if wl:
            WorkerLanguage.objects.bulk_create(wl, ignore_conflicts=True)

        # Address — one primary per user, only if none yet
        have = set(Address.objects.filter(user_id__in=uids, is_primary=True).values_list("user_id", flat=True))
        addrs = []
        for x in items:
            if x["uid"] in have:
                continue
            country = self._unquote_clean(x["meta"].get("_country"))[:64]
            city = self._unquote_clean(x["meta"].get("_address"))[:64]
            if country or city:
                addrs.append(Address(user_id=x["uid"], country=country, city=city, is_primary=True))
                have.add(x["uid"])
        if addrs:
            Address.objects.bulk_create(addrs, ignore_conflicts=True)

    def _stage_services(self):
        umap, cmap = self._user_map(), self._category_map()
        fallback = self._fallback_category_id()
        n_new = n_upd = n_skip = 0
        status_map = {"publish": Service.Status.LIVE, "pending": Service.Status.PENDING_REVIEW,
                      "deleted": Service.Status.ARCHIVED, "draft": Service.Status.DRAFT}
        # delivery taxonomy term → day count (slug/name like "3-days")
        delivery_days_map = {}
        for r in self._rows(f"SELECT t.term_id, t.slug, t.name FROM {WP}term_taxonomy tt "
                            f"JOIN {WP}terms t ON t.term_id = tt.term_id WHERE tt.taxonomy='delivery'"):
            d = self._int(r["slug"]) or self._int(r["name"])
            if d:
                delivery_days_map[r["term_id"]] = d
        for batch in self._batched_posts("micro-services", ["publish", "pending", "draft", "deleted"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids,
                                  ["_price", "services_views", "_thumbnail_id", "_categories_names"])
            terms = self._term_map(ids, ["service_categories"])
            delivery_terms = self._term_map(ids, ["delivery"])
            urls = self._attachment_urls([meta.get(i, {}).get("_thumbnail_id") for i in ids])
            for p in batch:
                uid = umap.get(p["post_author"])
                if not uid:
                    n_skip += 1
                    continue
                m = meta.get(p["ID"], {})
                cat_id = next((cmap[t] for t in terms.get(p["ID"], []) if t in cmap), fallback)
                defaults = {
                    "worker_id": uid,
                    "title": self._clean(p["post_title"])[:160] or "خدمة",
                    "description": self._clean(p["post_content"]) or self._clean(p["post_title"]),
                    "base_price": self._money(m.get("_price"), 10**8, 0) or 0,
                    "category_id": cat_id,
                    "delivery_days": next((delivery_days_map[t] for t in delivery_terms.get(p["ID"], [])
                                           if t in delivery_days_map), 7),
                    "views_count": self._int(m.get("services_views"), 0) or 0,
                    "cover_image": urls.get(self._int(m.get("_thumbnail_id")), ""),
                    "keywords": [self._clean(s) for s in self._php_strings(m.get("_categories_names"))][:20],
                    "status": status_map.get(p["post_status"], Service.Status.DRAFT),
                    "published_at": self._dt(p["post_date"]) if p["post_status"] == "publish" else None,
                }
                obj, created = self._upsert(
                    Service, p["ID"], defaults,
                    create_only={"slug": self._unique_slug(p["post_title"], p["ID"])},
                    created_at=self._dt(p["post_date"]),
                )
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
        self.stdout.write(f"  services: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no user)")

    def _stage_jobs(self):
        umap, cmap, smap = self._user_map(), self._category_map(), self._skill_map()
        fallback = self._fallback_category_id()
        n_new = n_upd = n_skip = 0
        status_map = {"publish": Job.Status.PUBLISHED, "hired": Job.Status.IN_PROGRESS,
                      "completed": Job.Status.COMPLETED, "pending": Job.Status.PENDING_REVIEW,
                      "cancelled": Job.Status.CLOSED, "draft": Job.Status.DRAFT}
        for batch in self._batched_posts("projects", list(status_map.keys())):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids,
                                  ["_project_cost", "_max_price", "_hourly_rate", "deadline", "_expiry_date",
                                   "_project_duration", "_country", "_address"])
            terms = self._term_map(ids, ["project_cat"])
            skill_terms = self._term_map(ids, ["skills"])
            for p in batch:
                uid = umap.get(p["post_author"])
                if not uid:
                    n_skip += 1
                    continue
                m = meta.get(p["ID"], {})
                cost = self._money(m.get("_project_cost") or m.get("_max_price") or m.get("_hourly_rate"), 10**8, 0) or 0
                cat_id = next((cmap[t] for t in terms.get(p["ID"], []) if t in cmap), fallback)
                deadline = self._dt(m.get("deadline")) or self._dt(m.get("_expiry_date"))
                defaults = {
                    "employer_id": uid,
                    "title": self._clean(p["post_title"])[:160] or "مشروع",
                    "description": self._clean(p["post_content"]) or self._clean(p["post_title"]),
                    "budget_min": cost,
                    "budget_max": cost,
                    "category_id": cat_id,
                    "deadline": deadline.date() if deadline else None,
                    "expires_at": self._dt(m.get("_expiry_date")),
                    "expected_days": self._duration_days(m.get("_project_duration")),
                    "country": self._unquote_clean(m.get("_country"))[:64],
                    "status": status_map.get(p["post_status"], Job.Status.DRAFT),
                    "published_at": self._dt(p["post_date"]) if p["post_status"] in ("publish", "hired", "completed") else None,
                }
                obj, created = self._upsert(
                    Job, p["ID"], defaults,
                    create_only={"slug": self._unique_slug(p["post_title"], p["ID"])},
                    created_at=self._dt(p["post_date"]),
                )
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
                if not self.dry_run:
                    sids = [smap[t] for t in skill_terms.get(p["ID"], []) if t in smap]
                    if sids:
                        obj.skills.add(*sids)
        self.stdout.write(f"  jobs: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no user)")

    def _stage_proposals(self):
        umap = self._user_map()
        jmap = dict(Job.objects.exclude(legacy_id=None).values_list("legacy_id", "id"))
        n_new = n_upd = n_skip = 0
        status_map = {"publish": Proposal.Status.SUBMITTED, "accepted": Proposal.Status.ACCEPTED,
                      "cancelled": Proposal.Status.CANCELLED, "rejected": Proposal.Status.REJECTED}
        for batch in self._batched_posts("proposals", ["publish", "accepted", "cancelled", "rejected", "pending"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids,
                                  ["_project_id", "_send_by", "_amount", "_freelancer_amount", "_proposed_duration", "_status"])
            for p in batch:
                m = meta.get(p["ID"], {})
                # The bidder is the proposal's post_author (a real user id). `_send_by` is a
                # post-range id, NOT a user id, so it must not be preferred here.
                job_id = jmap.get(self._int(m.get("_project_id")))
                worker_id = umap.get(p["post_author"]) or umap.get(self._int(m.get("_send_by")))
                if not (job_id and worker_id):
                    n_skip += 1
                    continue
                # unique(job, worker): if a different legacy proposal already pairs them, skip
                dup = Proposal.objects.filter(job_id=job_id, worker_id=worker_id).exclude(legacy_id=p["ID"]).exists()
                if dup:
                    n_skip += 1
                    continue
                defaults = {
                    "job_id": job_id,
                    "worker_id": worker_id,
                    "budget": self._money(m.get("_amount") or m.get("_freelancer_amount"), 10**8, 0) or 0,
                    "delivery_days": self._duration_days(m.get("_proposed_duration"), 1) or 1,
                    "description": self._clean(p["post_content"]) or "—",
                    "status": status_map.get(p["post_status"], Proposal.Status.SUBMITTED),
                }
                obj, created = self._upsert(Proposal, p["ID"], defaults,
                                            created_at=self._dt(p["post_date"]))
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
        # a project's _proposal_id meta points at the AWARDED proposal → mark it ACCEPTED
        n_acc = 0
        if not self.dry_run:
            awarded = {self._int(r["meta_value"]) for r in self._rows(
                f"SELECT DISTINCT meta_value FROM {WP}postmeta WHERE meta_key='_proposal_id' "
                f"AND meta_value REGEXP '^[0-9]+$'")}
            n_acc = Proposal.objects.filter(legacy_id__in=[a for a in awarded if a]).exclude(
                status=Proposal.Status.ACCEPTED).update(status=Proposal.Status.ACCEPTED)
        self.stdout.write(f"  proposals: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no job/worker or dup); "
                          f"{n_acc} marked accepted")

    def _stage_contracts(self):
        """One Contract per engagement, anchored on the JOB (project). A job is contract-like if it
        is hired/completed/closed, or has an earning, or is reviewed. Worker = project _freelancer_id
        (fallback: the earning's user). Earnings supply the money (budget/worker_earning/commission)."""
        umap = self._user_map()
        earnings = {}  # project_id -> [earning rows]
        for e in self._rows(
            f"SELECT id, user_id, amount, freelancer_amount, admin_amount, project_id, status, date_gmt "
            f"FROM {WP}wt_earnings ORDER BY id"
        ):
            earnings.setdefault(e["project_id"], []).append(e)
        review_pids = {self._int(r["meta_value"]) for r in self._rows(
            f"SELECT meta_value FROM {WP}postmeta WHERE meta_key='_project_id' AND post_id IN "
            f"(SELECT ID FROM {WP}posts WHERE post_type='reviews')")}
        anchor = set(earnings) | review_pids
        jobs = list(Job.objects.exclude(legacy_id=None).filter(
            Q(status__in=[Job.Status.COMPLETED, Job.Status.IN_PROGRESS, Job.Status.CLOSED])
            | Q(legacy_id__in=anchor)
        ).only("id", "legacy_id", "employer_id", "title", "budget_max"))
        if self.limit:
            jobs = jobs[: self.limit]
        fmeta = self._meta_map(f"{WP}postmeta", "post_id", [j.legacy_id for j in jobs], ["_freelancer_id"])
        # _freelancer_id is a freelancers POST id, not a user id → resolve to its owning user
        flancer_user = self._post_authors(
            [self._int(fmeta.get(j.legacy_id, {}).get("_freelancer_id")) for j in jobs])
        cstat = {Job.Status.COMPLETED: Contract.Status.COMPLETED,
                 Job.Status.CLOSED: Contract.Status.CANCELLED}
        n_new = n_upd = n_skip = 0
        for j in jobs:
            elist = earnings.get(j.legacy_id, [])
            settled = [e for e in elist if (e["status"] or "").lower() in ("completed", "processed", "hired")]
            use = settled or [e for e in elist if (e["status"] or "").lower() != "cancelled"]
            seen, uniq = set(), []  # drop accidental duplicate earning rows
            for e in use:
                k = (e["user_id"], str(e["amount"]), str(e["freelancer_amount"]))
                if k not in seen:
                    seen.add(k)
                    uniq.append(e)
            fid = self._int(fmeta.get(j.legacy_id, {}).get("_freelancer_id"))
            worker_id = umap.get(flancer_user.get(fid)) or (umap.get(uniq[-1]["user_id"]) if uniq else None)
            if not (worker_id and j.employer_id and worker_id != j.employer_id):
                n_skip += 1
                continue
            if uniq:
                amount = min(sum(self._money(e["amount"], 10**12, 0) or 0 for e in uniq), 10**10 - 1)
                wearn = sum(self._money(e["freelancer_amount"], 10**12, 0) or 0 for e in uniq)
                comm = sum(self._money(e["admin_amount"], 10**12, 0) or 0 for e in uniq)
                done = max([self._dt(e["date_gmt"]) for e in uniq if self._dt(e["date_gmt"])] or [None])
                defaults_money = {"budget": amount, "worker_earning": wearn, "commission_amount": comm,
                                  "commission_pct": round(comm / amount * 100, 2) if amount else 0}
            else:
                amount = self._money(j.budget_max, 10**10, 0) or 0
                done = None
                defaults_money = {"budget": amount, "worker_earning": amount, "commission_amount": 0, "commission_pct": 0}
            status = cstat.get(j.status, Contract.Status.ACTIVE)
            defaults = {
                "job_id": j.id, "employer_id": j.employer_id, "worker_id": worker_id,
                "title": (j.title or "عقد")[:160], "status": status,
                "completed_at": done if status == Contract.Status.COMPLETED else None,
                **defaults_money,
            }
            obj, created = self._upsert(Contract, j.legacy_id, defaults, created_at=done)
            if obj is None:
                continue
            n_new += created
            n_upd += not created
        self.stdout.write(f"  contracts: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no worker/employer)")

    def _stage_payments(self):
        """Wallets + earning ledger rows (wt_earnings) + withdrawals (wt_payouts_history)."""
        umap = self._user_map()
        earnings = self._rows(
            f"SELECT id, user_id, amount, freelancer_amount, status, date_gmt FROM {WP}wt_earnings ORDER BY id")
        n_tx = n_skip = 0
        touched, seen = set(), set()  # seen = non-cancelled (user,amount) for duplicate detection
        for r in (earnings[: self.limit] if self.limit else earnings):
            uid = umap.get(r["user_id"])
            if not uid:
                n_skip += 1
                continue
            if self.dry_run:
                n_tx += 1
                continue
            # Only settled, non-duplicate earnings count toward the spendable balance; cancelled and
            # accidental-duplicate rows are recorded as FAILED so the wallet recompute excludes them.
            cancelled = (r["status"] or "").lower() == "cancelled"
            key = (r["user_id"], str(r["freelancer_amount"]), str(r["amount"]))
            dup = (not cancelled) and key in seen
            if not cancelled:
                seen.add(key)
            wallet, _ = Wallet.objects.get_or_create(user_id=uid)
            amt = self._money(r["freelancer_amount"] or r["amount"], 10**10, 0) or 0
            tx, created = Transaction.objects.update_or_create(
                idempotency_key=f"legacy-earning-{r['id']}",
                defaults={"wallet": wallet, "type": Transaction.Type.EARNING,
                          "bucket": Transaction.Bucket.AVAILABLE, "amount": amt,
                          "status": Transaction.Status.FAILED if (cancelled or dup) else Transaction.Status.SUCCEEDED,
                          "note": f"Legacy earning #{r['id']}"
                                  + (" [cancelled]" if cancelled else " [duplicate]" if dup else "")})
            if created and (done := self._dt(r["date_gmt"])):
                Transaction.objects.filter(pk=tx.pk).update(created_at=done)
            touched.add(wallet.id)
            n_tx += 1
        # recompute available balance = Σ succeeded available rows (keeps the ledger invariant)
        if not self.dry_run:
            from django.db.models import Sum
            for wid in touched:
                bal = Transaction.objects.filter(wallet_id=wid, status=Transaction.Status.SUCCEEDED,
                                                 bucket=Transaction.Bucket.AVAILABLE).aggregate(s=Sum("amount"))["s"] or 0
                Wallet.objects.filter(id=wid).update(available=bal)
        self.stdout.write(f"  earning transactions: +{n_tx}, {n_skip} skipped (no user)")

        payouts = self._rows(
            f"SELECT id, user_id, amount, paypal_email, status, processed_date FROM {WP}wt_payouts_history ORDER BY id")
        pstat = {"completed": WithdrawalRequest.Status.PAID, "inprogress": WithdrawalRequest.Status.PROCESSING}
        w_new = w_skip = 0
        for r in (payouts[: self.limit] if self.limit else payouts):
            uid = umap.get(r["user_id"])
            if not uid:
                w_skip += 1
                continue
            done = self._dt(r["processed_date"])
            defaults = {
                "user_id": uid, "amount": self._money(r["amount"], 10**10, 0) or 0,
                "paypal_email": self._clean(r["paypal_email"])[:254],
                "status": pstat.get(r["status"], WithdrawalRequest.Status.PAID),
                "processed_at": done,
            }
            obj, created = self._upsert(WithdrawalRequest, r["id"], defaults, created_at=done)
            if obj is None:
                continue
            w_new += created
        self.stdout.write(f"  withdrawals: +{w_new}, {w_skip} skipped (no user)")

    def _post_authors(self, post_ids):
        """{post_id: post_author(user id)} — resolves a profile-post id back to its owning user."""
        ids = [i for i in post_ids if i]
        out = {}
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            ph = ",".join(["%s"] * len(chunk))
            for r in self._rows(f"SELECT ID, post_author FROM {WP}posts WHERE ID IN ({ph})", chunk):
                out[r["ID"]] = r["post_author"]
        return out

    def _stage_reviews(self):
        """Review per legacy 'reviews' post. The rating is ALWAYS about the freelancer's delivered
        work: subject (rated) = the review post's author (== `user_to` == the freelancer); author
        (reviewer) = the owner of the `user_from` profile post (the employer who wrote it).
        rating = round(user_rating) ∈ 1..5; contract = the job referenced by `_project_id`."""
        umap = self._user_map()
        cmap = {c["job__legacy_id"]: c["id"]
                for c in Contract.objects.exclude(job__legacy_id=None).values("id", "job__legacy_id")}
        n_new = n_upd = n_skip = 0
        for batch in self._batched_posts("reviews", ["publish"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids,
                                  ["user_from", "user_rating", "review_date", "_project_id"])
            from_post_author = self._post_authors(
                [self._int(meta.get(i, {}).get("user_from")) for i in ids])
            for p in batch:
                m = meta.get(p["ID"], {})
                author = umap.get(from_post_author.get(self._int(m.get("user_from"))))  # employer reviewer
                subject = umap.get(p["post_author"])  # freelancer being rated (== user_to)
                contract_id = cmap.get(self._int(m.get("_project_id")))
                rating = round(self._dec(m.get("user_rating"), 0) or 0)
                if not (author and subject and contract_id and 1 <= rating <= 5 and author != subject):
                    n_skip += 1
                    continue
                defaults = {
                    "contract_id": contract_id, "author_id": author, "subject_id": subject,
                    "rating": rating, "comment": self._clean(p["post_content"]),
                }
                obj, created = self._upsert(Review, p["ID"], defaults,
                                            created_at=self._dt(m.get("review_date")) or self._dt(p["post_date"]))
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
        # refresh denormalized rating_avg/rating_count on reviewed profiles
        if not self.dry_run:
            from django.db.models import Avg, Count
            agg = {r["subject_id"]: (r["a"], r["c"]) for r in
                   Review.objects.values("subject_id").annotate(a=Avg("rating"), c=Count("id"))}
            for prof_model in (WorkerProfile, EmployerProfile):
                for prof in prof_model.objects.filter(user_id__in=list(agg)):
                    avg, cnt = agg[prof.user_id]
                    prof.rating_avg = round(avg, 2)
                    prof.rating_count = cnt
                    prof.save(update_fields=["rating_avg", "rating_count"])
        self.stdout.write(f"  reviews: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no contract/users/rating)")

    def _wp_by_user(self):
        """{user legacy id: WorkerProfile pk} — for attaching profile sub-objects by post_author."""
        return dict(WorkerProfile.objects.exclude(user__legacy_id=None).values_list("user__legacy_id", "id"))

    def _stage_portfolio(self):
        """wt_portfolio posts → profiles.PortfolioItem (image from _thumbnail_id, tags → skills)."""
        wp = self._wp_by_user()
        tagnames = self._term_names(["portfolio_tags"])
        n_new = n_upd = n_skip = 0
        for batch in self._batched_posts("wt_portfolio", ["publish", "draft"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids, ["_thumbnail_id", "portfolio_views"])
            urls = self._attachment_urls([meta.get(i, {}).get("_thumbnail_id") for i in ids])
            tags = self._term_map(ids, ["portfolio_tags"])
            for p in batch:
                prof = wp.get(p["post_author"])
                if not prof:
                    n_skip += 1
                    continue
                m = meta.get(p["ID"], {})
                url = urls.get(self._int(m.get("_thumbnail_id")), "")
                defaults = {
                    "profile_id": prof,
                    "title": self._clean(p["post_title"])[:120] or "عمل",
                    "description": self._clean(p["post_content"]),
                    "media_type": PortfolioItem.MediaType.IMAGE if url else PortfolioItem.MediaType.LINK,
                    "url": url, "cover_url": url,
                    "views_count": self._int(m.get("portfolio_views"), 0) or 0,
                    "skills": [tagnames[t] for t in tags.get(p["ID"], []) if t in tagnames][:20],
                }
                obj, created = self._upsert(PortfolioItem, p["ID"], defaults, created_at=self._dt(p["post_date"]))
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
        self.stdout.write(f"  portfolio: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no worker profile)")

    def _stage_addons(self):
        """addons-services → gigs.ServiceAddon, linked via each micro-service's `_addons` list."""
        smap = dict(Service.objects.exclude(legacy_id=None).values_list("legacy_id", "id"))
        n_new = n_upd = 0
        for batch in self._batched_posts("micro-services", ["publish", "pending", "draft", "deleted"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids, ["_addons"])
            pairs = []  # (addon_post_id, service_pk) — a legacy add-on can be shared by several services
            for p in batch:
                spk = smap.get(p["ID"])
                if not spk:
                    continue
                parsed = self._php_unserialize(meta.get(p["ID"], {}).get("_addons")) or {}
                for v in (parsed.values() if isinstance(parsed, dict) else parsed):
                    aid = self._int(v)
                    if aid:
                        pairs.append((aid, spk))
            if not pairs:
                continue
            aids = list({aid for aid, _ in pairs})
            titles, prices = {}, {}
            for i in range(0, len(aids), 500):
                chunk = aids[i:i + 500]
                ph = ",".join(["%s"] * len(chunk))
                for r in self._rows(f"SELECT ID, post_title FROM {WP}posts WHERE ID IN ({ph})", chunk):
                    titles[r["ID"]] = r["post_title"]
                prices.update(self._meta_map(f"{WP}postmeta", "post_id", chunk, ["_price"]))
            for aid, spk in pairs:
                defaults = {
                    "service_id": spk,
                    "title": self._clean(titles.get(aid, ""))[:120] or "إضافة",
                    "price": self._money(prices.get(aid, {}).get("_price"), 10**8, 0) or 0,
                }
                # composite key so a shared add-on attaches to EVERY service that lists it
                obj, created = self._upsert(ServiceAddon, spk * 10**10 + aid, defaults)
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
        self.stdout.write(f"  service add-ons: +{n_new} new, ~{n_upd} updated")

    def _stage_history(self):
        """Serialized _experience / _educations / _awards on freelancer posts → Employment / Education /
        Certificate. Replace-all per profile (idempotent); only touches profiles that have history."""
        wp = self._wp_by_user()
        n_emp = n_edu = n_cert = n_skip = 0
        for batch in self._batched_posts("freelancers", ["publish", "pending", "draft"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids, ["_experience", "_educations", "_awards"])
            # parse first so we can batch-resolve the award image attachments
            parsed, attach_ids = {}, []
            for p in batch:
                m = meta.get(p["ID"], {})
                exp = self._php_unserialize(m.get("_experience")) or {}
                edu = self._php_unserialize(m.get("_educations")) or {}
                awd = self._php_unserialize(m.get("_awards")) or {}
                exp = [e for e in (exp.values() if isinstance(exp, dict) else exp) if isinstance(e, dict)]
                edu = [e for e in (edu.values() if isinstance(edu, dict) else edu) if isinstance(e, dict)]
                awd = [a for a in (awd.values() if isinstance(awd, dict) else awd) if isinstance(a, dict)]
                parsed[p["ID"]] = (exp, edu, awd)
                for a in awd:
                    img = a.get("image")
                    if isinstance(img, dict) and self._int(img.get("attachment_id")):
                        attach_ids.append(self._int(img.get("attachment_id")))
            urls = self._attachment_urls(attach_ids)
            for p in batch:
                prof = wp.get(p["post_author"])
                if not prof:
                    n_skip += 1
                    continue
                exp, edu, awd = parsed[p["ID"]]
                if not (exp or edu or awd):
                    continue
                emp_rows = [Employment(
                    profile_id=prof, job_title=self._clean(e.get("title"))[:120] or "—",
                    company=self._clean(e.get("company"))[:120],
                    period_from=self._clean(e.get("startdate"))[:10],
                    period_to=self._clean(e.get("enddate")).split(" ")[0][:20],  # drop ' 00:00:00' time
                    description=self._clean(e.get("description")),
                ) for e in exp if e.get("title") or e.get("company")]
                edu_rows = [Education(
                    profile_id=prof, school=self._clean(e.get("institute"))[:120] or "—",
                    area_of_study=self._clean(e.get("title"))[:120],
                    date_from=self._clean(e.get("startdate"))[:10],
                    date_to=self._clean(e.get("enddate")).split(" ")[0][:20],  # drop ' 00:00:00' time
                    description=self._clean(e.get("description")),
                ) for e in edu if e.get("institute") or e.get("title")]
                cert_rows = []
                for a in awd:
                    title = self._clean(a.get("title"))
                    if not title:
                        continue
                    date = self._clean(a.get("date"))
                    img = a.get("image") if isinstance(a.get("image"), dict) else {}
                    link = urls.get(self._int(img.get("attachment_id")), "")
                    if not link and img.get("url"):  # fall back to the blob's embedded url (rebased to S3)
                        raw = self._clean(img.get("url"))
                        link = (self.media_base + "/wp-content/uploads/" + raw.split("/wp-content/uploads/", 1)[1]
                                if "/wp-content/uploads/" in raw else raw)
                    cert_rows.append(Certificate(
                        profile_id=prof, name=title[:200],
                        issued_year=(self._int(date[:4]) if len(date) >= 4 else None),
                        issued_month=(self._int(date[5:7]) if len(date) >= 7 else None),
                        verification_link=link[:200],
                    ))
                if self.dry_run:
                    n_emp += len(emp_rows); n_edu += len(edu_rows); n_cert += len(cert_rows)
                    continue
                with transaction.atomic():  # delete + recreate together so a failure can't lose history
                    Employment.objects.filter(profile_id=prof).delete()
                    Education.objects.filter(profile_id=prof).delete()
                    Certificate.objects.filter(profile_id=prof).delete()
                    if emp_rows:
                        Employment.objects.bulk_create(emp_rows)
                    if edu_rows:
                        Education.objects.bulk_create(edu_rows)
                    if cert_rows:
                        Certificate.objects.bulk_create(cert_rows)
                n_emp += len(emp_rows); n_edu += len(edu_rows); n_cert += len(cert_rows)
        self.stdout.write(f"  history: +{n_emp} employment, +{n_edu} education, +{n_cert} certificates ({n_skip} skipped)")

    def _stage_subscriptions(self):
        """usermeta wt_subscription → subscriptions.Membership (legacy plan/quota state preserved)."""
        umap = self._user_map()
        plans = {r["ID"]: self._clean(r["post_title"]) for r in
                 self._rows(f"SELECT ID, post_title FROM {WP}posts WHERE post_type='product'")}
        rows = self._rows(
            f"SELECT user_id, meta_value FROM {WP}usermeta WHERE meta_key='wt_subscription' AND meta_value <> ''")
        n_new = n_upd = n_skip = 0
        for r in (rows[: self.limit] if self.limit else rows):
            uid = umap.get(r["user_id"])
            d = self._php_unserialize(r["meta_value"])
            if not uid or not isinstance(d, dict) or not d:
                n_skip += 1
                continue
            plan_id = self._int(d.get("subscription_id"))
            defaults = {
                "plan_name": (plans.get(plan_id, "") or "")[:120],
                "legacy_plan_id": plan_id,
                "jobs_quota": self._int(d.get("wt_jobs"), 0) or 0,
                "featured_jobs_quota": self._int(d.get("wt_featured_jobs"), 0) or 0,
                "duration_type": self._clean(d.get("wt_duration_type"))[:20],
                "has_banner": self._clean(d.get("wt_banner")).lower() in ("yes", "1", "true"),
                "featured_until": self._dt(d.get("subscription_featured_expiry")),
            }
            if self.dry_run:
                n_new += 1
                continue
            _, created = Membership.objects.update_or_create(user_id=uid, defaults=defaults)
            n_new += created
            n_upd += not created
        self.stdout.write(f"  memberships: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no user/empty)")

    def _chat_files(self, value):
        """Extract file references from a wpguppy `attachments` blob (PHP-serialized or JSON) so
        attachment-only messages keep their content. Returns a list of urls/names for Message.files."""
        if not value or not isinstance(value, str):
            return []
        out = self._php_strings(value)
        if not out and value.lstrip().startswith(("[", "{")):
            try:
                import json
                data = json.loads(value)
                items = data if isinstance(data, list) else [data]
                out = [str(x.get("url") or x.get("file") or x) if isinstance(x, dict) else str(x) for x in items]
            except Exception:  # noqa: BLE001
                out = []
        return [s for s in out if s][:20]

    def _stage_chat(self):
        """wp_wpguppy_message + wp_private_chat (1:1) → chat.Conversation + Message (Postgres = source
        of truth). Firestore mirror is optional (--mirror-firestore) and needs valid creds."""
        umap = self._user_map()
        conv_cache = {}

        def get_conv(u1, u2):
            a, b = (u1, u2) if u1 < u2 else (u2, u1)
            c = conv_cache.get((a, b))
            if c is None:
                c, _ = Conversation.objects.get_or_create(
                    user_a_id=a, user_b_id=b, context_type=Conversation.Context.DIRECT,
                    contract=None, job=None)
                conv_cache[(a, b)] = c
            return c

        # (tag, ts_is_site_local, sql). wpguppy message_sent_time is naive Cairo; private_chat time_gmt is UTC.
        sources = [
            ("g", True, f"SELECT id, sender_id, receiver_id, message AS body, attachments, message_sent_time AS ts "
                        f"FROM {WP}wpguppy_message WHERE (group_id IS NULL OR group_id = 0) ORDER BY id"),
            ("p", False, f"SELECT id, sender_id, receiver_id, chat_message AS body, NULL AS attachments, time_gmt AS ts "
                         f"FROM {WP}private_chat ORDER BY id"),
        ]
        n_msg = n_skip = 0
        for tag, is_local, sql in sources:
            rows = self._rows(sql)
            if self.limit:
                rows = rows[: self.limit]
            for r in rows:
                snd, rcv = umap.get(r["sender_id"]), umap.get(r["receiver_id"])
                if not (snd and rcv and snd != rcv):
                    n_skip += 1
                    continue
                if self.dry_run:
                    n_msg += 1
                    continue
                conv = get_conv(snd, rcv)
                msg, created = Message.objects.update_or_create(
                    firestore_id=f"legacy-{tag}-{r['id']}",
                    defaults={"conversation": conv, "sender_id": snd, "body": self._clean(r["body"]),
                              "files": self._chat_files(r.get("attachments"))})
                if created and (ts := self._dt(r["ts"], assume_local=is_local)):
                    Message.objects.filter(pk=msg.pk).update(created_at=ts)
                n_msg += 1
        if not self.dry_run:
            for conv in conv_cache.values():
                last = conv.messages.order_by("-created_at", "-id").first()
                if last:
                    conv.last_message_snippet = (last.body or "")[:160]
                    conv.last_message_at = last.created_at
                    conv.save(update_fields=["last_message_snippet", "last_message_at"])
        self.stdout.write(f"  chat: {len(conv_cache)} conversations, {n_msg} messages, {n_skip} skipped (no user)")
        if self.mirror_firestore and not self.dry_run:
            self._mirror_chat(conv_cache.values())

    def _mirror_chat(self, conversations):
        try:
            from apps.chat import firestore as fs
        except Exception as exc:  # noqa: BLE001
            self.stdout.write(self.style.WARNING(f"Firestore mirror unavailable: {exc}"))
            return
        n = 0
        for conv in conversations:
            try:
                fs.mirror_conversation(conv)
                for m in conv.messages.all():
                    fs.mirror_message(m)
                    n += 1
            except Exception as exc:  # noqa: BLE001 — bail on the first Firestore failure
                self.stdout.write(self.style.WARNING(f"Firestore mirror stopped at conv {conv.pk}: {str(exc)[:100]}"))
                return
        self.stdout.write(f"  mirrored {n} messages to Firestore")

    def _stage_service_contracts(self):
        """services-orders → service Contract (Contract.service) + the order's rating → Review."""
        umap = self._user_map()
        svc = {s.legacy_id: (s.id, s.worker_id, float(s.base_price))
               for s in Service.objects.exclude(legacy_id=None).only("id", "legacy_id", "worker_id", "base_price")}
        status_map = {"completed": Contract.Status.COMPLETED, "cancelled": Contract.Status.CANCELLED,
                      "hired": Contract.Status.ACTIVE, "publish": Contract.Status.ACTIVE}
        n_c = n_r = n_skip = 0
        for batch in self._batched_posts("services-orders", ["completed", "cancelled", "hired", "publish", "pending"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids,
                                  ["_service_id", "_service_author", "_hired_service_rating", "_review_date", "_service_title"])
            for p in batch:
                m = meta.get(p["ID"], {})
                info = svc.get(self._int(m.get("_service_id")))
                employer = umap.get(p["post_author"])
                worker = umap.get(self._int(m.get("_service_author"))) or (info[1] if info else None)
                if not (info and employer and worker and employer != worker):
                    n_skip += 1
                    continue
                done = self._dt(p["post_date"])
                st = status_map.get(p["post_status"], Contract.Status.COMPLETED)
                obj, created = self._upsert(Contract, p["ID"], {
                    "service_id": info[0], "job_id": None, "employer_id": employer, "worker_id": worker,
                    "title": self._clean(m.get("_service_title"))[:160] or "عقد خدمة",
                    "budget": info[2], "worker_earning": info[2], "commission_amount": 0, "commission_pct": 0,
                    "status": st, "completed_at": done if st == Contract.Status.COMPLETED else None,
                }, created_at=done)
                if obj is None:
                    continue
                n_c += created
                rating = round(self._dec(m.get("_hired_service_rating"), 0) or 0)
                if 1 <= rating <= 5:
                    _, rc = self._upsert(Review, p["ID"], {
                        "contract_id": obj.pk, "author_id": employer, "subject_id": worker,
                        "rating": rating, "comment": "",
                    }, created_at=self._dt(m.get("_review_date")) or done)
                    n_r += rc
        self.stdout.write(f"  service contracts: +{n_c}, reviews +{n_r}, {n_skip} skipped (no service/user)")

    def _stage_reports(self):
        """reports → core.Report. Resolves the reported legacy entity to our id by report type."""
        umap = self._user_map()
        jmap = dict(Job.objects.exclude(legacy_id=None).values_list("legacy_id", "id"))
        smap = dict(Service.objects.exclude(legacy_id=None).values_list("legacy_id", "id"))
        kind_map = {"freelancer": Report.Kind.FREELANCER, "employer": Report.Kind.FREELANCER,
                    "job": Report.Kind.JOB, "project": Report.Kind.JOB, "service": Report.Kind.SERVICE}
        n_new = n_upd = n_skip = 0
        for batch in self._batched_posts("reports", ["publish", "pending", "draft"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids, ["_report_type", "_reported_id"])
            post_author = self._post_authors([self._int(meta.get(i, {}).get("_reported_id")) for i in ids])
            for p in batch:
                m = meta.get(p["ID"], {})
                # reporter = the report post's author (the plugin's _user_by is an internal id, not a user)
                reporter = umap.get(p["post_author"])
                rtype = self._clean(m.get("_report_type")).lower()
                kind = kind_map.get(rtype)
                if not (reporter and kind):
                    n_skip += 1
                    continue
                reported = self._int(m.get("_reported_id"))
                if rtype in ("freelancer", "employer"):
                    obj_id = umap.get(post_author.get(reported))
                elif rtype in ("job", "project"):
                    obj_id = jmap.get(reported)
                else:
                    obj_id = smap.get(reported)
                obj, created = self._upsert(Report, p["ID"], {
                    "kind": kind, "object_id": obj_id or 0, "reporter_id": reporter,
                    "reason": rtype[:40], "detail": self._clean(p["post_content"])[:1000],
                    "status": Report.Status.ACTIONED,  # historical reports → not re-opened
                }, created_at=self._dt(p["post_date"]))
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
        self.stdout.write(f"  reports: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no reporter/type)")

    def _stage_tickets(self):
        """emd_ticket → tickets.Ticket (historical, closed). Orphan wpsc threads have no parent → skipped."""
        umap = self._user_map()
        ttype, _ = TicketType.objects.get_or_create(slug="general", defaults={"name_ar": "عام", "is_active": True})
        n_new = n_upd = n_skip = 0
        for batch in self._batched_posts("emd_ticket", ["publish", "pending", "draft", "private"]):
            for p in batch:
                # wpas_form_submitted_by holds an EMAIL — the reliable submitter id is post_author
                user = umap.get(p["post_author"])
                if not user:
                    n_skip += 1
                    continue
                obj, created = self._upsert(Ticket, p["ID"], {
                    "user_id": user, "type_id": ttype.id,
                    "title": self._clean(p["post_title"])[:160] or "تذكرة",
                    "message": self._clean(p["post_content"]) or "—",
                    "status": Ticket.Status.CLOSED,
                }, created_at=self._dt(p["post_date"]))
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
        self.stdout.write(f"  tickets: +{n_new} new, ~{n_upd} updated, {n_skip} skipped (no user)")

    def _stage_milestones(self):
        """wt-milestone → contracts.Submission (linked to the project's contract)."""
        cmap = {c["job__legacy_id"]: c["id"]
                for c in Contract.objects.exclude(job__legacy_id=None).values("id", "job__legacy_id")}
        status_map = {"completed": Submission.Status.ACCEPTED, "hired": Submission.Status.OPEN}
        n_new = n_upd = n_skip = 0
        for batch in self._batched_posts("wt-milestone", ["publish", "pending", "draft"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids, ["_project_id", "_price", "_status", "_hired_date"])
            for p in batch:
                m = meta.get(p["ID"], {})
                contract_id = cmap.get(self._int(m.get("_project_id")))
                if not contract_id:
                    n_skip += 1
                    continue
                price = self._money(m.get("_price"), 10**10, 0) or 0
                obj, created = self._upsert(Submission, p["ID"], {
                    "contract_id": contract_id,
                    "notes": self._clean(p["post_title"]) or f"Milestone ({price})",
                    "status": status_map.get(self._clean(m.get("_status")).lower(), Submission.Status.OPEN),
                }, created_at=self._dt(m.get("_hired_date")) or self._dt(p["post_date"]))
                if obj is None:
                    continue
                n_new += created
                n_upd += not created
        self.stdout.write(f"  milestones: +{n_new} submissions, ~{n_upd} updated, {n_skip} skipped (no contract)")

    def _stage_disputes(self):
        """disputes → flag the project's Contract as disputed (BR-22)."""
        umap = self._user_map()
        cmap = {c["job__legacy_id"]: c["id"]
                for c in Contract.objects.exclude(job__legacy_id=None).values("id", "job__legacy_id")}
        n_upd = n_skip = 0
        for batch in self._batched_posts("disputes", ["publish", "pending", "draft"]):
            ids = [p["ID"] for p in batch]
            meta = self._meta_map(f"{WP}postmeta", "post_id", ids, ["_project_id", "_dispute_project", "_send_by", "winning_party"])
            for p in batch:
                m = meta.get(p["ID"], {})
                cid = cmap.get(self._int(m.get("_project_id") or m.get("_dispute_project")))
                if not cid:
                    n_skip += 1
                    continue
                if self.dry_run:
                    n_upd += 1
                    continue
                Contract.objects.filter(id=cid).update(
                    status=Contract.Status.DISPUTED,
                    resolution_note=self._clean(m.get("winning_party"))[:300],
                    cancel_requested_by_id=umap.get(self._int(m.get("_send_by"))))
                n_upd += 1
        self.stdout.write(f"  disputes: {n_upd} contracts flagged disputed, {n_skip} skipped (no contract)")

    # ── post paging helper ───────────────────────────────────────────────────────────────────
    def _batched_posts(self, post_type, statuses):
        """Yield lists of wp_posts rows (id-paged) for a post_type, respecting --limit/--batch."""
        sph = ",".join(["%s"] * len(statuses))
        where = f"post_type=%s AND post_status IN ({sph})"
        buf = []
        for row in self._iter_paged(
            f"{WP}posts", "ID", where, [post_type, *statuses],
            # post_date is naive Cairo-local; post_date_gmt is UTC. Prefer the GMT column (falling back
            # to local only when GMT is unset) so every post-derived timestamp lands as correct UTC.
            select="ID, post_author, post_title, post_content, post_status, "
                   "COALESCE(NULLIF(post_date_gmt,'0000-00-00 00:00:00'), post_date) AS post_date",
        ):
            buf.append(row)
            if len(buf) >= self.batch:
                yield buf
                buf = []
        if buf:
            yield buf
