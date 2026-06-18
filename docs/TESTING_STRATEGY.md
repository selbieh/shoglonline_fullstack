# ShoghlOnline — Comprehensive Testing Strategy & Implementation Plan

**Scope:** full-stack test strategy for the Arabic-first jobs & services marketplace
(Django 5 / DRF / Celery / Unfold backend; Next.js 14 / React / Tailwind frontend),
mapped to **SRS v1.1** and the RTL UI/UX designs.

**Status of the codebase at time of writing**

| Layer | Stack | Existing tests |
|---|---|---|
| Backend | Django 5, DRF, Celery, PostgreSQL, Redis, Unfold | **132 pytest tests** in `backend/tests/` (flat `test_*.py`, inline fixtures, no factories, no `conftest.py`) |
| Frontend | Next.js 14 (app router), TypeScript, Tailwind | **None** (only `tsc --noEmit` + `next build` in CI) |
| CI | GitHub Actions | ruff → `makemigrations --check` → pytest (backend); tsc → build (frontend). **No coverage gate, no FE tests, no E2E.** |
| Stubs | Google SSO, PayPal, Firestore, FCM all run in stub mode for dev/test | — |

This document defines the **target** architecture and a file-by-file plan to take the
suite from "happy-path coverage of core money rules" to **near-complete coverage of every
SRS business requirement, user flow, edge case, and integration.**

---

## 1. Testing architecture & folder structure

### 1.1 Test pyramid (target mix)

```
        ▲  E2E (Playwright)            ~5%   — critical journeys only, real browser
       ╱ ╲ Integration (API + DB)      ~30%  — DRF APIClient → services → Postgres
      ╱   ╲ Component / hooks (FE)      ~20%  — Vitest + Testing Library
     ╱     ╲ Unit (services, models,    ~45%  — pure logic, fast, no I/O where possible
    ╱_______╲ utils, serializers)
```

Rationale: the business value lives in the **service layer** (escrow, commission, state
machines), so unit + API-integration tests carry the most weight. E2E is reserved for a
handful of money-critical journeys where cross-layer regressions are catastrophic.

### 1.2 Backend layout (target)

```
backend/
├── conftest.py                      # global fixtures: api_client, users, wallet helpers, freeze_time
├── pytest.ini                       # (exists) add markers + coverage opts
├── tests/
│   ├── conftest.py                  # shared domain fixtures (job, contract, service factories)
│   ├── factories/                   # factory_boy factories, one module per app
│   │   ├── __init__.py
│   │   ├── accounts.py              # UserFactory, StaffFactory, FrozenUserFactory
│   │   ├── catalog.py              # CategoryFactory, SkillFactory
│   │   ├── jobs.py                 # JobFactory, ProposalFactory, ScreeningQuestionFactory
│   │   ├── bids.py                 # BidPlanFactory, BidLedgerFactory
│   │   ├── payments.py             # WalletFactory, fund_wallet(), TransactionFactory
│   │   ├── contracts.py            # ContractFactory (job & service variants), SubmissionFactory
│   │   ├── gigs.py                 # ServiceFactory, ServiceAddonFactory, BuyingRequestFactory
│   │   ├── reviews.py              # ReviewFactory
│   │   ├── tickets.py              # TicketTypeFactory, TicketFactory
│   │   ├── invoices.py            # InvoiceRequestFactory
│   │   ├── affiliate.py           # AffiliateProfileFactory, CommissionRuleFactory, ReferralFactory
│   │   └── chat.py                # ConversationFactory, MessageFactory
│   ├── unit/                        # no DB or DB-light, one file per service module
│   │   ├── test_contracts_commission.py
│   │   ├── test_contracts_state_machine.py
│   │   ├── test_payments_ledger.py
│   │   ├── test_gigs_pricing.py
│   │   ├── test_invoices_period.py
│   │   ├── test_affiliate_rules.py
│   │   ├── test_reviews_rules.py
│   │   ├── test_core_settings.py
│   │   └── test_analytics_kpis.py
│   ├── integration/                 # API + DB, one file per app/feature
│   │   ├── test_auth_api.py
│   │   ├── test_profiles_api.py
│   │   ├── test_catalog_api.py
│   │   ├── test_jobs_api.py
│   │   ├── test_proposals_api.py
│   │   ├── test_bids_api.py
│   │   ├── test_subscriptions_api.py
│   │   ├── test_wallet_api.py
│   │   ├── test_contracts_api.py
│   │   ├── test_gigs_api.py
│   │   ├── test_chat_api.py
│   │   ├── test_notifications_api.py
│   │   ├── test_reviews_api.py
│   │   ├── test_tickets_api.py
│   │   ├── test_invoices_api.py
│   │   ├── test_affiliate_api.py
│   │   ├── test_cms_api.py
│   │   └── test_admin_stats_api.py
│   ├── tasks/                        # Celery beat tasks (eager mode)
│   │   ├── test_jobs_tasks.py
│   │   ├── test_payments_tasks.py
│   │   ├── test_contracts_tasks.py
│   │   ├── test_chat_tasks.py
│   │   └── test_tickets_tasks.py
│   ├── contracts_api/                # API-contract / schema tests (OpenAPI)
│   │   ├── test_openapi_schema.py
│   │   ├── test_pagination.py
│   │   ├── test_filtering_sorting.py
│   │   └── test_error_envelope.py
│   ├── db/                            # model/constraint/migration/transaction tests
│   │   ├── test_constraints.py
│   │   ├── test_relationships.py
│   │   ├── test_migrations.py
│   │   └── test_transactions.py
│   ├── security/                      # authz, privilege-escalation, injection, secrets
│   │   ├── test_authentication.py
│   │   ├── test_authorization_matrix.py
│   │   ├── test_self_dealing.py        # BR-21 across every entity
│   │   ├── test_injection.py
│   │   └── test_sensitive_data.py
│   ├── env/                           # environment & startup validation
│   │   └── test_environment.py
│   └── regression/                    # frozen golden flows protecting money paths
│       ├── test_money_invariants.py
│       └── test_dual_role_e2e.py
```

