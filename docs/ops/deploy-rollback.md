# Deploy & Rollback Runbook (NFR-REL-2 · Part 12 steps 2 + 17)

**Goal:** zero-downtime rolling deploys with a rehearsed rollback. The reference target is containers
behind a reverse proxy (Traefik/Nginx/ALB) with ≥2 backend replicas; the same shape maps to ECS,
Kubernetes (Deployment + rolling update), or two compose stacks behind the proxy.

## Backward-compatible migrations (the core rule)
Each release's DB schema must work with **both** the old and the new code for one release, so a rolling
fleet (mixed versions mid-deploy) and a rollback are both safe. This is the **expand → migrate →
contract** pattern across **two** releases:

- **Expand (release N):** add columns/tables **nullable or defaulted**; add indexes `CONCURRENTLY`.
  Never rename or drop in the same release as the code that stops using a column.
- **Migrate (release N):** new code writes both old+new where needed; backfill via a data migration or
  a one-off task.
- **Contract (release N+1):** only after N is fully rolled out and stable, drop the old column/table.

Forbidden in a single release: drop/rename a column still read by the running version; add a
`NOT NULL` column with no default; a long table-locking migration during peak.

## Rolling deploy
1. **Pre-deploy:** CI green on the release SHA (backend + frontend + e2e + security jobs). Tag/build
   immutable images. Confirm the migration is expand-only (review against the rule above).
2. **Migrate first:** apply `python manage.py migrate` once (migrations are forward-only and, per the
   rule, compatible with the still-running old code).
3. **Roll the app:** replace replicas one at a time; the proxy only routes to instances passing the
   health check. Keep ≥1 healthy replica serving at all times.
   - Health check: `GET /api/v1/settings/public` (cheap, DB-backed, no auth) → 200.
4. **Roll workers/beat:** restart Celery worker + beat onto the new image (`acks_late` redelivers any
   in-flight task; sweepers are idempotent — see NFR-REL-3).
5. **Verify:** error rate flat, `preflight` clean, ledger monitor `[]`, a smoke login + one funded
   action succeed.

## Rollback drill (rehearse before go-live; step 17)
1. Re-point the proxy/orchestrator to the **previous** image tag and roll replicas back one at a time.
2. **Do not** auto-run a down-migration. Because release N was expand-only, the old code runs fine on
   N's schema. Only run a reverse migration if N introduced an incompatibility (it shouldn't).
3. Verify health checks green and `preflight` clean on the rolled-back version.
4. Record rollback start→healthy duration (target: minutes).

## Demonstration checklist (AC-15)
- [ ] Deploy a no-op change with zero failed health checks / zero 5xx during the roll.
- [ ] Roll back that change and confirm service stays up throughout.
- [ ] A release containing a migration deploys and rolls back without data loss.
