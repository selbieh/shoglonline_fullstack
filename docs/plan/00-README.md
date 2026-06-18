# ShoghlOnline — Finalization Plan (Run Order)

A **step-by-step execution plan** to take the project from its current state to a tested,
SRS-complete, launch-ready build. Each numbered part is a self-contained playbook: do the
steps in order, write the listed tests, meet the **Exit criteria**, then move to the next part.

> This plan **operationalizes** the two reference docs already in `docs/`:
> - [`SRS_GAP_ANALYSIS_AND_PLAN.md`](../SRS_GAP_ANALYSIS_AND_PLAN.md) — *what* is missing, module by module (the source of truth for scope).
> - [`TESTING_STRATEGY.md`](../TESTING_STRATEGY.md) — *how* we test (folder layout, factories, coverage targets, the SRS→test matrix).
>
> When a part says "see GAP §X" or "see TEST §Y" it points into those docs. This folder is the **order of operations**.

---

## Where the project stands (verified)

| Layer | State |
|---|---|
| **Backend** (Django 5 / DRF / Celery / Unfold) | ~90% of the SRS *mandatory* logic done. 17 apps, **142 pytest tests** green. Full escrow ledger (3 buckets, double-entry), Google SSO→JWT, contracts/disputes/warranty state machines, feature flags (`core.GlobalSetting`), drf-spectacular, 9 Celery beat jobs. PayPal/Firestore/FCM/SSO run as **stubs**. |
| **Frontend** (Next.js 14 / Tailwind, Arabic RTL) | ~4,400 LOC of real, API-wired UI. **Zero tests.** Missing: profile + completion wizard, bid-plan purchase page, category-subscription UI, notification center/prefs, real dashboard KPIs. Chat is **polling** (no Firebase). No i18n layer; tokens in `localStorage`. |
| **CI** (GitHub Actions) | backend: ruff → `makemigrations --check` → pytest. frontend: tsc → build. **No coverage gate, no FE tests, no E2E.** |

The gap is **breadth + tests + real integrations + hardening**, not the transactional core.

---

## The parts (dependency-ordered)

| Part | Title | Theme | Effort |
|---|---|---|---|
| [01](01-test-foundations.md) | Test foundations & CI gates | tooling first — unblocks shipping every later part *with* tests | M |
| [02](02-backend-coverage-hardening.md) | Backend coverage → ≥90% | cover all existing logic (money, self-dealing, state machines, tasks, DB, API contract) | L |
| [03](03-attachments-and-storage.md) | Attachments & file storage | platform used by jobs/proposals/services/submissions/chat/tickets/ID | L |
| [04](04-account-lifecycle-and-moderation.md) | Account lifecycle & moderation | freeze ripple (BR-23), deletion (BR-2), maintenance mode, ID verify, staff 2FA + roles | L |
| [05](05-engagement-completeness.md) | Engagement completeness | admin broadcast + scheduled notifs, prefs, offline reminder, ticket On-Hold, chat reports | M |
| [06](06-marketplace-and-money-extras.md) | Marketplace & money extras | repost/rehire, payment methods, commission ranges, affiliate clicks/cookie/slug, public profile | M |
| [06B](06b-admin-panel-integration.md) | Admin panel integration | Unfold console: dashboard KPIs, moderation queues, bulk actions + audit, CSV/XLSX, read-only ledger, flags (ADM-1…9) | M/L |
| [07](07-frontend-feature-gaps.md) | Frontend feature gaps | profile+wizard, bid purchase, subscriptions UI, notif center, dashboard KPIs, settings/deletion | L |
| [08](08-i18n-and-seo.md) | i18n & SEO | next-intl + gettext externalization; SSR metadata/JSON-LD/sitemaps; a11y + responsive audit | L |
| [09](09-realtime-chat-and-push.md) | Real-time chat & push | Firebase custom tokens, Firestore + rules + listeners (replace polling), FCM device tokens | L |
| [10](10-observability-and-security.md) | Observability & security hardening | Sentry, metrics, ledger-invariant alerts, CSP, rate-limit matrix, dep/secret scans, pen-test | M |
| [11](11-e2e-and-ci.md) | E2E suite & full CI | Playwright golden journeys, Postgres-in-CI, coverage gates, nightly, N+1 + perf smoke | M |
| [12](12-ops-deploy-and-acceptance.md) | Ops, deploy & acceptance run | backups/PITR, zero-downtime + rollback, maintenance drill, **AC-1…AC-15 staging run**, go-live | M |

