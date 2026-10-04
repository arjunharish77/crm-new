#!/usr/bin/env bash
# Round-2 plan O4: go back to the version deployed before the current one (from .deploy-history),
# or to a named version. Migrations aren't run: the older version works on the newer schema
# because migrations only add.
#
#   deploy/vps/scripts/rollback.sh               # the previous version
#   deploy/vps/scripts/rollback.sh sha-1a2b3c4   # a specific one
set -euo pipefail

VPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HISTORY="$VPS_DIR/.deploy-history"
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  if [ ! -f "$HISTORY" ] || [ "$(wc -l < "$HISTORY")" -lt 2 ]; then
    echo "No earlier deploy recorded in $HISTORY; name a version: $0 sha-1a2b3c4" >&2
    exit 2
  fi
  CURRENT="$(tail -1 "$HISTORY" | awk '{print $2}')"
  TARGET="$(awk '{print $2}' "$HISTORY" | grep -vx "$CURRENT" | tail -1)"
fi
echo "==> Rolling back to $TARGET"
SKIP_MIGRATE=1 exec "$VPS_DIR/scripts/deploy.sh" "$TARGET"
