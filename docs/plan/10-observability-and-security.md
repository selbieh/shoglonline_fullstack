# PART 10 — Observability & Security Hardening

**Goal:** the production-grade guardrails a platform holding user funds requires.
**Depends on:** Parts 02 (tests), 09 (real integrations to monitor).
**SRS refs:** NFR-MNT-4, NFR-SEC/§16, SEC-1..11, AC-13. **Reference:** GAP Phase 15.
**Effort:** M

## Steps

### Observability — NFR-MNT-4
1. [x] Sentry on **backend + frontend** (release + environment tags; PII scrubbing). No new Sentry regressions becomes a deploy gate (DoD).
2. [x] Structured JSON logs everywhere; request IDs; redact secrets/PANs/tokens in logs (test asserts none leak).
3. [ ] Metrics (Prometheus/Grafana or hosted APM): API latency, queue depth, task failures.
4. [x] **Ledger-invariant alerting**: a periodic check that `Σ wallets == Σ deposits − withdrawals` and per-wallet `balance == Σ ledger`; page on violation. Alert on queue backlogs + dead-letters.

### Security — §16 / SEC
5. [ ] **Move auth tokens off `localStorage`** to HTTP-only secure cookies (SEC-1, currently self-flagged scaffold). Update `lib/api.ts` + CSRF handling.
6. [x] Content-Security-Policy + the full security-header set (HSTS/secure cookies already in prod settings — verify); CORS/CSRF trusted origins reviewed.
7. [x] Complete the **rate-limit matrix** (auth, chat-send, uploads, payments) beyond the current anon/user throttles.
8. [x] CI security scans every build: `pip-audit` + `npm audit` + Trivy image scan + secret scanning; fail on high severity.
9. [ ] **Penetration test** of wallet/escrow + auth (external engagement, SEC-11) — *book early, before money go-live*; track findings to closure.

## Tests to add
- `tests/security/test_sensitive_data.py` — secrets/PANs/tokens absent from API responses + logs; `DEBUG=False` in prod; no stack traces leaked.
- `tests/security/test_injection.py` — SQLi via filter/search/ordering params parameterized (no 500/leak); stored HTML rendered safely; slug path-traversal blocked.
- Ledger-invariant monitor has a unit test that **detects** a seeded violation.
- Cookie-auth tests on `lib/api.ts` (after the move): no token in JS-readable storage; refresh via cookie.

## Exit criteria (maps **AC-13**)
- [ ] Sentry live both sides; ledger-invariant + queue-backlog alerting in place and tested against a seeded violation.
- [ ] Tokens in HTTP-only cookies; CSP + headers + rate-limit matrix complete; dependency/secret/image scans gate CI.
- [ ] OWASP checklist passed; pen-test booked (findings tracked) ; PANs absent from all storage/logs; admin requires 2FA (Part 04).