> **Migration note:** the current flat files in `backend/tests/test_*.py` are kept and
> gradually split into `unit/` + `integration/` as each module's coverage is hardened.
> No big-bang move — `pytest.ini` already discovers `test_*.py` recursively.

### 1.3 Frontend layout (target)

```
frontend/
├── vitest.config.ts                 # jsdom env, @ alias, setup file, coverage (v8)
├── vitest.setup.ts                  # jest-dom matchers, MSW server lifecycle, localStorage shim
├── playwright.config.ts             # E2E config (chromium, RTL locale)
├── __mocks__/                       # static module mocks
├── test/
│   ├── msw/
│   │   ├── server.ts                # MSW node server (component/integration tests)
│   │   ├── browser.ts               # MSW worker (Playwright component mode, optional)
│   │   └── handlers/                # one handler module per API area
│   │       ├── auth.ts  jobs.ts  wallet.ts  contracts.ts  chat.ts
│   │       ├── services.ts  reviews.ts  tickets.ts  invoices.ts  affiliate.ts  cms.ts
│   ├── factories/                   # FE data builders mirroring API shapes
│   │   └── index.ts                 # makeJob(), makeContract(), makeWallet(), makeConversation()…
│   └── utils/render.tsx             # custom render (router + providers)
├── lib/__tests__/
│   ├── api.test.ts                  # fetch wrapper: auth header, 401 refresh, error envelope
│   └── contractStatus.test.ts       # status label/chip maps exhaustive
├── components/__tests__/
│   ├── NotificationsBell.test.tsx
│   ├── ReviewsSection.test.tsx
│   └── ModeToggle.test.tsx
├── app/**/__tests__/                # colocated page/route tests
│   ├── jobs/page.test.tsx  jobs/[slug]/page.test.tsx  jobs/new/page.test.tsx
│   ├── wallet/page.test.tsx
│   ├── contracts/page.test.tsx  contracts/[id]/page.test.tsx
│   ├── services/page.test.tsx  services/[slug]/page.test.tsx  me/services/page.test.tsx
│   ├── messages/page.test.tsx  messages/[id]/page.test.tsx
│   ├── support/page.test.tsx  tickets/[id]/page.test.tsx
│   ├── invoices/page.test.tsx  affiliate/page.test.tsx  faq/page.test.tsx
│   └── dashboard/page.test.tsx  onboarding/mode/page.test.tsx  signin/page.test.tsx
└── e2e/                             # Playwright specs (full journeys)
    ├── auth.spec.ts
    ├── job-to-contract.spec.ts
    ├── service-purchase.spec.ts
    ├── delivery-and-warranty.spec.ts
    ├── dispute.spec.ts
    └── chat.spec.ts
```

---

## 2. Tooling & dependencies to add

### Backend (`requirements/local.txt`)

| Package | Why |
|---|---|
| `pytest-cov` | coverage measurement + `--cov-fail-under` gate |
| `factory_boy` | model factories (replace ad-hoc inline object creation) |
| `freezegun` | deterministic time for warranty/funding-timeout/idle/auto-close tests |
| `pytest-xdist` | parallel test execution (`-n auto`) in CI |
| `pytest-django` *(present)* | DB fixtures, settings |
| `pytest-mock` | ergonomic mocker fixture for patching `paypal`, `firestore`, `push` |
| `responses` *(or `requests-mock`)* | mock outbound PayPal REST calls when stub is off |

### Frontend (`devDependencies`)

| Package | Why |
|---|---|
| `vitest` + `@vitest/coverage-v8` | unit/component test runner (Vite-native, fast) |
| `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` | component testing |
| `jsdom` | DOM environment |
| `msw` | network mocking at the fetch boundary (the `api()` wrapper) |
| `@playwright/test` | E2E browser journeys |

Add scripts to `frontend/package.json`:

```jsonc
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage",
  "e2e": "playwright test"
}
```

---

## 3. Fixtures, factories & mocking strategy (summary)

- **Backend fixtures** live in `tests/conftest.py`: `api_client` (unauth), `as(user)` helper
  to authenticate, `employer`/`worker`/`staff`/`frozen_user`, `category`, `fund_wallet(user, amt)`,
  and an autouse `settings_defaults` fixture that seeds the Global Settings the SRS relies on.
- **Factories** (`tests/factories/`) use `factory_boy` + `factory.django.DjangoModelFactory`.
  Money-touching factories never bypass the ledger — e.g. `fund_wallet()` posts a real
  `DEPOSIT` transaction so the invariant (`balance == Σ ledger`) always holds.
- **Mocking** is centralized (section 12). Default test settings keep `PAYPAL_STUB=1`,
  `FIRESTORE_STUB=1`, `FCM_STUB=1`, `GOOGLE_AUTH_STUB=1`, console email backend, and
  `CELERY_TASK_ALWAYS_EAGER=1`. Dedicated "live-mode" tests flip a stub off and assert the
  adapter is invoked with the right arguments using `responses`/`pytest-mock`.

---

## 4. Backend file-by-file plan (by module)

Each entry lists the **file**, the **functionality it validates**, the **SRS refs**, and the
**scenario classes** to cover: ✅positive · ⛔negative · 🧪validation · 🔐permission · 🛡security ·
⚙concurrency · 🪐edge.

### 4.1 `accounts` — identity & Google SSO

**`integration/test_auth_api.py`** — Google token exchange → JWT; refresh rotation + blacklist; logout; `/auth/me`. *FR-AUTH-1..6, SEC-1/5.*
- ✅ stub login issues access(15m)+refresh; `/auth/me` returns profile; refresh rotates and blacklists the old token.
- ⛔ invalid/expired id-token rejected (401); reused (blacklisted) refresh rejected; logout blacklists refresh.
- 🧪 missing/garbage token body → 400; malformed Authorization header ignored.
- 🔐 unauthenticated access to protected route → 401; frozen account blocked at login (BR-23) and on every request.
- 🛡 throttle on `/auth/*` (10/min, SEC-5); access token cannot be used after logout; no password endpoints exist.
- 🪐 registration feature-flag OFF blocks new signups (FR-AUTH-5); first staff via `createsuperuser`.

