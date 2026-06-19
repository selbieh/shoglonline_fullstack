# ShoghlOnline — Full QA, Flow Validation & Test-Coverage Report

**Prepared:** 2026-06-19 · **Scope:** entire full-stack application (Django 5 / DRF / Celery backend + Next.js 14 frontend) · **Method:** static code analysis of all 18 backend apps and ~47 frontend routes, plus live execution of the backend (pytest) and frontend (vitest, tsc, ruff) suites in an isolated environment.

> **Headline result.** The project is in **strong, near-release shape**. Every automated suite passes after the fixes in this engagement: **543 backend tests green at 90.71 % coverage**, **58 frontend tests green**, **TypeScript clean**, **ruff clean**. Five concrete defects were found and **fixed in code** during this pass (one of them broke the suite on the repo's own default test backend). No money-handling, authorization, or data-integrity defect was found. The remaining gaps are the launch-hardening items the team already tracks (httpOnly-cookie auth, external escrow pen-test, file-storage) plus a short list of medium/low issues catalogued below.

---

## 0. What was actually executed (evidence)

| Check | Command | Result |
|---|---|---|
| Backend unit/integration/security/regression suite | `pytest` (sqlite, `config.settings.test`) | **543 passed, 0 failed** |
| Backend coverage gate | `--cov=apps --cov-fail-under=90` | **90.71 % — gate met** |
| Backend lint | `ruff check .` | **All checks passed** (after fix) |
| Frontend unit/component suite | `vitest run` | **58 passed, 0 failed** (14 files) |
| Frontend types | `tsc --noEmit` | **Clean** |
| Frontend production build | `next build` | Compiled; full route table not capturable in sandbox (process reaping) — `tsc` covers the same type surface |

Before fixes the backend suite had **3 failing** money-invariant cases and the frontend had **3 failing** profile-page cases; both are resolved (see §11 & §0.1).

### 0.1 Changes made in this engagement (5 fixes)

1. **`tests/regression/test_money_invariants.py`** — the BR-24 "no cent created or destroyed" property test summed the ledger with the DB's `SUM()`. On SQLite (the repo's documented default `make test` backend) `SUM()` over a `DecimalField` returns a **float**, drifting to values like `24.9899999999999` and failing 3/5 seeds. Reworked to sum in Python with `Decimal`, so the invariant is now exact on **every** backend (Postgres CI was already green; local sqlite was silently red).
2. **`app/me/profile/__tests__/page.test.tsx`** — the profile page now fetches `GET /categories` inside its `Promise.all`, but the test's MSW mock was never updated, so the request rejected, the whole `Promise.all` bailed to the `.catch`, and the page hung on "جارٍ التحميل…" — failing 3 cases. Added the missing `/categories` handler.
3. **`apps/profiles/api/serializers.py`** — fixed an unsorted import block (ruff `I001`) that failed `make lint` / CI.
4. **Hardcoded `http://localhost:3000`** in three production link-builders (`notifications/services.py`, `affiliate/services.py`, `subscriptions/tasks.py`) — these put **localhost links into real user emails and referral URLs**. Introduced an env-driven `settings.FRONTEND_URL` (documented in `.env.example`) and wired all three to it.
5. **`.env.example`** — documented the new `FRONTEND_URL` variable.

All fixes were verified by re-running the full backend suite (543 green, 90.71 %), ruff (clean), and the affected frontend tests (green).

---

## 1. Complete application flow map

**Identity & entry.** Google-SSO-only (`GOOGLE_AUTH_STUB` for dev) → backend exchanges the Google token for a JWT pair (15-min access, rotating refresh + blacklist). First login or a user with no `active_mode` is routed to **`/onboarding/mode`**; from there to dashboard. One account holds **both** roles; "Find Job ⇄ Find Worker" (`active_mode`) is a **view preference, not a security boundary** (SRS §3.1, BR-1).

