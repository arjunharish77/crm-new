# CRM VPS Deployment

This deployment runs the CRM on a VPS with direct Postgres, a separate worker process, and Caddy as the HTTPS reverse proxy.

**For a full start-to-finish runbook** (removing a prior app, OS/firewall/SSH hardening,
DNS, first deploy, backups, rollback), see [`docs/VPS_DEPLOYMENT.md`](../../docs/VPS_DEPLOYMENT.md).
This file is the quicker reference for someone who's already done it once.

## First Setup

```bash
cd /opt/crm
cp deploy/vps/.env.example deploy/vps/.env
```

Edit `deploy/vps/.env` and set:

- `APP_DOMAIN` / `API_DOMAIN`
- `ACME_EMAIL`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `JWT_SECRET`
- all cron/webhook secrets

The database host inside Docker Compose is `postgres`.

## Start

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps
deploy/vps/scripts/healthcheck.sh
```

## Import Existing Data

For an initial restore, place a `pg_dump -Fc` backup on the VPS and run:

```bash
deploy/vps/scripts/restore-postgres.sh /absolute/path/to/supabase-or-local.dump
```

For SQL dumps, use `psql` manually against the `postgres` service, then run the app migration scripts if needed.

## Apply App Migrations

After restoring the base CRM schema/data, apply checked-in SQL migrations through the app image:

```bash
deploy/vps/scripts/migrate-postgres.sh
```

This runs `node scripts/db-migrate-local.js` inside the `web` image with the VPS `.env`. The script name is historical; it uses `DIRECT_DATABASE_URL` or `DATABASE_URL` and is safe for VPS Postgres.

## Worker

The `worker` service is a BullMQ worker backed by Redis. It registers repeatable jobs using `WORKER_REPEAT_MS`, consumes one-off export jobs, and executes server processors directly rather than polling app APIs:

- automations
- task reminders
- report rollup jobs
- report schedules
- communications outbox
- export file generation

The worker logs job completion/failure events:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f worker
```

## Backup

```bash
deploy/vps/scripts/backup-postgres.sh
```

Backups are written to `deploy/vps/backups` on the host and mounted at `/backups` in the Postgres container.

## Restore Rehearsal

Always test restore on a staging VPS or temporary database before production cutover:

```bash
deploy/vps/scripts/restore-postgres.sh /opt/crm/deploy/vps/backups/example.dump
deploy/vps/scripts/healthcheck.sh
```

## Local Development

Local development does not require Docker:

```bash
npm install
npm run db:setup:local
npm run db:migrate:local
npm run db:seed:local
npm run dev
```
