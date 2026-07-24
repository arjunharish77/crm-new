#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$VPS_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$VPS_DIR/.env"
  set +a
fi

URL="${HEALTHCHECK_URL:-http://127.0.0.1/api/health}"

echo "Checking $URL"
curl -fsS "$URL"
echo
