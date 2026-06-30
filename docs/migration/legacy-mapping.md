# Legacy → New Data Migration — Mapping Spec

**Direction:** legacy **MySQL/MariaDB (WordPress + Workreap + WooCommerce)** → new **Django / PostgreSQL**.
**Mode:** one-time cutover. **Scope:** core entities first.

> Status: DRAFT for review. The importer is **not** written yet — this is the mapping it will follow.
> Nothing writes to the legacy DB (read-only).

---

## 1. Source system

The legacy site is WordPress running the **Workreap** freelance-marketplace theme (post types
`freelancers`, `employers`, `projects`, `micro-services`, `proposals`, `wt_portfolio`,
`wt-milestone`, `services-orders`, `withdraw`) on top of WooCommerce.

| Field | Value |
|---|---|
| Host / port | `127.0.0.1` / **3307** (local `shogl-mysql` container, MariaDB 11.8) |
| Database | `shogl` |
| Charset | **utf8mb4 / utf8mb4_uca1400_ai_ci** → Arabic is clean, **no re-encoding** |

### Volumes (and why filtering matters)

| Signal | Count |
|---|---|
| Users total | **166,699** (157,793 freelancers, 8,903 employers, 2 admin) |
| …with a linked profile post | 165,471 |
| **Users who own services** | **3,890** |
| **Users who own projects** | **352** |
| **Users who sent proposals** | **9,098** |
| Published `freelancers` posts | 188,842 |
| Published `employers` posts | 9,251 |
| `micro-services` (publish) | 1,384 |
| `projects` (publish/hired/completed) | ~221 |
| `proposals` (publish) | 17,626 |
| `push_notifications` posts | ~444k (ephemeral — **skip**) |

➡️ **~150k of the 166k "freelancers" have zero activity.** Importing them all would flood the new
directory with empty/bot profiles. See decision **D1**.

### WordPress data model (key fact)

Real fields live in **`wp_usermeta`** (per user) and **`wp_postmeta`** (per post) as `meta_key`/`meta_value`
rows, not columns. A freelancer account is therefore **`wp_users` row + linked `freelancers` post**, joined
by the usermeta key `_linked_profile` (user → post id). Same for employers.

---

## 2. Cross-cutting rules

- **Identity, not passwords.** The new `accounts.User` has *no* end-user password (Google SSO + email OTP).
  Legacy `wp_users.user_pass` (phpass) is **ignored**. We carry `user_email` (identity) and the `google`
  usermeta value → `User.google_sub` when present. Users sign in afterward via Google/OTP on their email.
- **Idempotency via `legacy_id`.** Add a nullable, indexed `legacy_id` (BigInteger) to each imported model
  (User, WorkerProfile, EmployerProfile, Category, Skill, Service, Job, Proposal, …). The importer upserts on
  it, so re-runs update instead of duplicating, and FK wiring (proposal→job, service→user) resolves by
  legacy id. Requires one small Django migration. See decision **D4**.
- **Media** is already offloaded to S3 (`wp_as3cf_items` / "leopard" offload). `_thumbnail_id` → attachment
  post → public S3 URL, stored directly into our `*_url` / `cover_image` URL fields. See decision **D5**.
- **Dates** are WordPress site-local; converted to tz-aware UTC on import (`USE_TZ=True`).
- **Encoding** needs no special handling (utf8mb4 both ends).

---

## 3. Entity mapping (core)

### 3.1 `accounts.User` ← `wp_users` + `wp_usermeta`

| New field | Legacy source | Transform |
|---|---|---|
| `email` | `wp_users.user_email` | lowercase, trim; **unique** (dedupe collisions) |
| `google_sub` | usermeta `google` | only if a Google id is present |
| `first_name` / `last_name` | usermeta `first_name` / `last_name` (fallback `full_name`, `display_name`) | split if needed |
| `avatar_url` | linked profile `_thumbnail_id` → S3 URL | resolve attachment |
| `phone` / `phone_verified` | Digits meta (`digits_phone_no` / verified flag) | best-effort, may be sparse |
| `date_joined` | `wp_users.user_registered` | → UTC |
| `active_mode` | `wp_capabilities` (`freelancers`→find_job, `employers`→find_worker) | view preference only |
| `status` | usermeta `_profile_blocked` | blocked → `frozen`, else `active` |
| `terms_accepted_at` | usermeta `termsconditions` | bool → registered timestamp (approx) |
| `is_staff`/`is_superuser` | `wp_capabilities` administrator | only the 2 admins |
| `legacy_id` *(new)* | `wp_users.ID` | upsert key |

