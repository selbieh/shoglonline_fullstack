#!/usr/bin/env bash
# Restore a custom-format dump produced by backup_db.sh (Part 12 step 1 restore drill).
#
#   DATABASE_URL=postgres://user:pass@host:5432/db ./scripts/restore_db.sh <dump_file>
#
# DESTRUCTIVE: --clean drops and recreates objects in the target DB. Refuses to run unless
# CONFIRM_RESTORE=yes is set, so it can't be triggered by accident against the wrong database.
set -euo pipefail

DUMP_FILE="${1:?usage: restore_db.sh <dump_file>}"
DB_URL="${DATABASE_URL:?DATABASE_URL must be set}"
[ -f "$DUMP_FILE" ] || { echo "no such file: $DUMP_FILE" >&2; exit 1; }

if [ "${CONFIRM_RESTORE:-}" != "yes" ]; then
  echo "Refusing to restore: set CONFIRM_RESTORE=yes to confirm overwriting the target DB." >&2
  echo "Target: ${DB_URL%%\?*}" >&2
  exit 2
fi

echo "==> Verifying archive ${DUMP_FILE}"
pg_restore --list "$DUMP_FILE" >/dev/null

echo "==> Restoring into ${DB_URL%%\?*}"
# --clean --if-exists = idempotent re-restore; --no-owner = map ownership to the connecting role.
# --exit-on-error so a partial/garbled restore fails loudly instead of leaving a half-loaded DB.
pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -d "$DB_URL" "$DUMP_FILE"
echo "==> Restore complete. Run: python manage.py migrate --check  (expect: no changes)"
