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

OUT="/backups/${POSTGRES_DB:-crm}-${STAMP}.dump"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-crm_app}" -d "${POSTGRES_DB:-crm}" -Fc -f "$OUT"

echo "$BACKUP_DIR/${POSTGRES_DB:-crm}-${STAMP}.dump"
