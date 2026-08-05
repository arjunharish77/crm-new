#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-deploy/vps/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-deploy/vps/.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy deploy/vps/.env.example first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${UNNATIVIDYA_POSTGRES_DB:?UNNATIVIDYA_POSTGRES_DB is required}"
: "${UNNATIVIDYA_POSTGRES_USER:?UNNATIVIDYA_POSTGRES_USER is required}"
: "${UNNATIVIDYA_POSTGRES_PASSWORD:?UNNATIVIDYA_POSTGRES_PASSWORD is required}"

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -v db="$UNNATIVIDYA_POSTGRES_DB" \
  -v app_user="$UNNATIVIDYA_POSTGRES_USER" \
  -v app_password="$UNNATIVIDYA_POSTGRES_PASSWORD" <<'SQL'
select format('create role %I login password %L', :'app_user', :'app_password')
where not exists (select 1 from pg_roles where rolname = :'app_user')\gexec

select format('alter role %I with login password %L', :'app_user', :'app_password')\gexec

select format('create database %I owner %I', :'db', :'app_user')
where not exists (select 1 from pg_database where datname = :'db')\gexec

grant all privileges on database :"db" to :"app_user";
SQL

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm unnatividya-web node scripts/db-migrate-local.js

echo "Unnati Vidya database is ready: $UNNATIVIDYA_POSTGRES_DB"
