# PART 02 — Backend Coverage → ≥90% (cover everything that already exists)

**Goal:** turn "happy-path coverage of core money rules" into **near-complete coverage of every
implemented SRS rule, transition, and edge case**, then turn on the coverage gate. This is the
bulk of "covered all test cases" for the code that already exists.
**Depends on:** Part 01.
**SRS refs:** Appendix B.2, BR-1…BR-24, AC-1b/3/4/5/6/7/9/10, §9.10 state machines.
**Reference:** TESTING_STRATEGY §4 (file-by-file), §5 (cross-cutting), §9 (security), §10 (regression), §11 (SRS→test matrix).
**Effort:** L

## Steps (work P0 → P2 by criticality — TESTING_STRATEGY §13.2)

### P0 — money & integrity (do first; financial blast radius)
1. [ ] `tests/unit/test_payments_ledger.py` — `post()` recomputes buckets; `balance == Σ succeeded rows`; idempotency-key dedupe; ⚙ `select_for_update` serializes concurrent posts; triple webhook replay → one row; settle/reconcile flips stale pending. *(FR-PAY-1/9, BR-9/24)*
2. [ ] `tests/unit/test_contracts_commission.py` — `commission + worker_earning == budget` exactly across parametrized budgets/rates incl. `0.01 / 99.99 / 1234.56` + odd %; commission row absorbs sub-cent remainder (half-even). *(FR-PAY-6, BR-24)*
3. [ ] `tests/unit/test_contracts_state_machine.py` + `tests/unit/test_jobs_state_machine.py` + `tests/unit/test_gigs_pricing.py` — transition tables incl. **illegal** transitions (§9.10).
4. [ ] `tests/regression/test_money_invariants.py` — randomized op-sequence (fund/deliver/accept/cancel/dispute/warranty): every wallet still `balance == Σ ledger` and `Σ all wallets == Σ deposits − withdrawals` (no money created/destroyed). Tag `@pytest.mark.regression`.
5. [ ] `tests/regression/test_dual_role_e2e.py` — **AC-1b**: one account runs an employer-side **and** worker-side contract simultaneously; buckets stay correct; self-dealing attempts rejected throughout.
6. [ ] Harden `tests/integration/test_contracts_api.py` + `tests/tasks/test_contracts_tasks.py` — full lifecycle over API; funding-timeout sweeper reverts job→published + proposal→viewed (BR-6a); warranty release idempotent; ⚙ **double-accept race → exactly one contract**.

### P1 — core marketplace & security
7. [ ] `tests/security/test_self_dealing.py` — BR-21 across **every** entity: proposal, invitation, service buy, contract, conversation, review, affiliate referral — blocked at API (Arabic error) **and** DB constraint.
8. [ ] `tests/security/test_authorization_matrix.py` — table-driven: every protected endpoint × {anon, other-user, owner, staff} → expected status. Catches funding/accepting someone else's contract, reading others' wallet/notifications/chat, confirming another employer's invoice.
9. [ ] `tests/security/test_authentication.py` — token tamper/expiry/blacklist; throttle on `/auth/*`; frozen-account lockout on every request.
10. [ ] Split/extend per-app integration suites to target (TESTING_STRATEGY §4): `test_proposals_api.py`, `test_jobs_api.py`, `test_bids_api.py`, `test_wallet_api.py`, `test_gigs_api.py`, `test_chat_api.py`, `test_reviews_api.py`, `test_tickets_api.py`, `test_invoices_api.py`, `test_affiliate_api.py`, `test_notifications_api.py`. Each adds the ⛔/🧪/🔐/🪐 cases listed there.
11. [ ] **Fill the no-test apps** flagged by the audit: `tests/integration/test_subscriptions_api.py` (+ fan-out task), dedicated `tests/integration/test_bids_api.py`, `tests/integration/test_profiles_api.py` (lazy create, completeness, nested resources once Part 03/04 add endpoints), `tests/integration/test_catalog_api.py` (skills detail).
   - **Admin-side** view/action/permission tests are owned by **Part 06B** (`tests/integration/test_admin_*.py`, `tests/security/test_admin_permissions.py`) — they count toward the same coverage gate. Existing `test_admin_dashboard.py` stays.

> **Bug-hunting is a deliverable of this part, not a side-effect.** Every gap the hardening pass
> uncovers (a wrong transition, an off-by-one in rounding, a missing authz check, an N+1) is
> **fixed in code and pinned with a regression test** before the part closes. Latent bugs found
> here must not be left as TODOs.

### P1 — async jobs (frozen clocks)
12. [ ] `tests/tasks/` for every periodic task in the 9-job beat schedule: `test_jobs_tasks.py` (expiry), `test_payments_tasks.py` (reconcile), `test_chat_tasks.py` (unread-email at exactly +10m + suppression), `test_tickets_tasks.py` (auto-solve/close, skip disputed). Assert **beat-schedule registration** (every scheduled name imports).

### Cross-cutting
13. [ ] `tests/contracts_api/` — `test_openapi_schema.py` (schema builds clean, every route present), `test_pagination.py` (`{count,next,previous,results}`, PAGE_SIZE=20, OOB→404), `test_filtering_sorting.py`, `test_error_envelope.py` (Arabic `{code, message_ar}`; 400/401/403/404 consistent; `Idempotency-Key` honored).
14. [ ] `tests/db/` — `test_constraints.py` (single platform wallet, unique proposal/(job,worker), unique review/(contract,author), `no_self_dealing`, `qty_positive`, unique idempotency key), `test_relationships.py` (PROTECT/CASCADE), `test_migrations.py` (`makemigrations --check` clean), `test_transactions.py` (atomic rollback on mid-post failure).
15. [ ] Add `@pytest.mark.srs("FR-…")` markers and wire the CI step that emits the §11 matrix and **fails if any P0/P1 SRS ref has zero referencing tests**.

### Turn on the gate
16. [ ] Set coverage targets (TESTING_STRATEGY §13.3): `services.py` ≥95%, views/serializers ≥90%, tasks ≥90%, models ≥85%, overall **`--cov-fail-under=90`**. Add to `pytest.ini` and the CI backend job.

## Exit criteria
- [ ] Backend coverage ≥ 90% overall (≥95% on `services.py`); gate enforced in CI.
- [ ] `tests/security/test_self_dealing.py` proves BR-21 on all entities; authz matrix green.
- [ ] Money invariant + dual-role regression suites green; double-accept race produces exactly one contract.
- [ ] Every beat task has a frozen-clock behavior test; OpenAPI/pagination/error-envelope contract tests green.
- [ ] SRS-marker CI step shows no P0/P1 requirement with zero tests.