**Two engagement models, one settlement core.**
- **Jobs path:** employer posts a Job → (auto-publish *or* admin moderation queue, per `jobs.auto_publish`) → workers submit **Proposals** (consume bids unless invited) → employer accepts one (row-locked, single award) → **Contract** created.
- **Services/gigs path:** worker publishes a productized **Service** → employer sends a **buying request** (qty + add-ons, total frozen) → worker accepts → **Contract** created.
- **Both** converge on the identical **escrow → delivery → warranty → commission → dispute** Contract layer.

**Money core (PayPal-only, USD).** Wallet with three buckets (`available` / `escrow_held` / `earnings_pending`); append-only double-entry ledger where balances always equal Σ succeeded rows; idempotency keys dedupe gateway retries. Funding moves `available → escrow_held`; acceptance splits escrow into worker `earnings_pending` + platform commission (frozen at contract creation); warranty-end sweeper releases `earnings_pending → available` and simultaneously flips chat read-only, locks reviews, and accrues affiliate commission — **one atomic transition (BR-10)**.

**Cross-cutting services.** Notifications (in-app + email + FCM-stub via one `notify()` fan-out); real-time chat (Firestore mirror); reviews (mutual, completed-contracts-only, editable during warranty then locked); support tickets (open→answered→solved→closed state machine, dispute-coupled); period invoices (PDF via reportlab); affiliate/referral; CMS pages/FAQ; admin analytics (KPI dashboard).

**Admin plane.** Django **Unfold** admin (staff-only) hosts moderation queues (jobs/proposals/services), dispute resolution (BR-22 picker: resume/complete/cancel/split), user freeze/activate, commission-rule CRUD, ledger (read-only), broadcasts, and the KPI dashboard. A maintenance-mode middleware (`platform.maintenance_mode`) 503s the public site while keeping staff in.

```
Google SSO ─▶ JWT ─▶ /onboarding/mode ─▶ Dashboard
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        ▼ (Find Worker)                    ▼ (Find Job)                       ▼ (Staff)
   Post Job ──▶ [moderation?] ──▶ Publish   Browse Jobs/Services        Unfold Admin
        │                                   Submit Proposal / Buy Req         │
        └──────────────▶ Accept ◀───────────────────┘                        │
                          │                                                    │
                          ▼                                                    │
              CONTRACT (escrow) ──▶ Fund ──▶ Deliver ──▶ Accept ──▶ Warranty ─┤─▶ Release
                          │                                   │                │   (funds+chat-lock
                          ├─▶ Update requests                 └─▶ Reject/resubmit│   +review-lock
                          ├─▶ Mutual cancel (refund)                            │   +affiliate accrual)
                          └─▶ Dispute ───────────────────────────────────────▶ Admin resolve (BR-22)
```

---

## 2. User-journey validation (the three required personas)

The three journeys are exercised end-to-end by the existing suite (notably `tests/regression/test_dual_role_e2e.py`, `tests/integration/test_jobs_api.py`, `tests/integration/test_gigs_api.py`, `tests/integration/test_contracts_api.py`, `tests/test_payments.py`, `tests/integration/test_admin_*`). Status below reflects code + test evidence.

### User A — Freelancer (Find Job)
| Step | Implemented | Evidence / route | Status |
|---|---|---|---|
| Register (Google SSO) | ✅ | `POST /auth/google`, `accounts/services.py` | Pass |
| Verify email | ➖ N/A | Google-verified identity; no separate email-verify step by design | N/A |
| Complete profile | ✅ | `/me/profile`, `profiles/services.py`, completeness % | Pass |
| Upload avatar / portfolio | ✅ | `/me/portfolio/*`, `uploadFile()`, `/uploads` | Pass |
| Add skills | ✅ | `WorkerSkill`, `/skills` taxonomy | Pass |
| Browse / view jobs | ✅ | `/jobs`, `/jobs/[slug]` (public detail) | Pass |
| Submit proposal | ✅ | `POST /jobs/{id}/proposals`, bid consumption + refund rules | Pass |
| Track proposal status | ✅ | `/me/proposals` | Pass |
| Accept contract | ✅ | proposal-accept → contract (worker side) | Pass |
| Complete work / deliver | ✅ | `/contracts/[id]` submit deliverable | Pass |
| Receive payments | ✅ | escrow split → `earnings_pending` → warranty release → `available` → withdraw | Pass |
| ID verification | ✅ | `/me/id-verification` (national ID upload → admin review) | Pass |