**`security/test_authentication.py`** — token lifetimes, signature tampering, algorithm confusion, clock skew.

### 4.2 `profiles` — worker/employer profiles

**`integration/test_profiles_api.py`** — lazy profile creation, skills/education/employment/languages CRUD, completeness %, visibility, ratings read. *FR-PROF-1..7, BR-16.*
- ✅ profile auto-created on first read; nested CRUD; `completeness_pct` recomputes; visibility toggle stamps `visibility_changed_at`.
- ⛔ editing another user's profile → 403; deletion blocked while in-progress contract / non-zero wallet / unsettled withdrawal / pending request (BR-2).
- 🧪 rating bounds, URL fields, max lengths.
- 🪐 account deletion soft-deletes + anonymizes + retains financial records (BR-3).

### 4.3 `catalog` — categories & skills

**`integration/test_catalog_api.py`** — public taxonomy list/search; admin-only mutation. *§22.*
- ✅ public GET (no auth); search/filter; ordering.
- 🔐 create/update requires staff.
- 🪐 PROTECT prevents deleting a category referenced by jobs/services.

### 4.4 `jobs` — jobs core + proposals + invitations + watchlist

**`integration/test_jobs_api.py`** — post → moderation gate → publish → expiry; employer management; BR-4 lock. *FR-JOB-1/2/3/7/17, BR-4.*
- ✅ auto-publish ON → published + subscription fan-out enqueued; flag OFF → pending_review; close; listing filters/search/sort/pagination.
- ⛔ post while frozen; close an awarded job; edit title/description after first proposal (BR-4) → 400.
- 🧪 budget_min ≤ budget_max, required fields, screening-question builder.
- 🔐 only owner manages own job; private job hidden from public list.

**`integration/test_proposals_api.py`** — submit/cancel/accept/reject; bid consumption & refunds; awarding. *FR-JOB-5/6/8/9, FR-BID-1..6, BR-5/6/6a/7/21.*
- ✅ submit consumes 1 bid; invited proposal consumes none; employer rate (private) + sort; accept awards once.
- ⛔ self-propose (BR-21) → 403; duplicate proposal; propose after award; missing required screening answers; reject without reason.
- ⚙ **double-accept race** → exactly one contract (row lock); concurrent submit at bid balance 1 never goes negative.
- 🪐 bid refunded on moderation-reject and job close/expiry, **never** on self-cancel (BR-7); invitations auto-expire on award.

**`unit/test_jobs_state_machine.py`** — pure transition table draft→pending_review→published→in_progress→completed|closed|rejected|archived (§9.1).

### 4.5 `bids` — bid ledger & plans

**`integration/test_bids_api.py`** + **`unit/test_payments_ledger.py`** (bid ledger shares the append-only principle). *FR-BID.*
- ✅ signup grant; balance = Σ delta; plan purchase from wallet credits bids + debits wallet atomically.
- ⛔ purchase without funds; consume below zero.
- ⚙ concurrent consume + purchase consistency.

### 4.6 `payments` — wallet, double-entry ledger, PayPal, withdrawals

**`unit/test_payments_ledger.py`** — the ledger invariant engine. *FR-PAY-1/9, BR-9/24, AC-5.*
- ✅ `post()` recomputes buckets; `balance == Σ succeeded rows` after every op; idempotency key dedupes.
- 🧪 signed amounts; bucket scoping; pending ≠ credited.
- ⚙ `select_for_update` serializes concurrent posts; triple webhook replay → one row.
- 🪐 settle pending → succeeded/failed; reconciliation flips stale pending.

**`integration/test_wallet_api.py`** — charge/confirm, transactions list, withdrawals, bid-plan purchase. *FR-PAY-2/3, FR-BID-3.*
- ✅ charge returns approval URL + pending tx; confirm credits; list paginates/filters; withdraw holds instantly; admin pay/reject.
- ⛔ deposit < min; withdraw > available; withdraw < min; confirm someone else's order → 404.
- 🛡 amount parsing (negative, non-numeric, huge, >2dp); idempotent confirm; reject reverses hold exactly once.
- 🌐 **live-mode** (`test_wallet_paypal_live.py`): `PAYPAL_STUB=0` + `responses` mocks PayPal v2 create/capture; asserts request shape, currency, error mapping, signature handling.

### 4.7 `contracts` — escrow, delivery, disputes (highest criticality)

**`unit/test_contracts_commission.py`** — `compute_commission` & BR-24 rounding. *FR-PAY-6, BR-24.*
- ✅ `commission + worker_earning == budget` exactly across parametrized budgets/rates (incl. `0.01`, `99.99`, `1234.56`, odd %).
- 🪐 commission row absorbs sub-cent remainder; half-even rounding.

**`unit/test_contracts_state_machine.py`** — pending_funding→active→delivered→completed|disputed|cancelled (§9.4); guards for job vs service origin.

**`integration/test_contracts_api.py`** — full lifecycle over the API. *FR-TASK-1..9, FR-PAY-5, BR-6/6a/9/10/22.*
- ✅ accept→contract; fund (available→escrow); submit→delivered; accept→completed (escrow split + commission to platform + warranty start); reject→active→resubmit; update-requests both directions; mutual cancel→full refund; dispute open→resolve (resume/complete/cancel/split).
- ⛔ fund without balance (stays pending_funding); deliver on non-active; accept own submission (worker) → 403; reject without reason; close ticket-coupled dispute before resolution.
- 🔐 only employer funds/accepts/rejects; only worker delivers; non-party 404 on detail; update-request needs counterpart to approve.
- ⚙ funding-timeout sweeper reverts job→published + proposal→viewed (BR-6a); warranty release idempotent (no double pay).
- 🪐 budget increase parks change in pending-funding when short; decrease refunds; split invariant `refund + worker_net + commission == budget`.

