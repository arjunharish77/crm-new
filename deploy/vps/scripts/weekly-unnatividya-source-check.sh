#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/vps/docker-compose.yml"
ENV_FILE="$ROOT_DIR/deploy/vps/.env"

cd "$ROOT_DIR"
exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm --no-deps unnatividya-web node scripts/weekly-source-check.js
