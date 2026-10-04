#!/usr/bin/env bash
# Round-2 plan O7: regenerate package-lock.json for this app on its own, outside the outer
# workspace, with the npm version the Docker image uses. Only the lockfile changes; run
# `npm ci` afterwards if you need node_modules refreshed.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp "$here/package.json" "$work/"
[ -f "$here/package-lock.json" ] && cp "$here/package-lock.json" "$work/"
[ -f "$here/.npmrc" ] && cp "$here/.npmrc" "$work/"
(cd "$work" && npx -y npm@10.8.2 install --package-lock-only --ignore-scripts --no-audit --no-fund)
cp "$work/package-lock.json" "$here/package-lock.json"
node "$here/scripts/check-lockfile.js"