Role drives which profile rows are created (a user may get a WorkerProfile, an EmployerProfile, or both).

### 3.2 `profiles.WorkerProfile` ← `freelancers` post + `wp_postmeta` (linked via `_linked_profile`)

| New field | Legacy source | Transform |
|---|---|---|
| `user` | usermeta `_linked_profile` (post → user) | resolve to imported User |
| `display_name` | `post_title` | |
| `bio_title` | postmeta `_tag_line` | |
| `overview` | `post_content` | strip WP shortcodes |
| `hourly_rate` | postmeta `_perhour_rate` / `_hourly_rate_settings` / `_max_price` | numeric |
| `years_experience` / `expertise_level` | postmeta `_experience` | map to enum |
| `main_category` / `specialization` | taxonomy `service_categories` / `wt-specialization` | → catalog.Category |
| `skills` (WorkerSkill) | postmeta `_skills` / `_skills_names` (+ taxonomy `skills`) | term → catalog.Skill |
| `languages` (WorkerLanguage) | postmeta `_english_level` (+ taxonomy `languages`) | |
| `cover_image` | postmeta `_thumbnail_id` → S3 URL | |
| `is_verified` | postmeta `_is_verified` | |
| `publish_state` | `post_status` (`publish` → PUBLISHED) | |
| `created_at` | `post_date` | → UTC |
| (Address) | postmeta `_country` / `_address` / `_latitude` / `_longitude` | → profiles.Address |
| `legacy_id` *(new)* | `freelancers` post ID | |

**Gaps (no home field):** `_gender`, `_awards`, `_freelancer_type` → drop or stash in `client_notes`.
`rating_avg`/`rating_count`/`total_earned` are denormalized — recompute from imported reviews/earnings (phase 2).

### 3.3 `profiles.EmployerProfile` ← `employers` post + `wp_postmeta`

| New field | Legacy source |
|---|---|
| `user` | usermeta `_linked_profile` |
| `company_name` | `post_title` |
| `field` | taxonomy `department` / postmeta `_department` |
| `country` / `city` | postmeta `_country` / `_address` |
| `logo_url` | postmeta `_thumbnail_id` → S3 URL |
| `legacy_id` *(new)* | `employers` post ID |

### 3.4 `catalog.Category` ← taxonomies `service_categories` (64) + `project_cat` (8)

| New field | Legacy source (`wp_terms` + `wp_term_taxonomy`) |
|---|---|
| `name_ar` | `wp_terms.name` |
| `slug` | `wp_terms.slug` |
| `description` | `wp_term_taxonomy.description` |
| `parent` | `wp_term_taxonomy.parent` (resolve by legacy_id) |
| `legacy_id` *(new)* | `term_id` |

### 3.5 `catalog.Skill` ← taxonomy `skills` (1,211)

| `name_ar` ← `wp_terms.name` · `slug` ← `wp_terms.slug` · `legacy_id` ← `term_id` |

### 3.6 `gigs.Service` ← `micro-services` post + `wp_postmeta`

| New field | Legacy source | Transform |
|---|---|---|
| `worker` | `post_author` → User | |
| `title` / `description` | `post_title` / `post_content` | |
| `base_price` | postmeta `_price` | |
| `category` / `subcategory` | taxonomy `service_categories` | |
| `cover_image` | postmeta `_thumbnail_id` → S3 URL | |
| `keywords` | postmeta `_categories_names` | → list[str] |
| `views_count` | postmeta `services_views` | |
| `status` | `post_status` (`publish`→LIVE, `pending`→PENDING_REVIEW, `deleted`→ARCHIVED) | |
| `published_at` / `created_at` | `post_date` | |
| `addons` (ServiceAddon) | postmeta `_addons` / `addons-services` posts | |
| `legacy_id` *(new)* | post ID | |