### User B — Client / Employer (Find Worker)
| Step | Implemented | Evidence / route | Status |
|---|---|---|---|
| Register / profile | ✅ | same account, `EmployerProfile` lazy-created | Pass |
| Create / edit jobs | ✅ | `/jobs/new`, `/me/jobs`, screening builder | Pass |
| Submit for review / publish | ✅ | moderation gate (`jobs.auto_publish`) | Pass |
| Review proposals | ✅ | `/me/jobs/{id}/proposals` | Pass |
| Hire freelancer | ✅ | `proposals/{id}/accept` (row-locked single award) | Pass |
| Manage contracts | ✅ | `/contracts`, `/contracts/[id]` (fund/cancel/update/dispute) | Pass |
| Approve work | ✅ | `submissions/{id}/accept` → Completed | Pass |
| Release payments | ✅ | accept → escrow split; warranty release sweeper | Pass |
| Invite workers / rehire | ✅ | `/me/jobs/{id}/invitations`, `/me/rehire` | Pass |

### User C — Admin (staff)
| Step | Implemented | Evidence | Status |
|---|---|---|---|
| Review pending approvals | ✅ | Unfold job/proposal/service moderation queues | Pass |
| Approve/reject users | ✅ | freeze/activate user actions (`test_admin_user_actions.py`) | Pass |
| Approve/reject jobs/content | ✅ | bulk approve/reject + audit (`test_admin_bulk_actions.py`, `test_admin_moderation.py`) | Pass |
| Manage disputes | ✅ | BR-22 picker resume/complete/cancel/split (`test_admin_dispute_resolution.py`) | Pass |
| Review transactions | ✅ | read-only ledger admin (`test_admin_ledger_readonly.py`) | Pass |
| Platform settings | ✅ | Global Settings (35-key catalog, ≤60 s cache) | Pass |
| Moderation/audit | ✅ | `AuditLog` on every staff action (`test_auth_audit.py`) | Pass |

---

## 3. Route access matrix (frontend)

Auth model: the central `lib/api.ts` `api()` helper handles `401 → refresh → retry → on-failure clear-tokens + redirect to /signin`. **The API is the real authorization boundary**; per-page `tokens.access` checks are an optimistic UX guard. There is **no Next.js `middleware.ts`** — guarding is client-side + API-side (acceptable because the API enforces every check server-side).

| Route | Access | Guard mechanism | Notes |
|---|---|---|---|
| `/` (landing) | Public | none | SEO |
| `/signin` | Public | none | SSO entry |
| `/jobs`, `/jobs/[slug]` | Public (detail) / data-gated (list) | API 401-redirect | Detail public for SEO; list page renders but personalized calls 401-redirect |
| `/services`, `/services/[slug]` | Public | none | SEO discovery |
| `/freelancers`, `/freelancers/[id]`, `/portfolio/[itemId]` | Public | none | Public profiles (SEO) |
| `/pages/[slug]`, `/faq`, `/gallery` | Public | none | CMS / public content |
| `/onboarding/mode` | Auth (first-login) | API 401-redirect | Reached right after SSO |
| `/onboarding/profile`, `/onboarding/employer` | Auth | `tokens.access` + API | Profile-completion flow |
| `/dashboard` | Auth | `tokens.access` → `/onboarding/mode` if no `active_mode` | — |
| `/me/*` (profile, jobs, proposals, services, portfolio, favorites) | Auth | `tokens.access` | Owner-scoped via API |
| `/contracts`, `/contracts/[id]` | Auth + party | `tokens.access` + object-perm API | Only contract parties (or staff) |
| `/wallet`, `/settings/payouts` | Auth | `tokens.access` | Owner-scoped |
| `/messages`, `/messages/[id]` | Auth | API 401-redirect (list pane) / `tokens.access` (thread) | List is a layout component; data fetch 401-redirects |
| `/notifications`, `/bids`, `/subscriptions`, `/invoices`, `/affiliate`, `/support`, `/tickets/[id]`, `/settings` | Auth | `tokens.access` | — |
| `/jobs/new` | Auth + complete profile | `tokens.access` + API business rules | Posting requires a usable profile |
| Unfold admin (`/admin/`, backend) | Staff only | Django staff session | Separate origin (:8000) |

