#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"

# Default is --upgrade: it refuses to run unless the CRM schema and migration ledger already
# exist, so it can never bootstrap over (or re-baseline) a live database. Only a brand-new,
# empty server should pass --bootstrap (restores db-bootstrap/base-schema.sql first).
MODE="--upgrade"
if [ "${1:-}" = "--bootstrap" ]; then MODE=""; fi

docker compose -f "$COMPOSE_FILE" --env-file "$VPS_DIR/.env" run --rm --no-deps web node scripts/db-migrate-local.js $MODE