**`tasks/test_contracts_tasks.py`** — `cancel_unfunded_contracts`, `release_due_warranties`, `notify_overdue_contracts` (freeze time). *BR-6a/10, FR-TASK-9.*

**`regression/test_money_invariants.py`** — property-style: after a randomized sequence of fund/deliver/accept/cancel/dispute/warranty ops, every wallet still satisfies `balance == Σ ledger` and `Σ all wallets == Σ external deposits − withdrawals` (no money created/destroyed).

### 4.8 `gigs` — Special Services

**`unit/test_gigs_pricing.py`** — total = (base + Σ add-ons) × qty; delivery-days extension.
**`integration/test_gigs_api.py`** — publish/moderation, pause/resume/archive, favourites, buying request, accept→funded contract, reject/cancel. *FR-SVC, §9.3, AC-4.*
- ✅ browse/filter/sort/favourite; buy with add-ons; accept reuses contract layer end-to-end.
- ⛔ self-buy (BR-21); buy paused/archived; accept by non-owner; cancel after acceptance.
- 🪐 pause hides from discovery without touching running contracts; unicode slug routing.

### 4.9 `chat` — conversations + Firestore mirror

**`integration/test_chat_api.py`** + **`tasks/test_chat_tasks.py`**. *FR-CHAT, BR-10/11, AC-6.*
- ✅ employer starts from proposal; contract parties chat; send/read; unread counts; conversation auto-opens on funding.
- ⛔ worker cold-message blocked (BR-11); self-chat (BR-21); send to read-only; non-member send → 403; kill-switch disables sending.
- 🧪 banned-words masking; empty message.
- ⚙/🪐 warranty-end flips read-only in PG **and** Firestore mirror (assert `firestore.mirror_status` called); idle-locker skips contract conversations; **10-min unread-email fires exactly once**, none if read in time (freeze time).

### 4.10 `notifications`

**`integration/test_notifications_api.py`** — list/unread-count/mark-read/mark-all. *FR-NOT.*
- ✅ contract events fan out to both parties; chat message notifies recipient (email deferred to checker).
- 🔐 a user sees only their notifications; mark-read scoped to owner.
- 🌐 email honors `emails.enabled`; push uses FCM stub (assert called).

### 4.11 `reviews`

**`unit/test_reviews_rules.py`** + **`integration/test_reviews_api.py`**. *FR-REV, BR-13, AC-7.*
- ✅ leave after completion; one per party; subject = counterpart; edit within warranty; aggregates per direction on profiles; public `/users/{id}/reviews` summary.
- ⛔ review before completion; duplicate; self-review (BR-21); edit after warranty lock.
- 🪐 review created after warranty end is born locked; warranty-end locks existing reviews.

### 4.12 `tickets` — support + dispute coupling

**`integration/test_tickets_api.py`** + **`tasks/test_tickets_tasks.py`**. *FR-TKT, BR-22, AC-9.*
- ✅ create; reply (user/staff) status transitions; solve; close; ticket types public list.
- ⛔ reply to closed (read-only); close dispute-coupled ticket while contract Disputed (BR-22) → 400.
- ⚙ auto-solve after idle days; auto-close after solved days (freeze time); skip auto-actions while contract disputed.
- 🪐 dispute-type ticket against a contract flags it Disputed.

### 4.13 `invoices`

**`unit/test_invoices_period.py`** (week/month bounds) + **`integration/test_invoices_api.py`**. *FR-PAY-7.*
- ✅ gather completed contracts in period; totals; confirm generates PDF; reject.
- ⛔ empty period; confirm by non-employer; act on non-pending.
- 🪐 week vs month boundary correctness; PDF best-effort fallback when reportlab missing.

### 4.14 `affiliate`

**`unit/test_affiliate_rules.py`** (range selection, rounding) + **`integration/test_affiliate_api.py`**. *FR-AFF, BR-18.*
- ✅ attribution within cookie window; range-rule selection; accrual **at warranty release** crediting referrer wallet; clawback reverses; summary endpoint.
- ⛔ self-referral void (BR-21); accrual when frozen → none; accrual outside earning window → none.
- ⚙ accrual idempotent per (contract, party); double release pays once.

### 4.15 `cms` + `core` analytics

**`integration/test_cms_api.py`** — pages/FAQ public, unpublished hidden, admin CRUD.
**`integration/test_admin_stats_api.py`** + **`unit/test_analytics_kpis.py`** — KPI math (GMV, commission, liabilities by bucket, segments); **staff-only** access (403 for normal users); Unfold `dashboard_callback` returns cards. *ADM-2/6.*

---

## 5. Cross-cutting test suites

### 5.1 API contract tests (`tests/contracts_api/`)
- **`test_openapi_schema.py`** — `/api/schema/` generates without warnings; every registered route appears; response components resolve (drf-spectacular). Snapshot the schema and fail on undocumented drift.
- **`test_pagination.py`** — every `ListAPIView` returns `{count, next, previous, results}`; `PAGE_SIZE=20`; `?page=` bounds; out-of-range page → 404.
- **`test_filtering_sorting.py`** — declared `filterset_fields`/`search_fields`/`ordering_fields` actually filter/sort; unknown ordering ignored safely; injection in filter params is parameterized (no 500).
- **`test_error_envelope.py`** — business errors return the Arabic `{code, message_ar}` envelope with correct status; 401 vs 403 vs 404 vs 400 are used consistently; `Idempotency-Key` honored on payment/contract endpoints (§11).

