#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"
BACKUP_DIR="$VPS_DIR/backups"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"

mkdir -p "$BACKUP_DIR"

if [ -f "$VPS_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$VPS_DIR/.env"
  set +a
fi

backup_db() {
  db_name="$1"
  db_user="$2"
  out="/backups/${db_name}-${STAMP}.dump"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$db_user" -d "$db_name" -Fc -f "$out"
  echo "$BACKUP_DIR/${db_name}-${STAMP}.dump"
}

backup_db "${POSTGRES_DB:-crm}" "${POSTGRES_USER:-crm_app}"

if [ -n "${UNNATIVIDYA_POSTGRES_DB:-}" ]; then
  backup_db "$UNNATIVIDYA_POSTGRES_DB" "${POSTGRES_USER:-crm_app}"
fi
