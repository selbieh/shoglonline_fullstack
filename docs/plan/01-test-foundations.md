# PART 01 — Test Foundations & CI Gates

**Goal:** stand up the test tooling on both sides so every later part ships *with* tests and CI can gate on coverage. No product behavior changes.
**Depends on:** nothing (do this first).
**SRS refs:** NFR-MNT-2, Appendix B.2. **Reference:** TESTING_STRATEGY §1–3, §12–14.
**Effort:** M

## Steps

### Backend
1. [ ] Add dev deps to `backend/requirements/local.txt`: `pytest-cov`, `factory_boy`, `freezegun`, `pytest-xdist`, `pytest-mock`, `responses`. Rebuild image (`docker compose build backend`).
2. [ ] **Extend** the *existing* `backend/tests/conftest.py` — it already provides `api_client`, `as_user`, `employer`, `worker`, `staff`, `category`, `fund_wallet` (posts a **real** ledger row). Add the two missing pieces: a `frozen_user` fixture and an **autouse `settings_defaults`** seeding the Global Settings the suite relies on (`jobs.auto_publish`, `payments.commission_pct`, `contracts.warranty_days`, `contracts.funding_timeout_hours`). **Do not recreate the file** (it has 10 fixtures already).
3. [ ] Create `backend/tests/factories/` with one module per app (`accounts.py`, `catalog.py`, `jobs.py`, `bids.py`, `payments.py`, `contracts.py`, `gigs.py`, `reviews.py`, `tickets.py`, `invoices.py`, `affiliate.py`, `chat.py`). Money-touching factories post through the ledger. Example in TESTING_STRATEGY §14.2.
4. [ ] Create the test sub-folders (keep existing flat `test_*.py` working — pytest discovers recursively): `tests/unit/ tests/integration/ tests/tasks/ tests/db/ tests/security/ tests/contracts_api/`. Add `pytest.ini` markers: `unit, integration, tasks, db, security, contracts_api, regression, load, srs`.
5. [ ] Add coverage config: `--cov=apps --cov-report=term-missing` in `pytest.ini`; **do not** set `--cov-fail-under` yet (that gate lands in Part 02 once coverage is raised).
6. [ ] **Verify/extend** the *existing* `tests/env/test_environment.py` (already present): it should assert prod settings fail fast without `DJANGO_SECRET_KEY`, and that `.env.example` documents every `env(...)` key read by `config/settings/base.py` (drift guard). Add any missing assertions.
7. [ ] Add a `seed_demo` management command (categories, bid plans, ticket types, one affiliate `CommissionRule`, sample CMS pages) so E2E + manual QA have fixtures.

### Frontend
8. [ ] Add dev deps to `frontend/package.json`: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `msw`, `@playwright/test`, `@vitejs/plugin-react`.
9. [ ] Add `frontend/vitest.config.ts` (jsdom, `@` alias, setup file, v8 coverage) and `vitest.setup.ts` (jest-dom matchers, MSW server lifecycle, `localStorage` shim). Scaffold in TESTING_STRATEGY §14.4.
10. [ ] Add `frontend/test/msw/` (server + per-area handlers) and `frontend/test/utils/render.tsx`. Handler example in TESTING_STRATEGY §14.5.
11. [ ] Add `frontend/playwright.config.ts` (chromium, `locale: "ar"`, baseURL 3000). §14.6.
12. [ ] Add scripts to `package.json`: `test`, `test:watch`, `test:cov`, `e2e`.
13. [ ] Write **two seed tests to prove the harness**: `lib/__tests__/api.test.ts` (Bearer header, 401→refresh→retry, error envelope, 204→undefined) and `lib/__tests__/contractStatus.test.ts` (every status has label+chip).

### CI
14. [ ] Update `.github/workflows/ci.yml`: backend job gains a **Postgres service container** and runs `pytest -n auto --cov=apps --cov-report=xml`; frontend job runs `npm run test`. Keep ruff/tsc/build. (Coverage *gate* + e2e job arrive in Part 11.)

## Tests to add (proving the harness)
- `tests/env/test_environment.py` — 🛡 prod fails fast; `.env.example` drift guard.
- `lib/__tests__/api.test.ts` — ✅ header/refresh/envelope/204.
- `lib/__tests__/contractStatus.test.ts` — 🪐 exhaustive status keys.

## Exit criteria
- [ ] `docker compose exec backend pytest -q` runs the existing 142 tests (plus any conftest/env extensions) green, with a coverage number printed.
- [ ] `docker compose exec frontend npm run test` runs the 2 seed tests green.
- [ ] CI backend job runs against Postgres; frontend job runs Vitest.
- [ ] `.env.example` documents every backend env var (env drift test green).