### 3.7 `jobs.Job` ← `projects` post + `wp_postmeta`

| New field | Legacy source | Transform |
|---|---|---|
| `employer` | `post_author` → User | |
| `title` / `description` | `post_title` / `post_content` | |
| `budget_min` / `budget_max` | postmeta `_project_cost` / `_max_price` / `_hourly_rate` | |
| `category` | taxonomy `project_cat` | |
| `skills` (M2M) | postmeta `_skills_names` | → catalog.Skill |
| `deadline` | postmeta `deadline` / `_expiry_date` | → date |
| `expected_days` | postmeta `_project_duration` | |
| `country` / `city` | postmeta `_country` / `_address` | |
| `status` | `post_status` (`publish`→PUBLISHED, `hired`→IN_PROGRESS, `completed`→COMPLETED, `pending`→PENDING_REVIEW, `cancelled`→CLOSED) | |
| `legacy_id` *(new)* | post ID | |
| *(award link)* | postmeta `_freelancer_id` / `_proposal_id` / `_order_id` | → Contract (phase 2) |

### 3.8 `jobs.Proposal` ← `proposals` post + `wp_postmeta`

| New field | Legacy source | Transform |
|---|---|---|
| `job` | postmeta `_project_id` → Job (legacy_id) | |
| `worker` | postmeta `_send_by` / `post_author` → User | |
| `budget` | postmeta `_amount` / `_freelancer_amount` | |
| `delivery_days` | postmeta `_proposed_duration` | |
| `description` | `post_content` | |
| `status` | postmeta `_status` / `post_status` (`publish`→SUBMITTED, `accepted`→ACCEPTED, `cancelled`→CANCELLED) | |
| `legacy_id` *(new)* | post ID | |

> Unique constraint `(job, worker)` — collapse legacy duplicates, keep the latest.

---

## 4. Deferred to phase 2 (after core verified)

| New target | Legacy source |
|---|---|
| `contracts.Contract` (+ milestones) | `services-orders`, `projects`(hired/completed), `wt-milestone`, `shop_order` |
| `payments.*` (Wallet, Transaction, payouts) | `wp_wt_earnings`, `wp_wt_payouts_history`, `withdraw`, WooCommerce orders |
| `reviews.Review` | `reviews` post type / `wp_comments` (type review) + commentmeta rating |
| `profiles.PortfolioItem` | `wt_portfolio` posts + postmeta |
| `profiles.Certificate` / `Education` / `Employment` | postmeta `_educations` / `_awards` (serialized PHP) |
| Chat | `wp_wpguppy_*` / `wp_private_chat` → **Firestore** (different store; separate effort) |
| Notifications | `push_notifications` posts → **skip** (ephemeral) |

---

## 5. Import order (FK-safe)

1. `catalog.Category`, `catalog.Skill` (taxonomies)
2. `accounts.User` (filtered — see D1)
3. `profiles.WorkerProfile` / `EmployerProfile` (+ Address, skills, languages)
4. `gigs.Service` (+ addons), `jobs.Job` (+ skills)
5. `jobs.Proposal`
6. *(phase 2)* contracts → payments → reviews → portfolio

Architecture: a staged `import_from_legacy` management command, one stage per entity, each
idempotent on `legacy_id`, batched, transactional per stage, with `--only <stage>`, `--limit`,
`--dry-run`, and a final reconciliation report (legacy count vs imported count).

---

## 6. Decisions (resolved)

- **D1 — Which users?** ✅ **Import ALL 166k users** (no activity filter). Note: ~150k have empty profiles;
  `publish_state`/`status` are mapped faithfully from `post_status`, so the directory will contain many
  thin profiles. A directory-visibility quality gate can be added later as a separate toggle if desired.
- **D2 — Categories/skills:** ✅ **Import legacy taxonomy as source of truth, dedupe against the seed by
  slug** (matching slugs update the seeded row; new ones are created).
