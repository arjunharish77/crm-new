#!/usr/bin/env bash
# Round-2 plan O4: deploy a version that GitHub Actions has built, tested and published.
#
#   deploy/vps/scripts/deploy.sh sha-1a2b3c4     # a version from the Actions run or GHCR
#   deploy/vps/scripts/deploy.sh latest          # newest build of main
#
# Steps: pull the image, apply new migrations, start web and worker, wait for both to be
# healthy and check /api/health. If any step fails, the previous version is started again and
# the script exits non-zero. Migrations are additive (new tables and columns), so the previous
# version keeps working on the migrated database. Unnatividya isn't touched.
#
# SKIP_MIGRATE=1 skips the migration step (used by rollback.sh).
set -euo pipefail

VPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$VPS_DIR/.env"
HISTORY="$VPS_DIR/.deploy-history"
DC=(docker compose -f "$VPS_DIR/docker-compose.yml" --env-file "$ENV_FILE")

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>   e.g. sha-1a2b3c4 or latest" >&2
  exit 2
fi

current_version() { grep -E '^CRM_VERSION=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
set_version() {
  local tmp; tmp="$(mktemp)"
  grep -vE '^CRM_VERSION=' "$ENV_FILE" > "$tmp" || true
  printf 'CRM_VERSION=%s\n' "$1" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}
healthy() {
  "${DC[@]}" exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>{console.log(JSON.stringify(j));process.exit(j.database==='ok'&&j.redis==='ok'?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})"
}

PREVIOUS="$(current_version)"
echo "==> Deploying $VERSION (running now: ${PREVIOUS:-unknown})"

revert() {
  echo "!! $1" >&2
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$VERSION" ]; then
    echo "==> Starting the previous version again: $PREVIOUS" >&2
    set_version "$PREVIOUS"
    "${DC[@]}" up -d --no-deps --wait --wait-timeout 300 web worker || echo "!! The previous version didn't come up cleanly either; check: ${DC[*]} logs --tail 100 web worker" >&2
  else
    set_version "${PREVIOUS:-$VERSION}"
  fi
  exit 1
}

set_version "$VERSION"
echo "==> Pulling the image"
"${DC[@]}" pull web worker || revert "Couldn't pull $VERSION. Is the version right, and is this server logged in to ghcr.io?"

if [ "${SKIP_MIGRATE:-0}" != "1" ]; then
  echo "==> Applying migrations"
  "${DC[@]}" run --rm --no-deps web node scripts/db-migrate-local.js --upgrade || revert "Migrations failed; nothing else was changed."
fi

echo "==> Starting web and worker"
"${DC[@]}" up -d --no-deps --wait --wait-timeout 300 web worker || revert "web or worker didn't become healthy. See: ${DC[*]} logs --tail 100 web worker"

echo "==> Checking /api/health"
healthy || revert "/api/health isn't healthy."

printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$VERSION" >> "$HISTORY"
echo "==> Deployed $VERSION"