**Recommended track order:** 01 → 02 (get the safety net solid), then feature parts 03 → 06 (each ships tested), **06B (admin console — runs alongside 07)**, 07 (frontend catches up), 08 (i18n/SEO gate), 09 (real-time), 10–11 (hardening + E2E), 12 (acceptance + launch). Parts 03–06 are backend-led and can overlap 06B/07 once their APIs land.

### How this plan handles each concern (assertion map)
| Concern | Where it's handled |
|---|---|
| **Backend** | 01 (harness) · 02 (coverage →90%) · 03–06 (features) · 09 (real integrations) · 10 (hardening) |
| **Frontend** | 01 (Vitest/MSW) · 07 (missing UIs) · 08 (i18n/SEO/a11y) · 11 (Playwright E2E) |
| **Admin panel integration** | **06B** (full ADM-1…9 console + tests) · 04 (freeze/ID/2FA/roles) · 05 (broadcast/tickets) · 12 (AC-11 acceptance) |
| **Edge cases** | 02 (🪐 cases, **illegal** state transitions, double-accept/double-spend races, randomized money-invariant property tests) + 🪐 cases in every feature part |
| **Bugs / issues** | hardening in 02 **surfaces latent bugs → fix + add a regression test** (`tests/regression/`); 10 (Sentry catches runtime bugs, ledger-invariant alerts); CI gates block re-introduction |
| **Test cases** | 01 (tooling) · 02 (backend ≥90%) · 07/11 (frontend + E2E) · every part lists its own tests · SRS→test matrix in [TESTING_STRATEGY.md §11](../TESTING_STRATEGY.md) |
| **Chat with Firestore, secured** | 09 (Firebase custom tokens, Firestore mirror + **security rules**: cross-user read denied, sender-only writes, read-only blocks sends, no client conversation-create) · 10 (encrypted FCM tokens, CSP) · BR-10 read-only lifecycle |
| **Payments / escrow** | 02 (ledger invariants, rounding, races) · 06 (commission ranges, payment methods) · 10 (ledger-invariant alerting) · 12 (AC-5) |
| **i18n / SEO / a11y / responsive** | 08 · acceptance AC-2/AC-12/AC-14 in 12 |
| **Ops / deploy / acceptance** | 12 (backups/PITR, zero-downtime + rollback, maintenance drill, **AC-1…AC-15 run**, go-live) |

---

## How to run any part (the loop)

```bash
# backend (inside the running stack)
docker compose exec backend pytest -q                 # full suite
docker compose exec backend pytest -q tests/unit       # a slice
docker compose exec backend ruff check . && docker compose exec backend python manage.py makemigrations --check

# frontend
docker compose exec frontend npm run typecheck
docker compose exec frontend npm run test              # after Part 01 adds Vitest
```

Every part is **flag-gated where the SRS says so** (BR-19: all flag checks are server-side). Ship dark, enable via `core.GlobalSetting`.

---

## Global Definition of Done (applies to every part — SRS Appendix B.1)

A task in any part is **done** only when:
- [ ] Code implements the linked **FR/BR** exactly; deviations documented.
- [ ] **Relationship-based authz** + **BR-21 self-dealing** guards covered by tests on touched endpoints.
- [ ] Unit + API tests written and **green**; money/domain logic ≥ 90% branch coverage; new status transitions have a state-machine test.
- [ ] User-facing strings go through the **i18n catalog** (after Part 08; before it, keep strings centralized for easy extraction); RTL verified at 360px + 1280px.
- [ ] **OpenAPI** schema regenerates clean; migrations are backward-compatible one release.
- [ ] ruff + mypy + tsc + security scans pass in CI; no new Sentry regressions on staging.
- [ ] **Feature-flag interaction** defined and tested in both flag states.
- [ ] Audit logging on admin mutations; new events added to the notification catalog.

## Definition of Done — per **part**
- [ ] All steps checked; the part's listed test files exist and pass.
- [ ] `pytest -q` and `npm run test` green; coverage not regressed below the Part 02/11 gate.
- [ ] The part's mapped **AC-x** criteria (Section 24 of the SRS) demonstrably pass.
- [ ] README / `.env.example` / OpenAPI updated; PR merged behind any new flag set to a safe default.

---

## Conventions used in the part files

- Checkboxes `- [ ]` are the runnable unit of work.
- **Test tags** in "Tests to add": ✅ positive · ⛔ negative · 🧪 validation · 🔐 permission · 🛡 security · ⚙ concurrency · 🪐 edge.
- Effort: **S** ≤1d · **M** 2–4d · **L** ≥1w.
- File paths are repo-relative. Backend services live in `backend/apps/<app>/services.py`; API in `backend/apps/<app>/api/`; tasks in `tasks.py`; tests in `backend/tests/` (Part 01 introduces the `unit/ integration/ tasks/ security/ db/` sub-layout).
