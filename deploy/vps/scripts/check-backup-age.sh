#!/usr/bin/env sh
set -eu

# F20 fix (WP11): "backup-age alerts" -- the audit's own named gap. Exits non-zero (with a clear
# message on stderr) if the newest backup file is older than the configured threshold, or if
# there are no backups at all. Designed to be wired into cron alongside backup-postgres.sh
# (e.g. `*/15 * * * * .../check-backup-age.sh || mail -s "CRM backup stale" ops@example.com`) --
# this script only checks and reports; it never creates, deletes, or modifies a backup.
# Deliberately avoids GNU-find-only flags (-printf, -newermt) after finding, while testing this
# script directly, that they're not reliably available in every environment this might run
# under -- `ls -t` (newest-first by mtime) is the portable equivalent used instead.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$VPS_DIR/backups"
MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}" # a bit over 24h so a daily cron has slack, not a race
MAX_AGE_SECONDS=$((MAX_AGE_HOURS * 3600))

if [ ! -d "$BACKUP_DIR" ]; then
  echo "No backup directory found at $BACKUP_DIR" >&2
  exit 1
fi

# `ls -t` lists matches newest-first by mtime; nullglob isn't POSIX, so a genuinely empty
# directory leaves the literal (unmatched) glob patterns as $1/$2 below -- checked explicitly.
set -- "$BACKUP_DIR"/*.dump "$BACKUP_DIR"/*.dump.enc
latest=""
for candidate in "$@"; do
  [ -f "$candidate" ] || continue
  if [ -z "$latest" ]; then
    latest="$candidate"
  else
    latest_mtime=$(date -r "$latest" +%s 2>/dev/null || echo 0)
    candidate_mtime=$(date -r "$candidate" +%s 2>/dev/null || echo 0)
    [ "$candidate_mtime" -gt "$latest_mtime" ] && latest="$candidate"
  fi
done

if [ -z "$latest" ]; then
  echo "STALE: no backup files found at all in $BACKUP_DIR" >&2
  exit 1
fi

now_epoch=$(date +%s)
latest_epoch=$(date -r "$latest" +%s)
age_seconds=$((now_epoch - latest_epoch))

if [ "$age_seconds" -le "$MAX_AGE_SECONDS" ]; then
  echo "OK: newest backup ($latest) is within the last ${MAX_AGE_HOURS}h"
  exit 0
fi

echo "STALE: newest backup ($latest) is older than ${MAX_AGE_HOURS}h" >&2
exit 1