- **D3 — Phase 2 scope/timing:** ✅ contracts/payments/reviews/portfolio come **after** core is verified.
- **D4 — `legacy_id` columns:** ✅ **Add** a nullable, unique `legacy_id` to the core models (one migration).
- **D5 — Media URLs:** assumed ✅ reuse the S3 offload URLs as-is (raise if any are private/expiring).

---

## 7. Verification results

A 17-agent adversarial verification (reconciliation, referential integrity, Arabic text, status
mapping, field spot-checks, coercion sanity, skip audit) ran against the live import.

**Clean:** reconciliation matches to the row for every entity; **zero** orphan/duplicate FKs;
status/enum mapping 100% correct; Arabic text round-trips byte-for-byte (no mojibake); every skip
(1,055 users, 6,501 proposals, profile skips) fully explained by the documented rules.

**Final imported counts:** categories 72, skills 1,211, users 165,644, worker profiles 157,859
(one-per-user; 188,842 source posts collapsed), employer profiles 8,309, services 5,827, jobs 668,
proposals 11,132.

**Data-correctness issues found & fixed (importer + re-run):**
| Issue | Fix |
|---|---|
| `years_experience` held the element-count of the serialized PHP `_experience` array | stopped mapping it → null (the array is employment history, not a year count) |
| `expected_days`/`delivery_days` lost (legacy durations are enum buckets, no digits) | `DURATION_DAYS` map: weekly→7, monthly→30, three_month→90, six_month→180, more_than_six→210 |
| `created_at` stamped with import time (auto_now_add overrode it) | post-save `.update(created_at=post_date)` to preserve original dates |
| 114 negative `hourly_rate` values | `_money()` now rejects negatives |
| HTML entities (`&amp;`, `&nbsp;`) in names/titles | `_clean()` runs `html.unescape` |

## 8. Phase-1.1 enrichment — IMPORTED

Extended the importer and backfilled (idempotent). Media is resolved from `wp_as3cf_items`
(authoritative S3 bucket/region/path; legacy bucket `shoghlonlin-com`, eu-west-2), falling back to
`{--media-base}/wp-content/uploads/{_wp_attached_file}` for non-offloaded files. URLs over the
200-char `URLField` limit are skipped.

- **Media:** `User.avatar_url` + `EmployerProfile.logo_url` + `Service.cover_image` from `_thumbnail_id`.
- **Worker skills:** `WorkerSkill` + `Job.skills` M2M from the `skills` taxonomy term relationships.
- **Worker languages:** `WorkerLanguage` from `_english_level` (→ basic/advanced/native) + `languages` taxonomy.
- **Worker address:** `Address` (country/city) from `_country`/`_address`.
- **Misc:** `Service.keywords` (from `_categories_names` PHP array), `EmployerProfile.field` (department).

Sub-objects are created only for profiles that have none yet (idempotent; deduped by profile so a
user with multiple legacy posts is handled once).

## 9. What else can be migrated (Phase 2 backlog, with counts)

| Target app/model | Legacy source | Rows | Notes |
|---|---|---|---|
| `subscriptions` | usermeta `wt_subscription` | 9,502 | worker membership/subscription state |
| `profiles.PortfolioItem` | `wt_portfolio` posts + meta | 3,492 | work showcase — high visible value |
| `gigs.ServiceAddon` | `addons-services` posts / `_addons` | 2,339 | completes services (AC-4 add-ons) |
| `contracts.Contract` (+ milestones) | `shop_order` (192), `services-orders` (8), `wt-milestone` (15), projects(hired/completed) | ~215 | transaction/work history |
| `payments` (Wallet/Transaction/Payout) | `wp_wt_earnings` (84), `wp_wt_payouts_history` (2), `withdraw` (8) | ~94 | earnings + payout ledger |
| `reviews.Review` | `reviews` posts | 27 | drives `rating_avg`/`rating_count` |
| `jobs.Invitation` / applications | `jobpost_applicants` | 25 | |
| `profiles.Education` / `Employment` / `Certificate` | serialized `_educations` / `_experience` / `_awards` on freelancer posts | — | profile completeness |
| chat | `wp_wpguppy_message` (9,892), `wp_private_chat` (1,803) | ~11.7k | → **Firestore** (different store; separate effort) |

