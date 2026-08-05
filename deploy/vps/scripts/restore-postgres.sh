#!/usr/bin/env sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 /absolute/path/to/backup.dump [target_database]" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"
BACKUP_PATH="$1"
BACKUP_NAME="$(basename "$BACKUP_PATH")"
TARGET_DB="${2:-}"

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

mkdir -p "$VPS_DIR/backups"
cp "$BACKUP_PATH" "$VPS_DIR/backups/$BACKUP_NAME"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U "${POSTGRES_USER:-crm_app}" -d "${TARGET_DB:-${POSTGRES_DB:-crm}}" "/backups/$BACKUP_NAME"

echo "Restored $BACKUP_NAME into ${TARGET_DB:-${POSTGRES_DB:-crm}}"
