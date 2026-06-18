# Go-Live Runbook (Part 12 step 18 · launch gate)

Execute top-to-bottom on the production environment. Every box must be checked (or consciously waived
with sign-off) before traffic is cut over.

## 1. Provision real credentials (secrets manager, never in the repo)
- [ ] `DJANGO_SECRET_KEY` — fresh, ≥50 random chars.
- [ ] `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` — real domains.
- [ ] **Google SSO** OAuth client id/secret (`GOOGLE_AUTH_STUB` unset/false).
- [ ] **PayPal** live client id/secret + webhook id (`PAYPAL_STUB` unset/false).
- [ ] **Firebase** service account + web config (FCM push, Firestore chat).
- [ ] **Email** SMTP creds + `DEFAULT_FROM_EMAIL` (no console backend).
- [ ] **S3** bucket + IAM creds if `USE_S3=1` (private, signed URLs).
- [ ] **Sentry** DSN + environment/release (Part 10).
- [ ] Datastore URLs: `DATABASE_URL`, `CACHE_URL`, `CELERY_BROKER_URL`.

## 2. Final flag defaults (SRS §22 — confirm against product decisions)
Seed + review the launch catalog (set per `apps/core/services.DEFAULTS`; change in the admin if a
product decision differs):
```bash
python manage.py seed_settings
```
Confirm at minimum: `jobs.auto_publish=false` (moderated), `proposals.auto_publish=true`,
`services.auto_publish=false`, `chat.enabled=true`, `registration.enabled=true`,
`platform.maintenance_mode=false`, `contracts.warranty_days`, `contracts.funding_timeout_hours`,
`payments.commission_pct` / commission tiers, `platform.currency=USD`.

## 3. Database & static
- [ ] `python manage.py migrate` (expand-only — see deploy-rollback.md).
- [ ] `python manage.py seed_catalog` (categories/skills) if first deploy.
- [ ] `python manage.py collectstatic --noinput`.
- [ ] Staff roles + admin 2FA: `python manage.py setup_staff_roles`; create superuser; enroll TOTP.

## 4. Preflight gate (must exit 0)
```bash
python manage.py preflight        # DEBUG/stub off, secret/hosts real, email/storage prod, DB seeded+migrated
```
Resolve every `[FAIL]`. Review each `[WARN]` (TLS redirect / Sentry / S3) and waive only with reason.

## 5. Observability & safety nets armed (Part 10)
- [ ] Sentry receiving events; ledger-invariant monitor beat running (`monitor_ledger_invariants`).
- [ ] Celery worker **and** beat up; `CELERY_BEAT_SCHEDULE` jobs registered (covered by a test).
- [ ] Alerting/on-call wired to Sentry + uptime + the ledger ERROR log.
- [ ] Log redaction confirmed (no PAN/token/secret in a sample log line).

## 6. Smoke check (post-deploy, before announcing)
- [ ] `GET /api/v1/settings/public` → 200 (health check the proxy uses).
- [ ] Google sign-in → onboarding → dashboard.
- [ ] Post a job → admin moderate/publish → it appears in listings.
- [ ] Wallet charge (live PayPal sandbox→prod smoke) → balance credited once; ledger invariant `[]`.
- [ ] Send a chat message → delivered ≤2s; FCM push received.
- [ ] Trigger a notification email → received (real SMTP).

## 7. Drills rehearsed (AC-15 — see sibling runbooks)
- [ ] Backup taken today + restore drill passed (backup-restore.md).
- [ ] Zero-downtime deploy + rollback demonstrated (deploy-rollback.md).
- [ ] Maintenance-mode flip on/off verified (maintenance-mode.md).

## 8. Cut over
- [ ] DNS/proxy → production; TLS valid; HSTS on.
- [ ] Watch error rate + latency + ledger monitor for one full beat cycle.
- [ ] Rollback path confirmed reachable. **Announce launch.**