**Observation (low):** the *list* page `/jobs` carries a `tokens.access` early-guard while the *detail* `/jobs/[slug]` is fully public. This is intentional-looking (SEO on detail) but slightly inconsistent; confirm the jobs **list** is meant to require login. Not a security issue — see §13.

---

## 4. Permission matrix (backend)

DRF permission classes in use across `apps/*/api/views.py`: **`IsAuthenticated` ×62, `AllowAny` ×22, `IsAdminUser` ×1**. There are **no custom `BasePermission` subclasses**; finer authorization (ownership, party-of-contract, self-dealing) is enforced in the **service layer** and verified by `tests/security/test_authorization_matrix.py` and `test_self_dealing.py`.

| Capability | Anonymous | Authenticated user | Contract party | Staff |
|---|---|---|---|---|
| Read public listings (jobs/services/freelancers/pages) | ✅ | ✅ | ✅ | ✅ |
| Register / get JWT | ✅ (SSO) | — | — | — |
| Read own profile/wallet/contracts | ❌ | ✅ (own) | ✅ | ✅ (any) |
| Post job / publish service | ❌ | ✅ | — | ✅ |
| Submit proposal / buying request | ❌ | ✅ (not self) | — | — |
| Self-deal (bid/buy own job/service) | ❌ | **❌ blocked (BR-21)** | — | — |
| Accept proposal / create contract | ❌ | ✅ (job owner) | — | ✅ |
| Fund / deliver / accept / dispute | ❌ | ❌ | ✅ (correct side) | ✅ |
| Resolve dispute (BR-22 picker) | ❌ | ❌ | ❌ | ✅ |
| Moderate jobs/proposals/services | ❌ | ❌ | ❌ | ✅ |
| Freeze/activate user, clawback affiliate | ❌ | ❌ | ❌ | ✅ |
| Edit Global Settings | ❌ | ❌ | ❌ | ✅ |
| Read another user's wallet/contract | ❌ | **❌ 404 (existence hidden)** | n/a | ✅ |

Authorization hardening confirmed in code: attachments return **404 not 403** to hide existence; self-dealing blocked at API level; single-award uses a row lock; frozen accounts are blocked at auth and earn no affiliate commission.

---

## 5. Feature inventory & feature-flag catalog

**35 Global Settings** (`apps/core/services.py`, cached ≤60 s, admin-editable, `is_public` subset exposed to SPA). Key flags by category:

- **Moderation:** `jobs.auto_publish` (F), `proposals.auto_publish` (T), `services.auto_publish` (F).
- **Platform kill-switches:** `registration.enabled`, `platform.maintenance_mode` (+ `maintenance_message_ar`), `uploads.enabled`, `chat.enabled`, `bids.enabled` (off ⇒ free proposals, commission-only), `subscriptions.enabled`, `notifications.broadcast_enabled`.
- **Email:** `emails.enabled`, `emails.chat_unread_enabled`, `chat.unread_email_delay_minutes`.
- **Contracts/money:** `contracts.warranty_days`, `contracts.funding_timeout_hours`, `contracts.overdue_grace_days`, `payments.commission_pct`, `platform.currency` (USD).
- **Bids:** `bids.signup_grant`, `bids.monthly_grant`.
- **Tickets:** `tickets.auto_solve_days`, `tickets.auto_close_days`.
- **Profiles:** `profiles.offline_reminder_days`, `profiles.phone_verification`.
- **Uploads:** `uploads.max_file_mb`, `uploads.max_per_host`, `uploads.allowed_mime` (magic-byte sniffed).
- **Other:** `affiliate.cookie_days`, `jobs.expiry_days`, `jobs.enable_auto_archive`, `conversations.idle_lock_days`, `invoices.period`, `subscriptions.email_mode`.

**Build-time/env flags:** `GOOGLE_AUTH_STUB`, `PAYPAL_STUB`, `FCM_STUB`, plus PayPal/Firebase/S3 credential toggles.