### 5.2 Database tests (`tests/db/`)
- **`test_constraints.py`** — every `UniqueConstraint`/`CheckConstraint` enforced at the DB level: single platform wallet, unique proposal per (job,worker), unique review per (contract,author), `no_self_dealing`/`no_self_referral`/`conversation_no_self`, `qty_positive`, unique idempotency key.
- **`test_relationships.py`** — FK `on_delete` semantics (PROTECT blocks deleting funded contracts/categories; CASCADE cleans children); `related_name` reverse access; OneToOne (contract↔proposal, contract↔buying_request).
- **`test_migrations.py`** — `makemigrations --check --dry-run` clean (no model drift); migrations apply forward on an empty DB; no data-loss operations without a paired data migration.
- **`test_transactions.py`** — service methods are atomic: a failure mid-posting rolls back **all** ledger rows; `select_for_update` paths don't leave partial state; nested-atomic savepoints behave (e.g. parked update request).

### 5.3 Service-layer / business-logic (`tests/unit/`)
All `apps/*/services.py` functions get direct unit coverage of **rules, calculations, workflows,
state transitions** — independent of HTTP. This is the primary safety net (target 95%+ on
`services.py` modules). State machines are tested as transition tables incl. illegal transitions.

### 5.4 Background jobs, email, third-party (`tests/tasks/` + live-mode)
- Celery in **eager** mode for behavior; one suite asserts **beat schedule registration**
  (every periodic task in `CELERY_BEAT_SCHEDULE` resolves to an importable task).
- Email: console backend; assert `mail.outbox` contents, recipients, once-only semantics.
- PayPal/Firestore/FCM: stub-on by default; **live-mode** suites flip the stub and assert the
  adapter call shape with `responses`/mocker; webhook replay & lost-webhook reconciliation paths.

---

## 6. Frontend test plan

### 6.1 Library / utilities
- **`lib/__tests__/api.test.ts`** — `api()` attaches Bearer header; on 401 calls refresh then retries once; on refresh failure clears tokens and redirects `/signin`; throws `{status, body}` envelope on non-OK; 204 → undefined. Mocked with MSW.
- **`lib/__tests__/contractStatus.test.ts`** — every backend status has a label + chip (exhaustive keys).

### 6.2 Components (Vitest + Testing Library)
- **`NotificationsBell`** — fetches unread count, renders badge (9+ cap), opens dropdown, mark-all-read clears, outside-click closes, polling interval set/cleared.
- **`ReviewsSection`** — renders existing reviews; star pick; create vs edit (pre-fills mine); locked state hides form; error-envelope surfaces Arabic message.
- **`ModeToggle`** — switches view, persists via API, never gates actions (FR-MODE-4 is server-side; UI is a hint only).

### 6.3 Pages / routes (component-integration with MSW)
One test file per route under `app/**/__tests__/`. Each asserts: loading state, auth redirect when no token, data render, primary actions call the right endpoint with the right body, error-envelope handling, and RTL/Arabic copy presence. Highlights:
- **`jobs/[slug]`** — proposal form shows live bid balance, screening questions, every BR rejection maps to its Arabic message.
- **`wallet`** — charge redirects to approval URL; PayPal return (`?token=`) self-confirms; withdraw validation; ledger table.
- **`contracts/[id]`** — role-aware actions (fund/deliver/accept/reject/update/cancel/dispute) appear only when valid; open-chat; reviews after completion.
- **`services/[slug]`** — add-on/qty live total; favourite toggle; buy.
- **`me/services`** — create, publish, pause/resume, accept/reject incoming requests.
- **`messages/[id]`** — composer disabled when read-only/kill-switch; optimistic send; polling.
- **`support` / `tickets/[id]`** — create, reply, closed read-only.
- **`invoices`** — request (employer dropdown from contracts), confirm/PDF link.
- **`affiliate`** — referral link copy, earnings cards.

### 6.4 State / forms / routing
- State is local (React `useState`) — covered within component tests (no global store). Token
  store (`lib/api.tokens`) gets dedicated tests (set/clear/get under SSR `window===undefined`).
- Form validation tests: required fields, numeric/decimal inputs, min/max, Arabic error rendering.
- Routing: protected pages redirect unauthenticated users; dynamic params resolve; `useSearchParams`
  Suspense boundary (wallet) renders.

### 6.5 Mocking (frontend)
MSW handlers per API area in `test/msw/handlers/` provide deterministic responses incl. error
envelopes and pagination shapes. No real network in unit/component tests. Playwright E2E runs
against the **real** stubbed backend (PayPal/Firestore/FCM stubs on).

---

## 7. End-to-end scenarios (Playwright, `frontend/e2e/`)

Run against `docker compose up` with all third-party stubs ON and a seeded DB.

| Spec | Journey (UI → API → DB) | SRS |
|---|---|---|
| `auth.spec.ts` | stub login → mode select → dashboard; logout | AC-1, FR-AUTH |
| `job-to-contract.spec.ts` | post job → worker proposes (bid −1) → employer accepts → wallet funds → contract Active → siblings rejected | AC-3 |
| `service-purchase.spec.ts` | publish service → browse/favourite → buy with add-ons → worker accepts → contract Active | AC-4 |
| `delivery-and-warranty.spec.ts` | submit deliverable → accept → escrow splits → warranty force-elapse → funds released → review locked | AC-5 |
| `dispute.spec.ts` | open dispute from submission → admin split resolution → ledger legs correct → ticket closes | AC-5, BR-22 |
| `chat.spec.ts` | contract parties chat ≤2s → unread badge → warranty-end read-only | AC-6 |

---

## 8. Performance, load & benchmark targets

| Area | Test type | Target / SRS |
|---|---|---|
| Ledger `post()` under contention | concurrency benchmark (threads hammer one wallet) | no lost updates; invariant holds; p95 latency budget |
| Public job/service listings | load test (k6/Locust) | p95 < 300ms at N rps with filters + pagination |
| Warranty-release & funding-timeout sweepers | batch benchmark | process 10k due contracts within the beat interval |
| Unread-chat-email minute sweep | batch benchmark | scales to backlog without duplicate sends |
| OpenAPI schema generation | guard | builds < CI budget |
| DB query counts (N+1 guard) | `assertNumQueries` on hot list endpoints | bounded queries via `select_related`/`prefetch_related` |

