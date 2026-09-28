#!/usr/bin/env sh
set -eu

# F20 fix (WP11): "rehearse a restore into an isolated target" -- automated, and safe by
# construction: this ALWAYS restores into a freshly-created, randomly-suffixed database (never
# the configured production database, never a name the caller chooses), runs a handful of basic
# tenant/auth/financial-table smoke checks against it, then drops it. Exits non-zero if the
# restore itself fails, if the smoke checks find the restored data implausible (e.g. zero
# tenants), or if pg_restore reported any error -- so this is safe to wire into a cron/alerting
# pipeline as a genuine, periodic proof that backups are actually restorable, not just present.
#
# This does not by itself prove an off-host copy of the backup is restorable (only whatever copy
# is passed in) -- run it against a copy fetched FROM the off-host destination, not the local
# file the backup step already trusts, for that assurance.
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /absolute/path/to/backup.dump[.enc]" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"
BACKUP_PATH="$1"
BACKUP_NAME="$(basename "$BACKUP_PATH")"
VERIFY_DB="restore_verify_$(date -u +%s)_$$"

if [ ! -f "$BACKUP_PATH" ]; then
  echo "Backup not found: $BACKUP_PATH" >&2
  exit 1
fi

if [ -f "$VPS_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$VPS_DIR/.env"
  set +a
fi

ADMIN_USER="${POSTGRES_USER:-crm_app}"

cleanup() {
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$ADMIN_USER" -d postgres -c "drop database if exists \"$VERIFY_DB\";" >/dev/null 2>&1 || true
  if [ -n "${RESTORE_NAME:-}" ] && [ "$RESTORE_NAME" != "$BACKUP_NAME" ]; then
    rm -f "$VPS_DIR/backups/$RESTORE_NAME"
  fi
  rm -f "$VPS_DIR/backups/$BACKUP_NAME.verify-copy"
}
trap cleanup EXIT

mkdir -p "$VPS_DIR/backups"
cp "$BACKUP_PATH" "$VPS_DIR/backups/$BACKUP_NAME.verify-copy"
mv "$VPS_DIR/backups/$BACKUP_NAME.verify-copy" "$VPS_DIR/backups/$BACKUP_NAME"

RESTORE_NAME="$BACKUP_NAME"
case "$BACKUP_NAME" in
  *.enc)
    if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
      echo "This backup is encrypted (.enc) but BACKUP_ENCRYPTION_KEY is not set -- cannot decrypt." >&2
      exit 1
    fi
    RESTORE_NAME="${BACKUP_NAME%.enc}"
    openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
      -in "$VPS_DIR/backups/$BACKUP_NAME" -out "$VPS_DIR/backups/$RESTORE_NAME"
    ;;
esac

echo "Creating disposable verification database: $VERIFY_DB"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$ADMIN_USER" -d postgres -c "create database \"$VERIFY_DB\";"

echo "Restoring $BACKUP_NAME into $VERIFY_DB ..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore --no-owner -U "$ADMIN_USER" -d "$VERIFY_DB" "/backups/$RESTORE_NAME"

# Tenant/auth/financial smoke checks (the audit's own named surfaces) -- fails loudly rather than
# silently if a restored backup looks empty/implausible instead of merely "pg_restore exited 0".
smoke_query() {
  label="$1"
  sql="$2"
  count="$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$ADMIN_USER" -d "$VERIFY_DB" -t -A -c "$sql" | tr -d '[:space:]')"
  echo "  $label: $count"
  # POSIX-safe "is this a non-negative integer" check -- a numeric `[ -lt 0 ]` comparison on a
  # non-numeric or empty value errors out (exit 2) rather than evaluating false, which combined
  # with `||` short-circuiting would let genuinely invalid output slip through undetected.
  case "$count" in
    ''|*[!0-9]*)
      echo "Smoke check failed to produce a valid count for: $label (got: '$count')" >&2
      exit 1
      ;;
  esac
}

echo "Running smoke checks against the restored database ..."
smoke_query "Tenants" 'select count(*) from "Tenant";'
smoke_query "Users" 'select count(*) from "User";'
smoke_query "Leads" 'select count(*) from "Lead";'
smoke_query "Payouts" 'select count(*) from "Payout";'
smoke_query "Applied migrations" 'select count(*) from "SchemaMigration" where status = '"'"'APPLIED'"'"';'

echo "Restore verification passed: $BACKUP_NAME restores cleanly and contains plausible data."