**Backend apps (18):** accounts, profiles, catalog, jobs, bids, contracts, payments, chat, notifications, reviews, tickets, gigs (services), invoices, affiliate, subscriptions, cms, attachments, core.

---

## 6. Backend / integrations / background-jobs inventory

**External integrations (5):**
| Integration | Module | Mode in dev | Notes |
|---|---|---|---|
| Google SSO | `accounts/services.py` (google-auth) | stub | token→JWT exchange |
| PayPal (deposits/withdrawals) | `payments/paypal.py` (REST v2) | `PAYPAL_STUB` | USD only; capture + 5-min reconciliation sweep |
| Firebase / Firestore (chat) | `chat/firebase.py`, `chat/firestore.py` | stub | custom tokens + conversation mirror |
| FCM push | `notifications/push.py` | `FCM_STUB` | one `notify()` fan-out |
| S3 / MinIO storage | `django-storages` (prod) | local FS in dev | attachments |
| Email (SMTP) | Django mail | console backend | honors `emails.enabled` |

**13 scheduled Celery beat jobs** (`config/settings/base.py` `CELERY_BEAT_SCHEDULE`): `expire_jobs` (hourly), `reconcile_pending_deposits` (5 m), `monitor_ledger_invariants` (15 m), `cancel_unfunded_contracts` (15 m, BR-6a), `release_due_warranties` (hourly, BR-10), `notify_overdue_contracts` (6 h), `send_unread_chat_emails` (1 m, AC-6), `lock_idle_conversations` (6 h), `auto_solve_tickets` / `auto_close_tickets` (6 h), `dispatch_scheduled_notifications` (1 m), `send_offline_reminders` (6 h), `sweep_orphan_attachments` (6 h). Resilience covered by `tests/tasks/test_sweeper_resilience.py`.

**Payment flow (verified by `test_payments.py`, `test_payments_ledger.py`, `test_money_invariants.py`):** append-only double-entry ledger; balances reconstructable from rows; idempotent gateway replay; instant hold on withdrawal request (no double-spend window); admin pay/reject with auto-reverse; BR-24 rounding invariant (`hold == worker_earning + commission`) asserted suite-wide.

**API surface:** **236 endpoint path declarations** across 18 `urls.py`. OpenAPI schema at `/api/schema/`, Swagger at `/api/docs/`; response-shape contract tests in `tests/contracts_api/`.

---

## 7. Detailed QA test plan

**Layers & how they're covered today**

1. **Unit (business logic):** commission ranges, state machine, ledger math, KPIs, google-auth — `tests/unit/*`.
2. **Integration (API + multi-service):** jobs, gigs, contracts, payments, chat, admin, uploads, profiles — `tests/integration/*`, top-level `tests/test_*.py`.
3. **Security/authz:** authorization matrix, self-dealing (BR-21), injection, sensitive-data exposure, staff roles, ledger monitor — `tests/security/*`.
4. **Regression (locked bugs):** money invariants (BR-24), dual-role e2e, unicode slug routing — `tests/regression/*`.
5. **Tasks (Celery, eager + frozen clock):** contract sweepers, offline reminder, scheduled notifications, sweeper resilience — `tests/tasks/*`.
6. **Contract/DB:** error envelope, pagination, query-count budgets — `tests/contracts_api/*`, `tests/db/*`.
7. **Frontend:** page/component behavior with MSW-mocked API (profile, dashboard, jobs, bids, settings, notifications, subscriptions, proposal form, payment methods, file upload) + lib (api, seo, settings) — `vitest`.