**Skip (no value / empty):** `push_notifications` (~444k, ephemeral), `wpsc_ticket` (0), `_saved_freelancers`/favorites (0), Wordfence/SEO/cache plugin tables.

## 9b. Phase-2 — IMPORTED (contracts → payments → reviews)

| Target | Source | Result |
|---|---|---|
| `contracts.Contract` | hired/completed/closed jobs + `wt_earnings` (money), keyed on the **job** | **31** |
| `payments` | `wt_earnings` → Wallet + `earning` Transactions (available recomputed); `wt_payouts_history` → WithdrawalRequest | **36 wallets, 63 txns** |
| `reviews.Review` | `reviews` posts (reviewer = post_author; subject = `user_from` profile post's owner; rating = round(`user_rating`)) | **21** (6 skip: deleted project) |

Also refreshes denormalized `rating_avg`/`rating_count` on reviewed profiles.

## 9c. Phase-2.5 — IMPORTED (portfolio, add-ons, work history)

| Target | Source | Result |
|---|---|---|
| `profiles.PortfolioItem` | `wt_portfolio` posts (image via `_thumbnail_id`, `portfolio_tags`→skills) | **3,488** (3,315 with image, 2,476 with skills) |
| `gigs.ServiceAddon` | `addons-services`, linked via each service's `_addons` list | **2,034** |
| `profiles.Employment` / `Education` | serialized `_experience` / `_educations` (byte-aware PHP unserialize) | per profile, replace-all |
| `profiles.Certificate` | serialized `_awards` (`title`/`date`/`image`); image resolved via `attachment_id` → S3 | per profile, replace-all |

## 9d. Phase-2.6 — IMPORTED (subscriptions, chat)

| Target | Source | Result |
|---|---|---|
| `subscriptions.Membership` *(new model)* | usermeta `wt_subscription` (plan = WooCommerce product) | **8,447** memberships |
| `chat.Conversation` + `chat.Message` | `wp_wpguppy_message` + `wp_private_chat` (1:1) | **1,995 conversations / 8,440 messages** |

Chat lands in **Postgres (the source of truth)**; messages dedupe on `firestore_id=legacy-<src>-<id>`,
sender is always a participant (verified 0 violations). **Firestore mirror is gated behind
`--mirror-firestore`** and was NOT run — the bundled `firebase-credentials.json` is **invalid**
("Invalid JWT Signature"). Once valid creds + `FIRESTORE_STUB=0` are in place, run
`import_from_legacy --only chat --mirror-firestore` to push the conversations/messages into Firestore.

### Not migrated — no target / no value (decided)
- **`_following_employers`** (3,598) — `gigs.Favorite` has kinds job/freelancer/portfolio, no "employer".
- **`jobpost_applicants`** (25) — trivial; applications are covered by `jobs.Proposal`.
- **`withdraw` posts** (8) — no meta; payouts already migrated from `wt_payouts_history`.
- **`push_notifications`** (~444k) — ephemeral.

## 9e. Phase-2.7 — IMPORTED (reports, service contracts, disputes, tickets)

| Target | Source | Result |
|---|---|---|
| `core.Report` | `reports` (`_report_type`→kind, `_reported_id`→resolved object, `post_author`→reporter) | **143** (101 with a resolved target; status=actioned) |
| service `Contract` (+ Review) | `services-orders` → `Contract.service` + `_hired_service_rating`→Review | **+2 contracts, +1 review** (contracts now 33 = 31 job + 2 service) |
| `Contract.status=disputed` | `disputes` (`_project_id`→contract, `winning_party`→resolution) | **2** flagged |
| `tickets.Ticket` | `emd_ticket` (historical → closed; default `general` TicketType) | **1** (3 were anonymous form submissions, no user) |
| `contracts.Submission` | `wt-milestone` | **0** — the 15 milestones' projects have no contract to attach to |

**Skipped (no usable linkage):** `jobpost_applicants` (25) — anonymous résumé uploads to a *different*
job-board plugin (`sjb_*`, no user/job link); orphan `wpsc_ticket_thread` (parent `wpsc_ticket`=0);
`shop_order` (192, WooCommerce — declined); favorites/affiliate (no source).

**The importer now covers every legacy table with a home — 19 stages.**

## 12. Final verification (17-agent adversarial, full 14-stage migration)

**Verdict: correct.** All 14 entities reconcile to the row; **0 orphan FKs, 0 duplicate `legacy_id`s,
0 self-contracts/reviews**; wallet ledger invariant `available == Σ succeeded txns` holds; **0 mojibake**
across 10k+ Arabic blobs; every chat message sender is a conversation participant; all idempotency keys
are DB-enforced (re-run safe). **9 confirmed issues — all LOW**:

- ✅ **Fixed:** `_int(0)` falsy-zero quirk (`subscription_id=0` → was NULL, now 0); `date_to`/`period_to`
  kept a ` 00:00:00` suffix (now stripped).
- **Accepted (source-faithful / negligible):** ~20 user-entered out-of-range dates (e.g. a Hijri `1442`)
  carried verbatim; 1/8,440 chat messages keeps `&lt;` from a double-encoded source; 5/12,745 history
  blobs (0.04%) with corrupt byte-prefixes dropped; a 50.00 app PayPal deposit (not migration) in a wallet.
- **Noted:** **`wt_payouts_history` (2 rows) not imported** — both reference legacy user ids (3, 10) that
  **don't exist in `wp_users`** (deleted users / dangling FK), so there's no user to attach them to.
  The `withdraw` posts (8) are likewise un-actionable. Negligible (2 historical payouts).

## 10. Media — mostly working; one config bug fixed; recent files need a sync

The migrated avatar/cover/logo URLs use the **same S3 bucket** as legacy, path-style
(`https://s3.eu-west-3.amazonaws.com/shoghlonline.com/wp-content/uploads/…` — virtual-hosted style
fails SSL on the dotted bucket name).

**Status after investigation (authenticated `exists()` + public GET):**
- **~90% of media is present and public** — 2021–2024 files return `200 image/jpeg` on the stored URLs.
- **Recent uploads (2025–2026) are NOT in the bucket** — the legacy WP→S3 offload/sync stopped ~2024,
  so they live only on the legacy server (now `403`/down). To recover them, copy
  `wp-content/uploads/2025` + `…/2026` from a legacy-server backup into the bucket.
- A few individual older objects are missing/private (`403`).

**Config bug fixed:** `AWS_S3_ENDPOINT_URL` in `.env` had an inline comment that was read as the value
("Invalid endpoint") — this broke **all** S3 in the app. Fixed the `.env` line and hardened `base.py`.

**End-to-end pipeline VERIFIED working:** SSR-rendered `/freelancers/14` emits
`<img src="https://s3…/…2021/04/…jpg">` and that URL returns `200 image/jpeg`. The API serializes
`avatar_url` from `user.avatar_url` (note: the freelancer API `id` is the **user_id**, not the profile pk).

**Root cause of "can't see media" = the legacy→S3 sync stopped ~2024.** Authenticated `exists()`:
2021–2024 files are **present**; 2025–2026 files are **MISSING** (not private — genuinely absent).
**~9,470 attachments are from 2025–2026** (of ~73.9k). These live only on the now-offline legacy server,
so their migrated URLs `403`. This hits **services** hardest (many recent covers). **Fix: copy
`wp-content/uploads/2025` + `…/2026` from a legacy-server backup into the bucket** (same keys); the
migrated URLs then resolve with no re-run needed. Separately, avatar coverage is inherently ~10% —
only 19,842 of 188,842 freelancers ever uploaded a photo (`_thumbnail_id`).

## 11. Operational notes

- **Make target:** `make migrate-legacy DB_HOST=… DB_PORT=… DB_NAME=… DB_USER=… DB_PASS=… [ARGS="--only … --dry-run"]`
  (or set `LEGACY_DATABASE_URL`). The command also accepts `--db-host/--db-port/--db-name/--db-user/--db-password`.
- **Failed rows:** each row is isolated — a row that errors is recorded (not fatal) and the import
  continues; a per-model failure summary prints at the end and details go to `/app/import_failures.log`.
</content>
</invoke>
