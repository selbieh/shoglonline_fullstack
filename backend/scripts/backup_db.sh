#!/usr/bin/env bash
# PostgreSQL logical backup (Part 12 step 1). Writes a compressed custom-format dump that
# `restore_db.sh` / `pg_restore` can read. Pair with WAL archiving for true PITR (see
# docs/ops/backup-restore.md) — this script is the daily logical snapshot, not PITR by itself.
#
#   DATABASE_URL=postgres://user:pass@host:5432/db ./scripts/backup_db.sh [out_dir]
#
# Exit non-zero on any failure so a cron/CI wrapper can alert.
set -euo pipefail

OUT_DIR="${1:-./backups}"
DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"
OUT_FILE="$OUT_DIR/shoghl-${STAMP}.dump"

echo "==> Dumping database to ${OUT_FILE}"
# -Fc = custom format (compressed, selective restore); --no-owner/--no-privileges = portable restore.
pg_dump "$DB_URL" -Fc --no-owner --no-privileges -f "$OUT_FILE"

# Integrity probe: pg_restore --list must parse the archive header/TOC.
pg_restore --list "$OUT_FILE" >/dev/null
echo "==> OK ($(du -h "$OUT_FILE" | cut -f1)). Verified TOC is readable."

# Retain the 14 most recent dumps; older ones are pruned (RPO policy lives in the runbook).
ls -1t "$OUT_DIR"/shoghl-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "==> Retention applied (kept newest 14)."