**Recommended additions (see §14 for the gap-driven list):** raise coverage on the five thin view modules; add Playwright E2E (the `e2e/` folder exists but is not in the default gate) for the three personas against a booted stack; add a contract test asserting emails contain `FRONTEND_URL` (locks fix #4).

---

## 8. Functional test cases (representative, by workflow)

Format: ID · scenario · expected. ✅ = covered by an existing automated test; ✚ = recommended new case.

**Auth**
- FT-AUTH-01 ✅ First SSO login creates account + routes to mode select.
- FT-AUTH-02 ✅ `registration.enabled=false` blocks *new* users only, not returning ones.
- FT-AUTH-03 ✅ Frozen account is blocked at login.
- FT-AUTH-04 ✅ Refresh rotates + blacklists old token.
- FT-AUTH-05 ✚ Expired access auto-refreshes once then redirects on second 401 (frontend `api()` path).

**Jobs / proposals**
- FT-JOB-01 ✅ Post with `auto_publish=false` lands in moderation; `=true` goes live.
- FT-JOB-02 ✅ Self-proposal on own job rejected (BR-21).
- FT-JOB-03 ✅ Bid consumed on proposal; refunded on moderation-reject / job-closed.
- FT-JOB-04 ✅ Single award per job under concurrency (row lock).
- FT-JOB-05 ✅ Title lock (BR-4) after first proposal.
- FT-JOB-06 ✅ Expiry sweeper closes stale jobs + refunds bids.

**Contracts / money**
- FT-CON-01 ✅ Accept → contract with commission frozen at creation.
- FT-CON-02 ✅ Fund moves available→escrow; unfunded 48 h auto-cancel reverts job+proposal (BR-6a).
- FT-CON-03 ✅ Accept submission splits escrow; warranty release moves earnings_pending→available (BR-10).
- FT-CON-04 ✅ Dispute split refunds X% + payout minus recalculated commission, each leg a ledger row.
- FT-CON-05 ✅ BR-24: `hold == worker_earning + commission` exactly, all paths (now backend-agnostic after fix #1).
- FT-CON-06 ✅ Double-accept / double-fund idempotent.

**Services / reviews / tickets / invoices / affiliate**
- FT-SVC-01 ✅ Buying-request total frozen; self-buy blocked; pause doesn't touch running contracts.
- FT-REV-01 ✅ Review editable in warranty, born-locked after warranty end.
- FT-TKT-01 ✅ Dispute-type ticket can't close until contract dispute resolved.
- FT-INV-01 ✅ Invoice period gather + employer-confirm → PDF.
- FT-AFF-01 ✅ Accrual at warranty release (not acceptance); freeze stops accrual; clawback path; self-referral void.

---

## 9. Integration & API test cases (representative)

- IT-API-01 ✅ OpenAPI response shapes stable (`contracts_api/test_error_envelope.py`, `test_pagination.py`).
- IT-API-02 ✅ Standard error envelope on validation failure.
- IT-API-03 ✅ Cross-user access to wallet/contract returns 404 (existence hidden).
- IT-API-04 ✅ Upload MIME allow-list enforced by magic-byte sniff (disguised file rejected).
- IT-API-05 ✅ Maintenance mode 503s public API but not staff (`test_maintenance_mode.py`).
- IT-API-06 ✅ Category-subscription fan-out skips the poster, honors kill-switch.
- IT-INT-07 ✅ PayPal deposit capture + reconciliation of lost webhook (stub).
- IT-INT-08 ✅ Firestore conversation mirror writes string participants.
- IT-INT-09 ✚ PayPal **withdrawal** REST path against sandbox credentials (currently stub-only; exercise before go-live).
- IT-INT-10 ✚ FCM real-send smoke once credentials provisioned (`FCM_STUB=0`).

---

## 10. UI validation checklist

Per-screen interactive inventory was reviewed against the 14 component/page test files. Controls under automated test: proposal form (validation + bid counter), file upload, payment-methods CRUD, settings toggles, notifications mark-all-read, bids ledger, dashboard KPIs, subscriptions, profile edit (now incl. category select).

| Area | Buttons/links | Forms | Tables/lists | Modals/drawers | Status |
|---|---|---|---|---|---|
| Auth/onboarding | SSO, mode select | mode, profile | — | — | ✅ (mode/profile tested) |
| Jobs | post, filter, paginate, watch, propose | new-job, proposal | listing | screening builder | ✅ proposal + filters tested |
| Contracts | fund, deliver, accept, reject, cancel, dispute, update | submission, update-req | timeline | dispute/cancel confirm | ⚠ flows tested via API; recommend E2E on `/contracts/[id]` UI |
| Wallet | charge, withdraw | charge, withdraw | ledger | — | ✅ payment-methods tested; ✚ withdraw-form UI test |
| Messages | send, open-chat | composer | conversation list | read-only state | ⚠ composer-disabled state asserted in logic; ✚ add component test |
| Reviews/tickets | rate, reply | review, ticket | thread | — | ✅ status machine (API) |
| Admin (Unfold) | approve/reject, resolve, freeze | settings | queues, ledger | dispute picker | ✅ via integration tests |

**No dead/non-functional buttons, broken internal links, or missing-handler controls were found in the reviewed pages.** Items marked ✚/⚠ are *test-coverage* gaps, not defects. Accessibility: RTL throughout; recommend an automated `axe` pass before launch (not currently in the suite) — see §13.

---

## 11. Bug report (with severity)

| ID | Severity | Area | Description | Status |
|---|---|---|---|---|
| BUG-01 | **High** (test integrity) | backend tests | BR-24 money-invariant test summed via DB `SUM()`; SQLite returns float → 3/5 seeds fail on the repo's default `make test`. Masked a critical invariant locally. | **Fixed** (sum in Python `Decimal`) |
| BUG-02 | **Medium** | frontend tests | Profile-page test missing `/categories` MSW mock → `Promise.all` rejects → page stuck loading → 3 cases fail. | **Fixed** (added handler) |
| BUG-03 | **Medium** | production correctness | Hardcoded `http://localhost:3000` in 3 email/referral link-builders → broken links in production emails & referral URLs. | **Fixed** (env-driven `FRONTEND_URL`) |
| BUG-04 | **Low** | CI/lint | Unsorted import block fails `ruff`/`make lint`. | **Fixed** |
| BUG-05 | **Low** | frontend UX robustness | `me/profile` loads 5 endpoints in one `Promise.all`; any single failure (e.g. transient `/categories`) bounces an authenticated user to `/signin` instead of degrading gracefully. | Open — recommend decoupling non-critical fetches |
| BUG-06 | **Low** | consistency | `/jobs` list early-guards on token while `/jobs/[slug]` is public; confirm intended. | Open — verify product intent |

No defects were found in authorization, escrow/ledger math, state machines, or data constraints.

---

## 12. Missing-functionality report

These are **known, tracked launch-hardening items** (README "Next") — infra, not functional gaps:

1. **Submission file uploads → durable storage** (S3/MinIO wiring for prod) — code present, needs credentials + verification.
2. **JWT → httpOnly cookies** — tokens currently in `localStorage` (XSS-exfil risk). See §13.
3. **External wallet/escrow penetration test** (SEC-11 / AC-13) — mandatory, an outside engagement.
4. **PayPal live path** (deposit *and* withdrawal) exercised only in stub — run against sandbox/live creds before go-live.
5. **FCM live push** — stub only.
6. **Email/identity:** no standalone email-verification step (by design, since SSO is Google-verified) — confirm this matches policy for any future non-Google auth.

No required SRS *functional* requirement was found unimplemented; the README's phase log (Phases 0–9) maps to working, tested code.

---

## 13. Security findings

| ID | Severity | Finding | Recommendation |
|---|---|---|---|
| SEC-01 | **Medium** | JWT access/refresh stored in `localStorage` (`sh_access`/`sh_refresh`) → readable by any XSS. Already on the team's roadmap. | Move to httpOnly+SameSite cookies (tracked item #2). |
| SEC-02 | **Low/Info** | No Next.js `middleware.ts`; route protection is client-side + central `api()` 401-redirect. API enforces all authz server-side, so this is **defense-in-depth, not a hole**. | Optionally add edge middleware to avoid protected-content flash. |
| SEC-03 | **Low** | `CORS_ALLOW_ALL_ORIGINS` defaults **True** in base settings (safe only because API is Bearer/no-cookies). If SEC-01 moves to cookies, this becomes dangerous. | Set `False` + explicit origins in production *now*; mandatory if cookies adopted. |
| SEC-04 | Info | Dev `SECRET_KEY` has an insecure default; `.env.example` JWT HMAC key < 32 bytes (test warning). | Enforce strong `DJANGO_SECRET_KEY` + ≥32-byte signing key in prod (preflight check exists). |
| SEC-05 | Info | Upload MIME allow-list is enforced by magic-byte sniffing (good); ensure the same on the durable-storage path once wired. | Verify after storage item #1. |

**Confirmed-good security controls:** self-dealing blocked (BR-21), existence-hiding 404s, append-only ledger with an invariant monitor task, frozen-account ripple, audit log on staff actions, injection tests, rotating/blacklisted refresh tokens, maintenance-mode staff carve-out. The dedicated suites `tests/security/*` all pass.

---

## 14. Code-coverage gap analysis

Overall backend coverage **90.71 %** (gate 90 %). Thinnest modules (lines of real logic least exercised) — prioritize tests here:

| Module | Coverage | Gap |
|---|---|---|
| `apps/subscriptions/api/views.py` | **61 %** | subscribe/unsubscribe + email-mode branches |
| `apps/invoices/api/views.py` | **77 %** | reject path, period-edge validation |
| `apps/notifications/api/views.py` | **80 %** | preference-suppression + pagination branches |
| `apps/reviews/api/views.py` | **81 %** | edit-after-lock rejection, summary endpoint |
| `apps/tickets/api/views.py` | **83 %** | on-hold + dispute-close gating branches |
| `apps/subscriptions/tasks.py` | 84 % | retry/back-off branch |
| Admin modules (`*/admin.py`) | 49–71 % | bulk-action branches (lower-risk; mostly Unfold glue) |

**Frontend:** 58 tests cover the highest-traffic pages/components, but several authenticated pages have **no component test** (`/wallet` withdraw form, `/messages` composer read-only state, `/contracts/[id]` action buttons, `/affiliate`, `/invoices`). Recommend adding MSW-based tests for these and wiring the existing `e2e/` Playwright folder into CI for the three personas.

**Dead/unreachable code:** none material found. The three `FRONTEND_URL` constants are now live (fix #3). `settings.DEBUG` branches in `accounts/services.py` are dev-only stub paths (intentional, guarded).

---

## 15. Final release-readiness assessment

**Verdict: CONDITIONAL GO — green on functionality and automated quality; blocked only by the pre-existing, already-tracked launch-hardening items.**

| Dimension | State | Blocker for launch? |
|---|---|---|
| Functional completeness (SRS Phases 0–9) | ✅ Implemented + tested | No |
| Automated test health | ✅ 543 backend / 58 frontend / tsc / ruff all green | No |
| Backend coverage | ✅ 90.71 % (gate met) | No |
| Money/escrow correctness | ✅ Invariants hold on every backend (post-fix) | No |
| Authorization & data integrity | ✅ No defects found | No |
| Token storage (httpOnly cookies) | ⚠ localStorage today | **Recommended before public launch** |
| CORS hardening in prod | ⚠ `ALLOW_ALL=True` default | **Set False in prod env now** |
| PayPal live + FCM live | ⚠ stub-verified only | **Verify against creds before go-live** |
| External escrow pen-test (SEC-11/AC-13) | ⛔ not yet done | **Mandatory pre-launch** |
| Durable file storage (S3) | ⚠ code ready, unverified | Verify pre-launch |

**Recommended sequence to "solid for production":** (1) flip CORS + secrets for prod (config-only, do today); (2) wire & verify S3 storage + PayPal/FCM live paths in staging; (3) adopt httpOnly-cookie auth + retire localStorage tokens; (4) commission the external escrow pen-test; (5) backfill the five thin view-coverage modules and enable Playwright E2E in CI. Items 1, 5 are quick; 2–4 are the real gating work and are already on the team's list.

---

*Appendix — files changed this engagement:* `backend/tests/regression/test_money_invariants.py`, `backend/apps/profiles/api/serializers.py`, `backend/config/settings/base.py`, `backend/apps/notifications/services.py`, `backend/apps/affiliate/services.py`, `backend/apps/subscriptions/tasks.py`, `frontend/app/me/profile/__tests__/page.test.tsx`, `.env.example`.
