#!/usr/bin/env sh
set -eu

# F20 fix (WP11): the target database was previously OPTIONAL, silently defaulting to
# "${POSTGRES_DB:-crm}" -- i.e. production -- if the caller forgot the second argument. That is
# exactly the failure mode the audit explicitly warns about ("never run the existing restore
# script against production merely to prove it works"): a single missing argument used to be all
# it took. The target is now a required, explicit argument with no default, and this script
# refuses outright to restore into whatever POSTGRES_DB is currently configured as (the
# production database name) unless RESTORE_ALLOW_PRODUCTION_TARGET=yes is also set -- a separate,
# deliberate, hard-to-fat-finger opt-in for the one legitimate case that needs it (an actual DR
# event), not the default path.
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 /absolute/path/to/backup.dump[.enc] target_database" >&2
  echo "" >&2
  echo "target_database is REQUIRED (no default) and must not be the configured production" >&2
  echo "database name unless RESTORE_ALLOW_PRODUCTION_TARGET=yes is set. Rehearse into a" >&2
  echo "disposable name first -- see verify-backup-restore.sh for an automated version of that." >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"
BACKUP_PATH="$1"
BACKUP_NAME="$(basename "$BACKUP_PATH")"
TARGET_DB="$2"

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

if [ "$TARGET_DB" = "${POSTGRES_DB:-crm}" ] && [ "${RESTORE_ALLOW_PRODUCTION_TARGET:-}" != "yes" ]; then
  echo "Refusing to restore into '$TARGET_DB' -- that is the configured production database." >&2
  echo "If this is a genuine, intentional disaster-recovery restore, re-run with:" >&2
  echo "  RESTORE_ALLOW_PRODUCTION_TARGET=yes $0 $BACKUP_PATH $TARGET_DB" >&2
  exit 1
fi

mkdir -p "$VPS_DIR/backups"
cp "$BACKUP_PATH" "$VPS_DIR/backups/$BACKUP_NAME"

# F20 fix (WP11): transparently decrypt a backup produced by the encryption-at-rest option in
# backup-postgres.sh (a ".dump.enc" file) into a plain ".dump" before restoring -- restoring
# happens from a plaintext temp copy inside the container's own /backups mount, removed
# immediately after.
RESTORE_NAME="$BACKUP_NAME"
case "$BACKUP_NAME" in
  *.enc)
    if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
      echo "This backup is encrypted (.enc) but BACKUP_ENCRYPTION_KEY is not set -- cannot decrypt." >&2
      rm -f "$VPS_DIR/backups/$BACKUP_NAME"
      exit 1
    fi
    RESTORE_NAME="${BACKUP_NAME%.enc}"
    openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
      -in "$VPS_DIR/backups/$BACKUP_NAME" -out "$VPS_DIR/backups/$RESTORE_NAME"
    ;;
esac

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U "${POSTGRES_USER:-crm_app}" -d "$TARGET_DB" "/backups/$RESTORE_NAME"

if [ "$RESTORE_NAME" != "$BACKUP_NAME" ]; then
  rm -f "$VPS_DIR/backups/$RESTORE_NAME"
fi

echo "Restored $BACKUP_NAME into $TARGET_DB"
