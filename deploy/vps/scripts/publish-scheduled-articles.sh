#!/usr/bin/env bash
# Wave 5 C2: publish article revisions whose scheduled time has passed. Install as a cron entry that
# runs every five minutes (see apps/unnatividya/docs/CMS_PUBLISHING_DEPLOYMENT.md). It runs inside the
# already-running website container, so nothing new starts every five minutes.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/vps/docker-compose.yml"
ENV_FILE="$ROOT_DIR/deploy/vps/.env"

cd "$ROOT_DIR"
exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T unnatividya-web node scripts/publish-scheduled.js
