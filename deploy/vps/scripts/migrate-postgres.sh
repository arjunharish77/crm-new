#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"

docker compose -f "$COMPOSE_FILE" --env-file "$VPS_DIR/.env" run --rm web node scripts/db-migrate-local.js
