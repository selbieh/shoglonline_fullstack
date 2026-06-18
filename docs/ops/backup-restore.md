# Backup & Restore Runbook (NFR-REL-1 · Part 12 step 1)

**Targets:** RPO ≤ 24h, RTO ≤ 4h.

## What is backed up
| Asset | Mechanism | Frequency | Retention |
|---|---|---|---|
| PostgreSQL (logical) | `backend/scripts/backup_db.sh` (pg_dump `-Fc`) | daily | 14 days (script-pruned) |
| PostgreSQL (PITR) | managed WAL archiving (see below) | continuous | provider window (≥ 7d) |
| Media (`MEDIA_ROOT` / S3) | bucket versioning + cross-region replication, **or** `aws s3 sync` of the volume | daily | 30 days |
| Secrets / env | secrets manager (out of band — never in a DB dump) | on change | — |

The daily logical dump satisfies the RPO on its own; WAL/PITR narrows the achievable RPO to minutes
and is the recommended production posture.

## Daily logical backup
```bash
DATABASE_URL=postgres://USER:PASS@HOST:5432/shoghl ./backend/scripts/backup_db.sh /var/backups/shoghl
```
The script dumps in custom format, **verifies the TOC is readable** (`pg_restore --list`), then prunes
to the newest 14 dumps. Wire it to cron/systemd-timer and alert on a non-zero exit.

## PITR (point-in-time recovery)
Use the managed Postgres provider's WAL archiving (RDS automated backups, Cloud SQL PITR, or
`wal-g`/`pgBackRest` if self-hosted). Confirm: continuous WAL shipping on, base backup ≤ 24h old,
retention ≥ 7 days. PITR target = "latest restorable time" or a chosen timestamp before an incident.

## Restore drill (run quarterly; required before go-live)
Restore into a **scratch** database — never the live one during a drill.
```bash
DATABASE_URL=postgres://USER:PASS@HOST:5432/shoghl_restore_test \
  CONFIRM_RESTORE=yes ./backend/scripts/restore_db.sh /var/backups/shoghl/shoghl-<STAMP>.dump
```
The restore script refuses to run without `CONFIRM_RESTORE=yes` (guards against wrong-DB accidents)
and uses `--clean --if-exists --exit-on-error` so a garbled archive fails loudly.

### Post-restore verification
1. `DATABASE_URL=...shoghl_restore_test python manage.py migrate --check` → **expect "no changes"**.
2. `python manage.py preflight` against the restored DB → settings seeded, migrations applied.
3. Spot-check the ledger invariant: `python manage.py shell -c "from apps.payments.monitoring import check_ledger_invariants; print(check_ledger_invariants())"` → **expect `[]`**.
4. Record start/finish timestamps → confirm **RTO ≤ 4h**.

## Incident recovery (production)
1. Declare maintenance: `python manage.py maintenance on` (public 503; admin stays reachable).
2. Identify the recovery point (last good dump, or PITR timestamp before the incident).
3. Restore (PITR via provider console, or `restore_db.sh` for a full logical restore).
4. Run the post-restore verification above.
5. `python manage.py maintenance off`; watch error rates + ledger monitor (Part 10) for one cycle.
