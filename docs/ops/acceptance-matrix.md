# Release Acceptance Matrix — AC-1 … AC-15 (SRS §24 · Part 12 steps 6–17)

Traceability from each release-acceptance criterion to its **automated evidence** in the repo, plus
the residual checks that can only be signed off by an **operator on staging** (real credentials,
visual/perf audits, live gateway, physical drills).

**Legend:** ✅ automated · ◐ core automated + manual overlay on staging · ⚙️ operator/staging-only.

| AC | Scope | Status | Automated evidence | Operator sign-off on staging |
|----|-------|:------:|--------------------|------------------------------|
| **AC-1 / AC-1b** | Auth & dual-role integrity | ◐ | `tests/test_auth.py`, `tests/unit/test_google_auth.py`, `tests/regression/test_dual_role_e2e.py`, `tests/integration/test_freeze_ripple.py`, `tests/security/test_self_dealing.py`, frontend `e2e/auth.spec.ts` | Real Google SSO; instant lossless mode toggle in browser; frozen side-effects visible |
| **AC-2** | Localization (Arabic RTL everywhere) | ◐ | frontend `lib/__tests__/i18n.test.ts` (key parity), `lib/i18n.ts`, `messages/{ar,en}.ts` | Every screen/email/push/validation Arabic RTL; stub `en` locale loads with no layout/schema change |
| **AC-3** | Jobs E2E (post→publish→propose→accept→fund→siblings rejected, BR-4 lock) | ◐ | `tests/test_jobs.py`, `tests/integration/test_jobs_api.py`, `tests/test_contracts.py`, `tests/regression/test_money_invariants.py` | Full browser journey incl. subscriber email + filter/sort/watchlist (deferred Playwright step 2) |
| **AC-4** | Services E2E (publish→favourite→request w/ add-ons→accept→deliver) | ◐ | `tests/test_gigs.py`, `tests/integration/test_gigs_api.py` | Browser favourite + add-on purchase (deferred Playwright step 3) |
| **AC-5** | Delivery & money (commission/BR-24, warranty release, refunds, splits, idempotent replay) | ◐ | `tests/test_contracts.py`, `tests/test_payments.py`, `tests/unit/test_payments_ledger.py`, `tests/unit/test_contracts_commission.py`, `tests/unit/test_commission_ranges.py`, `tests/regression/test_money_invariants.py`, `tests/tasks/test_contracts_tasks.py`, `tests/tasks/test_sweeper_resilience.py` | PayPal **live** sandbox→prod round-trip; lost-webhook reconciliation within SLA on real gateway |
| **AC-6** | Chat (real-time ≤2s, files/emoji/audio, receipts, push, unread email, kill-switch, read-only) | ◐ | `tests/test_chat.py`, `tests/integration/test_chat_firestore.py`, `tests/integration/test_chat_reports.py` | Real-time latency ≤2s; FCM web push on a device; Firestore emulator rules suite (deferred Playwright step 6) |
| **AC-7** | Reviews | ✅ | `tests/test_reviews_tickets.py` | Spot-check review lock after warranty in browser |
| **AC-8** | Notifications | ✅ | `tests/integration/test_broadcast.py`, `tests/integration/test_notification_prefs.py`, `tests/tasks/test_scheduled_notifications.py` | Real SMTP delivery; FCM push |
| **AC-9** | Tickets (status machine + auto-solve + dispute coupling) | ✅ | `tests/test_reviews_tickets.py`, `tests/integration/test_tickets_onhold.py`, `tests/integration/test_admin_dispute_resolution.py` | — |
| **AC-10** | Affiliate (attribution within cookie window; freeze stops accrual) | ✅ | `tests/test_invoices_affiliate.py`, `tests/integration/test_affiliate_clicks.py` | — |
| **AC-11** | Admin (KPIs, filters/search, bulk + notify, audit log, ≤60s flag effect) | ◐ | `tests/integration/test_admin_{permissions,moderation,bulk_actions,exports,ledger_readonly,user_actions}.py`, `tests/integration/test_settings_flags.py`, `tests/unit/test_analytics_kpis.py`, `tests/test_admin_dashboard.py`, `tests/test_cms_analytics.py` | Unfold KPI visuals; observe a flag taking effect ≤60s end-to-end |
| **AC-12** | SEO (Lighthouse ≥95, JSON-LD, sitemaps, canonical/robots, CWV) | ◐ | frontend `lib/__tests__/seoLd.test.ts`, `lib/__tests__/seo.test.ts`, sitemap/robots routes | **Lighthouse ≥95 on staging hardware** + Core Web Vitals (deferred Lighthouse-CI) |
| **AC-13** | Security (OWASP, Firestore deny cross-user, FCM tokens encrypted, no PANs, admin 2FA, pen-test) | ◐ | `tests/security/test_{authorization_matrix,injection,ledger_monitor,self_dealing,sensitive_data,staff_2fa}.py`, `tests/integration/test_chat_firestore.py`, CI `security` job (pip-audit/npm-audit/Trivy/gitleaks) | OWASP checklist walkthrough; **pen-test findings closed**; Firestore rules emulator run |
| **AC-14** | Responsive (360/768/1280/1920, no horizontal scroll, touch targets) | ◐ | frontend `e2e/browse.spec.ts` (public viewport matrix) | Touch-target sizes; authenticated-flow viewport sweeps (deferred with Playwright steps 2–6) |
| **AC-15** | Ops (zero-downtime deploy, rollback, backup-restore, maintenance drills) | ◐ | `tests/integration/test_maintenance_mode.py`, `tests/integration/test_maintenance_command.py`, `tests/integration/test_preflight.py`, `tests/tasks/test_sweeper_resilience.py`, `tests/tasks/test_contracts_tasks.py` (beat registration) | **Physical drills** per `deploy-rollback.md`, `backup-restore.md`, `maintenance-mode.md` |

## How to run the acceptance pass
1. **Automated layer (CI/local):** `python manage.py preflight` then the full suite
   `pytest -n auto -m "not load"` (coverage ≥90%) + nightly `-m "regression or load or db"`; frontend
   `npm run test:cov` + `tsc` + `npm run build`; Playwright `e2e/` against the stubbed stack.
2. **Operator layer (staging):** work the ⚙️/◐ "operator sign-off" column above using the go-live
   runbook; record results + timestamps and attach to the release ticket.
3. **Sign-off:** every row green (or waived with reason) → tick the Part 12 exit criteria.

## Known automation gaps (carried as deferred, not silently dropped)
- The four authenticated multi-actor Playwright journeys (AC-3/4/5/6 browser flows) — covered today by
  the backend integration suite; need a browser-capable env to author (Part 11 steps 2–6).
- Lighthouse-CI budgets + Firestore-rules emulator suite in nightly (Part 11 step 13 / AC-12 / AC-13).
- k6/Locust load suite with §18 p95 numbers (Part 11 step 9).
- Pen-test (AC-13) and the physical ops drills (AC-15) are inherently operator-run.
