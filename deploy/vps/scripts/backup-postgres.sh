#!/usr/bin/env sh
set -eu

# F20 fix (WP11): adds three things the audit's own text calls out as missing from the previous
# version of this script -- encryption at rest, an integrity checksum recorded alongside each
# dump, and retention (old backups are not kept forever, unbounded, on the same disk they were
# made on). This does NOT establish off-host storage or a rehearsed restore into a genuinely
# separate/isolated target -- that requires choosing a destination (which cloud storage, what
# credentials) and an agreed RPO/RTO, both business/infrastructure decisions outside this
# script's own scope. Copying $BACKUP_DIR to an off-host destination (rclone, an S3-compatible
# `aws s3 sync`, etc.) is the natural next step once that destination is chosen -- deliberately
# left as a manual/cron step layered on top of this script rather than guessed at here.
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
VPS_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$VPS_DIR/docker-compose.yml"
BACKUP_DIR="$VPS_DIR/backups"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"

mkdir -p "$BACKUP_DIR"

if [ -f "$VPS_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$VPS_DIR/.env"
  set +a
fi

# Optional: set BACKUP_ENCRYPTION_KEY to enable encryption at rest. Unset (the default) leaves
# behavior identical to before this fix -- a plain .dump file -- so this is opt-in, not a breaking
# change to any existing backup/restore automation that doesn't know about it yet.
encrypt_if_configured() {
  plain_path="$1"
  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "$plain_path"
    return
  fi
  encrypted_path="${plain_path}.enc"
  openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:${BACKUP_ENCRYPTION_KEY}" -in "$plain_path" -out "$encrypted_path"
  rm -f "$plain_path"
  echo "$encrypted_path"
}

record_checksum() {
  file_path="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$(dirname "$file_path")" && sha256sum "$(basename "$file_path")" > "$(basename "$file_path").sha256")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$(dirname "$file_path")" && shasum -a 256 "$(basename "$file_path")" > "$(basename "$file_path").sha256")
  else
    echo "Warning: no sha256sum/shasum available -- skipping checksum for $file_path" >&2
  fi
}

backup_db() {
  db_name="$1"
  db_user="$2"
  container_path="/backups/${db_name}-${STAMP}.dump"
  host_path="$BACKUP_DIR/${db_name}-${STAMP}.dump"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    pg_dump -U "$db_user" -d "$db_name" -Fc -f "$container_path"
  final_path="$(encrypt_if_configured "$host_path")"
  record_checksum "$final_path"
  echo "$final_path"
}

backup_db "${POSTGRES_DB:-crm}" "${POSTGRES_USER:-crm_app}"

if [ -n "${UNNATIVIDYA_POSTGRES_DB:-}" ]; then
  backup_db "$UNNATIVIDYA_POSTGRES_DB" "${POSTGRES_USER:-crm_app}"
fi

# F20 fix (WP11): retention -- without this, backups accumulate on the SAME disk forever
# (the audit's own "backup scheduling/alerts" gap). BACKUP_RETENTION_DAYS defaults to 14;
# set it to 0 to disable pruning entirely (e.g. while off-host copying is still being set up
# and you don't want anything deleted locally yet).
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
if [ "$RETENTION_DAYS" -gt 0 ] 2>/dev/null; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name "*.dump" -o -name "*.dump.enc" -o -name "*.sha256" \) -mtime "+${RETENTION_DAYS}" -print -delete
fi
