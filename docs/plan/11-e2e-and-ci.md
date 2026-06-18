# PART 11 — E2E Suite & Full CI

**Goal:** lock the golden user journeys with Playwright and make CI a real quality gate.
**Depends on:** Part 01 (Playwright bootstrap), and the features under test (Parts 03–09).
**SRS refs:** NFR-MNT-2, Appendix B.2 (Frontend/Performance rows), AC-1…AC-14. **Reference:** TESTING_STRATEGY §7, §8, §13.4.
**Effort:** M

## Steps

### E2E (Playwright, `frontend/e2e/`, run against `docker compose up` with stubs ON + seeded DB)
1. [x] `auth.spec.ts` — stub Google login → mode select → dashboard → logout. *(AC-1)*
2. [ ] `job-to-contract.spec.ts` — post job → worker proposes (bid −1) → employer accepts → wallet funds → contract Active → siblings auto-rejected. *(AC-3)* — **deferred**: end-to-end mechanics are locked by the backend integration suite (`tests/integration/`); the multi-actor Playwright version needs a runnable browser to author/validate (not available in the alpine container).
3. [ ] `service-purchase.spec.ts` — publish service → browse/favourite → buy with add-ons → worker accepts → contract Active. *(AC-4)* — **deferred** (as step 2; covered by backend integration tests).
4. [ ] `delivery-and-warranty.spec.ts` — submit deliverable → accept → escrow splits (commission to platform) → force-elapse warranty → funds released → review locked. *(AC-5/AC-7)* — **deferred** (escrow split + warranty release covered by `tests/integration` + payments tests).
5. [ ] `dispute.spec.ts` — open dispute from submission → admin split resolution → ledger legs correct → ticket closes. *(AC-5/BR-22)* — **deferred** (dispute split + ledger legs covered by backend dispute tests).
6. [ ] `chat.spec.ts` — contract parties chat ≤2s → unread badge → warranty-end read-only. *(AC-6 — needs Part 09)* — **deferred** (Firestore client write-model; needs emulator harness).
7. [x] Run each critical flow through the **responsive viewport matrix** (360/768/1280/1920) — assert no horizontal scroll. *(AC-14)* — `browse.spec.ts` sweeps the public flows (`/`, `/jobs`, `/services`, `/freelancers`) across all four breakpoints; authenticated-flow viewport sweeps land with steps 2–6.

### Performance guards (out of the PR gate; nightly/`-m load`)
8. [x] N+1 guards: `assertNumQueries` (via `django_assert_max_num_queries`) on hot list endpoints (jobs/services/freelancers listings) — bounded queries via `select_related`/`prefetch_related` (`tests/db/test_query_counts.py`, marked `db`, in the nightly job). Contract-detail guard still open.
9. [ ] k6/Locust load suites (`perf/`): public listings p95 < 300ms at target RPS; warranty-release + funding-timeout sweepers process 10k due rows within their beat interval; unread-email minute sweep scales without duplicates. — **deferred** (no `perf/` suite yet; nightly runs the `load`-marked pytest smoke).

### CI wiring (`.github/workflows/ci.yml`)
10. [x] **backend job** — Postgres service; `pytest -n auto --cov-report=xml -m "not load"` (coverage gate `--cov-fail-under=90` in pytest.ini); ruff + `makemigrations --check`.
11. [x] **frontend job** — `npm run test:cov` (gate; regression floor in `vitest.config.ts`) + tsc + build.
12. [x] **e2e job** (PR + nightly) — `docker compose up -d` (stubs on) → wait on backend API + frontend → `playwright test`; upload traces/videos on failure.
13. [x] **nightly** — `schedule` cron runs `-m "regression or load or db"` (full regression + load smoke + N+1 guards). Lighthouse-CI budgets + Firestore-rules emulator tests still open.
14. [x] **gates** — PR blocked on: any test fail, coverage below target, migration drift, ruff/tsc errors, high-sev dependency scan (Part 10 `security` job). Slow load tests excluded from PR gate (`-m "not load"`).

## Exit criteria
- [~] Playwright auth journey + public-browse viewport matrix green against the stubbed stack in Arabic RTL; the four authenticated multi-actor journeys (steps 2–6) are deferred to a browser-capable env and currently covered by the backend integration suite.
- [x] CI enforces coverage ≥90% backend / regression-floor frontend, migration-drift, lint/type, dependency scans; e2e job runs on PR + nightly.
- [~] N+1 guards on hot list endpoints in place; load smoke runs nightly via pytest `load` marker — documented k6/Locust numbers vs the §18 targets still open.