Tooling: `k6` or `Locust` for HTTP load (separate `perf/` dir, not in the unit gate);
`pytest` + `django.test.utils.CaptureQueriesContext` for N+1 guards in CI.

---

## 9. Security test suite (`tests/security/`)

- **Authentication** — token tampering/expiry/blacklist; throttling; frozen-account lockout.
- **Authorization matrix** — a table-driven test: for every protected endpoint × {anon, other-user, owner, staff} assert the expected status. Catches privilege escalation (e.g. funding/accepting someone else's contract, reading others' wallet/notifications/chat, confirming another employer's invoice).
- **Self-dealing (BR-21)** — one suite proving the rule across **every** entity: proposal, invitation, service buy, contract, conversation, review, affiliate referral — blocked at API (Arabic error) **and** DB constraint.
- **Injection** — SQLi via filter/search/ordering params (parameterized, no 500/leak); template/HTML in user content stored safely; path traversal in slug routes.
- **Sensitive data** — secrets never in API responses or logs; `.env`/keys not committed; DRF `DEBUG=False` in prod settings; error responses don't leak stack traces; PII handling on account deletion (BR-3).
- **Money tamper** — cannot set wallet balances directly (admin read-only); cannot replay a captured deposit to double-credit; idempotency enforced.

> The mandatory third-party **penetration test** of wallet/escrow (SEC-11/AC-13) remains an
> external engagement and is tracked separately from this automated suite.

---

## 10. Regression suites (`tests/regression/`)

Protect the flows where a silent break loses money or trust:
- `test_money_invariants.py` — randomized op-sequence property test (section 4.7).
- `test_dual_role_e2e.py` — AC-1b: one account runs an employer-side **and** a worker-side
  contract simultaneously; buckets stay correct; self-dealing attempts rejected throughout.
- Tag with `@pytest.mark.regression`; run on every PR and nightly.

---

## 11. SRS → test coverage mapping

Traceability matrix — every business rule / acceptance criterion maps to owning test file(s).
"Existing" = already covered by the current 132 tests; "Add" = new file in this plan.

| SRS ref | Requirement | Test file(s) | Status |
|---|---|---|---|
| FR-AUTH-1..6, SEC-1/5 | Google SSO → JWT, refresh rotation, throttle | `integration/test_auth_api.py`, `security/test_authentication.py` | Existing + Add |
| FR-AUTH-5 / FR-ADM-5 / BR-23 | registration flag, frozen-account side-effects | `test_auth_api.py`, `security/test_authorization_matrix.py` | Existing + Add |
| FR-MODE-1..6 | mode is a view hint, authz relationship-based | `test_auth_api.py`, `security/test_authorization_matrix.py` | Existing + Add |
| FR-PROF-1..7, BR-2/3/16 | profiles, completeness, deletion guard | `integration/test_profiles_api.py` | Existing + Add |
| FR-JOB-1..17, BR-4 | jobs lifecycle, lock, expiry | `integration/test_jobs_api.py`, `unit/test_jobs_state_machine.py` | Existing + Add |
| FR-JOB-5/6/8/9, FR-BID-1..6, BR-5/6/6a/7/21 | proposals, bids, award, refunds | `integration/test_proposals_api.py`, `tests/security/test_self_dealing.py` | Existing + Add |
| FR-SUB-1..3 | category subscription email fan-out | `integration/test_subscriptions_api.py`, `tasks/test_jobs_tasks.py` | Existing + Add |
| FR-PAY-1/9, BR-9/24, AC-5 | wallet buckets, ledger invariant, rounding | `unit/test_payments_ledger.py`, `unit/test_contracts_commission.py`, `regression/test_money_invariants.py` | Existing + Add |
| FR-PAY-2/3 | PayPal deposits, withdrawals, reconciliation | `integration/test_wallet_api.py`, `tasks/test_payments_tasks.py`, live-mode suite | Existing + Add |
| FR-TASK-1..9, FR-PAY-5/6, BR-6a/9/10/22 | contracts, escrow, delivery, disputes, warranty | `integration/test_contracts_api.py`, `unit/test_contracts_*`, `tasks/test_contracts_tasks.py` | Existing + Add |
| FR-SVC-1..7, §9.3, AC-4 | special services + buying requests + favourites | `integration/test_gigs_api.py`, `unit/test_gigs_pricing.py` | Existing + Add |
| FR-CHAT-1..7, BR-10/11, AC-6 | chat, Firestore mirror, read-only, unread email | `integration/test_chat_api.py`, `tasks/test_chat_tasks.py` | Existing + Add |
| FR-NOT-1/2 | in-app/email/push fan-out | `integration/test_notifications_api.py` | Existing + Add |
| FR-REV-1..4, BR-13, AC-7 | reviews, edit-in-warranty/lock, aggregates | `unit/test_reviews_rules.py`, `integration/test_reviews_api.py` | Existing + Add |
| FR-TKT-1.., BR-22, AC-9 | tickets, status machine, dispute coupling | `integration/test_tickets_api.py`, `tasks/test_tickets_tasks.py` | Existing + Add |
| FR-PAY-7 | period invoices + PDF | `unit/test_invoices_period.py`, `integration/test_invoices_api.py` | Existing + Add |
| FR-AFF-1..4, BR-18 | affiliate attribution, accrual, clawback | `unit/test_affiliate_rules.py`, `integration/test_affiliate_api.py` | Existing + Add |
| ADM-2/6 | admin KPIs + CMS/FAQ | `integration/test_admin_stats_api.py`, `integration/test_cms_api.py`, `unit/test_analytics_kpis.py` | Existing + Add |
| BR-21 (global) | no self-dealing anywhere | `security/test_self_dealing.py` | Add |
| §11/§16 | API contract, idempotency, pagination | `contracts_api/*` | Add |
| §10 ERD | constraints, relationships, migrations | `db/*` | Add |
| SEC-3/7/10/11 | injection, secrets, audit, pen-test | `security/*` (pen-test external) | Add |
| §20/§22.1 | env config, settings seed, startup | `env/test_environment.py` | Add |
| AC-1b | dual-role integrity | `regression/test_dual_role_e2e.py` | Add |

A living version of this table should be generated in CI from `@pytest.mark.srs("FR-...")`
markers so coverage gaps surface automatically (see roadmap §13.5).

---

## 12. Environment & setup verification

### 12.1 Findings (verified against the repo)

✅ **Working today**
- `cp .env.example .env` then `make up` boots the full stack (db, redis, backend:8000, worker, beat, frontend:3000). Defaults are dev-safe (all stubs ON).
- `backend/entrypoint.sh` runs `migrate --noinput` → `seed_settings` → `collectstatic` automatically — **no manual steps** to a running app.
- `seed_settings` management command seeds the §22.1 Global Settings catalog.
- Test settings (`config.settings.test`) use in-memory SQLite, locmem cache, eager Celery, all stubs on → suite is hermetic and needs no services.
- CI runs ruff → `makemigrations --check` → pytest (backend) and tsc → build (frontend).
- `config.settings.production` requires `DJANGO_SECRET_KEY` (no default) and `DJANGO_ALLOWED_HOSTS` — i.e. prod **fails fast** if unset.

⚠️ **Gaps to close (tracked as tasks)**
1. **`.env.example` is incomplete.** It documents the SSO/PayPal/prod basics but omits several env vars the settings actually read. Add (with safe dev defaults noted):
   `DJANGO_DEBUG`, `DJANGO_LOG_LEVEL`, `CELERY_RESULT_BACKEND`, `CSRF_TRUSTED_ORIGINS`,
   `EMAIL_BACKEND`, `DEFAULT_FROM_EMAIL`, `FIRESTORE_STUB`, `FCM_STUB`, and the frontend
   `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
2. **No env-validation test** — add `tests/env/test_environment.py` (code in §14) that fails
   clearly when required prod vars are missing/invalid and asserts every `env(...)` key in
   `base.py` is represented in `.env.example` (prevents future drift).
3. **No coverage gate** — add `pytest-cov` with `--cov-fail-under` (targets in §13.3).
4. **Frontend has no test runner** — add Vitest + Testing Library + MSW + Playwright (§2).
5. **No seed data for demo/E2E** beyond settings — add a `seed_demo` command (categories,
   bid plans, ticket types, a sample affiliate commission rule, CMS pages) so a clean
   environment is immediately demoable and E2E has fixtures.

### 12.2 Required environment variable matrix

| Variable | Used by | Required? | Dev default | In `.env.example`? |
|---|---|---|---|---|
| `DJANGO_SECRET_KEY` | prod settings | **prod-required** | dev key in base | partial (empty) |
| `DJANGO_DEBUG` | base | no | off | ❌ add |
| `DJANGO_ALLOWED_HOSTS` | prod | **prod-required** | — | ✅ |
| `DJANGO_LOG_LEVEL` | base | no | INFO | ❌ add |
| `DATABASE_URL` | base | prod-required | sqlite/compose pg | ✅ |
| `CACHE_URL` | base | no | locmem | ✅ |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | base | prod-required | redis (compose) | partial |
| `CORS_ALLOWED_ORIGINS` / `CSRF_TRUSTED_ORIGINS` | base | prod-required | localhost:3000 | partial |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_AUTH_STUB` | auth | no (stub) | stub on | ✅ |
| `PAYPAL_STUB` / `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` / `PAYPAL_BASE_URL` | payments | no (stub) | stub on | ✅ |
| `FIRESTORE_STUB` / `FCM_STUB` | chat/notifications | no (stub) | stub on | ❌ add |
| `EMAIL_BACKEND` / `DEFAULT_FROM_EMAIL` | notifications | no | console | ❌ add |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | frontend | no | localhost | compose only |

### 12.3 Clean-provision acceptance check
A `make verify` target (and CI job) should, from a clean checkout:
`cp .env.example .env` → `docker compose up -d --build` → wait for healthchecks →
`curl -f localhost:8000/api/v1/settings/public` (200) → `curl -f localhost:3000` (200) →
`docker compose exec backend python manage.py migrate --check` → `make test`.
Any failure = broken provisioning.

---

## 13. Implementation roadmap

### 13.1 Order of implementation (sequenced)
1. **Foundations** — `conftest.py`, `tests/factories/*`, add tooling (pytest-cov, factory_boy, freezegun); frontend Vitest+MSW bootstrap. *Unblocks everything; no behavior risk.*
2. **Money core (highest criticality)** — `unit/test_payments_ledger.py`, `unit/test_contracts_commission.py`, `regression/test_money_invariants.py`, harden `integration/test_contracts_api.py` + `tasks/test_contracts_tasks.py`.
3. **Security baseline** — `security/test_authorization_matrix.py`, `security/test_self_dealing.py`, `security/test_authentication.py`.
4. **Core flows** — proposals, gigs, wallet, chat, reviews, tickets integration coverage to target.
5. **Cross-cutting** — API-contract (`contracts_api/*`), DB (`db/*`), env (`env/*`).
6. **Frontend** — `lib` + components + page-integration (MSW), then **E2E** (Playwright) for the 6 critical journeys.
7. **Performance** — N+1 guards in CI; k6/Locust load suites out-of-gate; sweeper batch benchmarks.

### 13.2 Priorities by business criticality
| Tier | Modules | Why |
|---|---|---|
| **P0 — money & integrity** | payments, contracts, gigs(buy), affiliate, regression invariants, self-dealing | financial loss / trust |
| **P1 — core marketplace** | auth/authz, jobs, proposals, bids, chat, reviews, tickets/disputes | primary user value |
| **P2 — supporting** | profiles, catalog, subscriptions, notifications, invoices, cms, analytics | important, lower blast radius |
| **P3 — polish** | FE component edge cases, perf benchmarks, schema snapshots | quality & speed |

### 13.3 Coverage targets per layer
| Area | Target line coverage |
|---|---|
| `apps/*/services.py` (business logic) | **≥ 95%** |
| `apps/*/api/` (views/serializers) | ≥ 90% |
| `apps/*/tasks.py` (Celery) | ≥ 90% |
| `apps/*/models.py` (constraints/props) | ≥ 85% |
| Backend overall | **≥ 90%** (`--cov-fail-under=90`) |
| Frontend `lib/` + `components/` | ≥ 85% |
| Frontend pages | ≥ 70% (statements) |
| E2E | the 6 journeys green (not a % target) |

### 13.4 CI/CD integration
Extend `.github/workflows/ci.yml`:
- **backend job** — add a Postgres service container, run `pytest -n auto --cov=apps --cov-report=xml --cov-fail-under=90`; upload coverage; keep ruff + `makemigrations --check`. Run against **Postgres** (not just sqlite) so DB-level constraints/locks are exercised.
- **frontend job** — add `npm run test:cov` (Vitest) gating; keep tsc + build.
- **e2e job** (PR + nightly) — `docker compose up -d` (stubs on) → `playwright test`; upload traces/videos on failure.
- **nightly** — full suite incl. `@regression` + load smoke; coverage trend report.
- **gates** — PR blocked if: any test fails, coverage below target, migration drift, ruff/tsc errors. Tag-and-skip slow load tests from the PR gate (`-m "not load"`).

### 13.5 Automated execution strategy
- Markers in `pytest.ini`: `unit, integration, tasks, db, security, contracts_api, regression, load, srs`.
- Fast inner loop: `pytest -m "unit or integration" -n auto` (no load/e2e).
- `@pytest.mark.srs("FR-PAY-5")` markers feed a CI step that emits the §11 matrix and **fails if any P0/P1 SRS ref has zero referencing tests** — guaranteeing no requirement silently loses coverage.
- Pre-commit hook: ruff + the changed-files’ unit tests for a sub-second loop.

---

## 14. Appendix — ready-to-paste scaffolding

### 14.1 `backend/tests/conftest.py` (shared fixtures)
```python
import pytest
from decimal import Decimal
from rest_framework.test import APIClient

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def as_user(api_client):
    def _login(user):
        api_client.force_authenticate(user)
        return api_client
    return _login

@pytest.fixture(autouse=True)
def settings_defaults(db):
    from apps.core.services import set_setting
    set_setting("jobs.auto_publish", True)
    set_setting("payments.commission_pct", 10)
    set_setting("contracts.warranty_days", 60)
    set_setting("contracts.funding_timeout_hours", 48)

@pytest.fixture
def fund_wallet(db):
    from apps.payments import services as pay
    from apps.payments.models import Transaction
    def _fund(user, amount):
        pay.post(pay.get_wallet(user), type=Transaction.Type.DEPOSIT,
                 bucket=Transaction.Bucket.AVAILABLE, amount=Decimal(str(amount)), note="seed")
    return _fund
```

### 14.2 `backend/tests/factories/jobs.py` (example factory)
```python
import factory
from apps.jobs.models import Job
from .accounts import UserFactory
from .catalog import CategoryFactory

class JobFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Job
    employer = factory.SubFactory(UserFactory)
    title = factory.Sequence(lambda n: f"وظيفة {n}")
    description = "وصف"
    category = factory.SubFactory(CategoryFactory)
    budget_min = 10
    budget_max = 500
    status = Job.Status.PUBLISHED
```

### 14.3 `backend/tests/env/test_environment.py` (fails clearly on missing/invalid env)
```python
"""Env & startup validation (SRS §20/§22.1).
Guarantees: (1) prod settings fail fast without required secrets,
(2) .env.example documents every variable the settings actually read."""
import re
from pathlib import Path
import pytest

BASE = Path(__file__).resolve().parents[2]

def _env_keys_used():
    text = (BASE / "config/settings/base.py").read_text()
    return set(re.findall(r'env(?:\.\w+)?\("([A-Z_]+)"', text))

def test_env_example_documents_every_used_var():
    documented = set(re.findall(r'^([A-Z_]+)=', (BASE.parent / ".env.example").read_text(), re.M))
    missing = _env_keys_used() - documented
    assert not missing, f".env.example is missing: {sorted(missing)}"

def test_production_requires_secret_key(monkeypatch):
    monkeypatch.delenv("DJANGO_SECRET_KEY", raising=False)
    import importlib
    with pytest.raises(Exception):
        importlib.import_module("config.settings.production")
```

### 14.4 `frontend/vitest.config.ts`
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
```

### 14.5 `frontend/test/msw/handlers/wallet.ts` (example)
```ts
import { http, HttpResponse } from "msw";
const API = "http://localhost:8000/api/v1";
export const walletHandlers = [
  http.get(`${API}/me/wallet`, () =>
    HttpResponse.json({ currency: "USD", available: "50.00", escrow_held: "100.00", earnings_pending: "0.00" })),
  http.post(`${API}/wallet/charge`, () =>
    HttpResponse.json({ order_id: "STUB-1", approval_url: "/wallet?token=STUB-1" }, { status: 201 })),
];
```

### 14.6 `frontend/playwright.config.ts`
```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000", locale: "ar", trace: "on-first-retry" },
  webServer: { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true },
});
```

---

## 15. Definition of done (per module)
A module is "test-complete" when: services ≥95% covered with positive+negative+edge; every API
endpoint has authz-matrix coverage; every DB constraint has a failing-path test; every Celery task
has a freeze-time behavior test; every SRS ref for the module is referenced by ≥1 `@pytest.mark.srs`
test; and (frontend) every page has loading/auth-redirect/primary-action/error tests. CI coverage
gate green at the targets in §13.3.



