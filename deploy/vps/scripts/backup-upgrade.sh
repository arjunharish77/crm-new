#!/usr/bin/env bash
# Database + private files checkpoint for an existing deployment. No pruning or restore.
set -euo pipefail
umask 077
if [[ $# != 1 ]]; then echo 'Usage: bash deploy/vps/scripts/backup-upgrade.sh /absolute/new/backup-directory' >&2; exit 1; fi
VPS_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
OUT="$1"
[[ "$OUT" = /* && ! -e "$OUT" ]] || { echo 'Use a new absolute backup directory.' >&2; exit 1; }
[[ -f "$VPS_DIR/.env" ]] || { echo 'Existing VPS .env is required.' >&2; exit 1; }
set -a
source "$VPS_DIR/.env"
set +a
dc() { docker compose -f "$VPS_DIR/docker-compose.yml" --env-file "$VPS_DIR/.env" "$@"; }
# Require stopped app writers for a consistent database/private-file checkpoint.
for service in web worker unnatividya-web unnatividya-crm-worker ml-service; do
 if [[ -n "$(dc ps --status running -q "$service")" ]]; then echo "Stop $service before taking the upgrade checkpoint." >&2; exit 1; fi
done
WEB_ID="$(dc ps -aq web)"
[[ -n "$WEB_ID" ]] || { echo 'Existing web container is missing; refusing to guess its storage volume.' >&2; exit 1; }
mkdir -p "$OUT/storage"
cp "$VPS_DIR/.env" "$OUT/env.private"
cp "$VPS_DIR/docker-compose.yml" "$OUT/compose.yml"
dc exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT/crm.dump"
test -s "$OUT/crm.dump"
dc exec -T postgres pg_restore --list < "$OUT/crm.dump" > "$OUT/crm.contents.txt"
if [[ -n "${UNNATIVIDYA_POSTGRES_DB:-}" ]]; then
 dc exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$UNNATIVIDYA_POSTGRES_DB" -Fc > "$OUT/unnatividya.dump"
 test -s "$OUT/unnatividya.dump"
 dc exec -T postgres pg_restore --list < "$OUT/unnatividya.dump" > "$OUT/unnatividya.contents.txt"
fi
dc exec -T postgres pg_dumpall -U "$POSTGRES_USER" --globals-only > "$OUT/globals.private.sql"
docker cp "$WEB_ID:/app/storage/." "$OUT/storage"
(cd "$OUT" && sha256sum ./*.dump > SHA256SUMS)
echo "Upgrade checkpoint saved to $OUT. Keep a protected off-server copy before migrating."
