# PART 12 — Ops, Deploy & Acceptance Run (launch gate)

**Goal:** prove the build is operable and run the SRS release-level acceptance (AC-1…AC-15) on
staging, then go live.
**Depends on:** all prior parts.
**SRS refs:** NFR-REL-1/2/3, §20, §24 (AC-1…AC-15), AC-15. **Reference:** GAP Phase 7/15.
**Effort:** M

## Steps

### Ops readiness — NFR-REL
1. [~] Automated **PostgreSQL backups + PITR**; media backups; documented **restore runbook**; drill a restore (RPO ≤ 24h, RTO ≤ 4h). — **In-repo:** `backend/scripts/backup_db.sh` (pg_dump `-Fc` + TOC verify + 14-day retention), `restore_db.sh` (guarded `--clean` restore), `docs/ops/backup-restore.md` (PITR posture + restore drill + post-restore verify). **Operator:** run the actual drill + provision managed WAL/PITR + media replication.
2. [~] **Zero-downtime deploy** (rolling) + **rollback drill**; migrations backward-compatible one release. — **In-repo:** `docs/ops/deploy-rollback.md` (expand→migrate→contract rule, rolling steps, health check `GET /settings/public`, rollback drill). **Operator:** execute the deploy + rollback drill on real infra.
3. [x] **Maintenance-mode drill**: flip `platform.maintenance_mode` → Arabic 503 + Retry-After for the public site, admin stays reachable (Part 04). — `manage.py maintenance on|off|status` (audited via `set_setting`) + `docs/ops/maintenance-mode.md` drill + `tests/integration/test_maintenance_command.py` (+ existing `test_maintenance_mode.py`).
4. [x] Set production **flag defaults** per product decisions (auto-publish jobs/proposals, chat on, registration on, warranty/funding/expiry windows, commission ranges, currency). — `apps/core/services.DEFAULTS` is the launch catalog (`seed_settings`); go-live runbook §2 lists the values to confirm; `preflight` fails if the catalog isn't seeded.
5. [x] Confirm idempotent + retried background jobs with dead-letter handling (NFR-REL-3) under failure injection. — Celery `acks_late` + `reject_on_worker_lost` + `prefetch_multiplier=1` + `visibility_timeout` (base.py); **per-row failure isolation** in the contract sweepers + reconcile (a poisoned row is logged + skipped + retried next tick); `tests/tasks/test_sweeper_resilience.py` injects failures + asserts the config. Idempotency proven in `tests/test_payments.py` / `tests/tasks/test_contracts_tasks.py`.

### Release acceptance — run the full AC checklist on staging (Section 24)
> **Traceability:** `docs/ops/acceptance-matrix.md` maps every AC-1…AC-15 to its automated test
> evidence and flags the residual operator/staging-only checks. The automated layer is green; the
> boxes below stay open until the **staging acceptance run** signs off the manual column.
6. [ ] **AC-1 / AC-1b** auth & dual-role integrity (only Google SSO; instant lossless toggle; cross-view deep links; frozen side-effects; one user runs both sides; self-dealing rejected at API + DB).
7. [ ] **AC-2** localization (every screen/email/push/validation Arabic RTL; stub locale loads with no schema/layout change).
8. [ ] **AC-3** jobs E2E (post→moderate→publish→subscriber email→filter/sort/watchlist→proposal bid −1→private rating→accept→fund→siblings rejected→BR-4 lock).
9. [ ] **AC-4** services E2E (publish→browse/favourite→request w/ add-ons→accept→deliver→complete).
10. [ ] **AC-5** delivery & money (commission + BR-24 rounding; clock-forced warranty release; update-requests both ways; mutual cancel full refund; admin split legs; funding-timeout restores job; withdrawal instant hold; **double-accept → one contract**; ledger sums; gateway sandbox round-trip; lost-webhook reconciliation within SLA; idempotent replay).
11. [ ] **AC-6** chat (real-time ≤2s; files/emoji/audio; read receipts; FCM web push; 10-min unread email once with deep link; chat flag OFF kills chat; warranty-end read-only).
12. [ ] **AC-7** reviews · **AC-8** notifications · **AC-9** tickets (status machine + auto-solve + dispute coupling) · **AC-10** affiliate (attribution within cookie window; freeze stops accrual).
13. [ ] **AC-11** admin (Unfold KPIs; every list has filters/search; bulk approve/reject with notifications; audit log; every Section-22 Global Setting togglable with effect ≤60s).
14. [ ] **AC-12** SEO (Lighthouse ≥95; valid JSON-LD; fresh sitemaps; canonical/robots; CWV on staging hardware).
15. [ ] **AC-13** security (OWASP checklist; Firestore rules deny cross-user; FCM tokens encrypted; no PANs; admin 2FA; pen-test findings closed).
16. [ ] **AC-14** responsive (360/768/1280/1920; no horizontal scroll; touch targets).
17. [ ] **AC-15** ops (zero-downtime deploy demonstrated; rollback + backup-restore + maintenance drills).

### Go-live
18. [ ] Go-live runbook: provision real creds (Google/PayPal/Firebase/email/SMS), final flag defaults, smoke check, on-call + alerting (Part 10) armed, rollback path rehearsed.

## Exit criteria — **project accepted**
- [ ] Every **Must (M)** requirement in SRS Section 4 passes functional testing.
- [ ] **AC-1 … AC-15** all verified end-to-end on staging and signed off.
- [ ] Backup-restore, rollback, and maintenance drills demonstrated; flag defaults set; go-live runbook executed.
