# Direct Postgres VPS Runbook

This is the practical checklist for moving the CRM from Vercel + Supabase to a VPS running:

- Next.js web app
- separate worker process
- direct Postgres database
- local VPS file storage
- Caddy HTTPS reverse proxy

The codebase is already prepared for direct Postgres runtime. Docker is only required on the VPS, not for local development.

## 1. Local Checks Before Touching VPS

Run these from the local repo:

```bash
cd crm
npm install
npm test
npx tsc --noEmit
npm run build
```

Confirm no Supabase runtime dependency remains:

```bash
rg -n "@/lib/supabase|@supabase|createSupabaseAdminClient|createSupabaseServerClient|createBrowserClient|createServerClient|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|DATA_ACCESS_MODE=supabase" src scripts tests package.json .env.example deploy/vps/.env.example -S
```

Expected: no matches.

## Local Native Postgres Setup

Use this flow when running the CRM locally without Docker.

First make sure local Postgres is running:

```bash
pg_isready -h localhost -p 5432
psql -h localhost -U arjunh -d postgres -c "show server_version;"
```

For this migration, local Postgres should be the same major version as Supabase or newer. Supabase currently reports Postgres 17.x in this project; local Postgres 14.x is too old for a reliable dump/restore path.

Confirm your `.env` uses your actual local Postgres admin role. On this machine the local superuser is usually `arjunh`, not `postgres`:

```env
DATA_ACCESS_MODE=postgres
LOCAL_POSTGRES_ADMIN_URL=postgresql://arjunh@localhost:5432/postgres
DATABASE_URL=postgresql://crm_app:crm_app@localhost:5432/crm_dev
DIRECT_DATABASE_URL=postgresql://arjunh@localhost:5432/crm_dev
REDIS_URL=redis://localhost:6379
WORKER_REPEAT_MS=60000
```

Set `SUPABASE_DATABASE_URL` only for exporting the old managed Supabase database:

```env
SUPABASE_DATABASE_URL=postgresql://...
```

Use Supabase Dashboard -> Project Settings -> Database -> Connection string. If `db.<project-ref>.supabase.co` does not resolve locally, use the session pooler connection string.

Install PostgreSQL 17 client/server tools locally before exporting from a Postgres 17 Supabase project:

```bash
brew install postgresql@17
brew services stop postgresql
brew services start postgresql@17
```

If you do not want to change your default `pg_dump`/`psql`, point the scripts to the versioned binaries:

```env
PG_DUMP_PATH=/opt/homebrew/opt/postgresql@17/bin/pg_dump
PSQL_PATH=/opt/homebrew/opt/postgresql@17/bin/psql
```

On Intel Macs those paths may be:

```env
PG_DUMP_PATH=/usr/local/opt/postgresql@17/bin/pg_dump
PSQL_PATH=/usr/local/opt/postgresql@17/bin/psql
```

Run the setup as a fail-fast chain so later commands do not run after an earlier failure:

```bash
cd /Users/arjunh/Documents/crm/crm
npm run db:setup:local &&
npm run db:export:supabase &&
BASE_SCHEMA_SQL_PATH=./db-dumps/supabase-schema.sql npm run db:migrate:local &&
npm run db:import:local-data &&
npm run db:seed:local &&
npm run dev
```

Run the queue worker in a second terminal when testing automations, reminders, communications, report schedules, or export generation:

```bash
cd /Users/arjunh/Documents/crm/crm
npm run worker
```

The local worker requires Redis. On macOS, install/start Redis separately, for example with Homebrew:

```bash
brew install redis
brew services start redis
```

If export fails, stop there. Do not run migrate/import/seed/dev until `db-dumps/supabase-schema.sql` and `db-dumps/supabase-data.sql` exist.

If a previous dev server is already running, stop it first:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <PID>
```

## 2. VPS Prerequisites

Provision a VPS with:

- Ubuntu 22.04 or 24.04 LTS
- 4 vCPU minimum for demo/staging, 8 vCPU preferred for production
- 16 GB RAM minimum for production
- 100 GB+ SSD storage
- public IPv4
- DNS access for your CRM domain
- outbound access for SMTP, WhatsApp, and SMS provider APIs

Install on the VPS:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
```

Install Docker Engine and Docker Compose plugin on the VPS using Docker's official instructions for Ubuntu.

After install:

```bash
docker --version
docker compose version
```

## 3. Copy Code to VPS

Use whichever deployment method you prefer.

Example:

```bash
sudo mkdir -p /opt/unnatify-crm
sudo chown "$USER":"$USER" /opt/unnatify-crm
cd /opt/unnatify-crm
git clone <your-repo-url> .
```

If you are copying from local instead of Git, copy the whole `crm/` folder contents to `/opt/unnatify-crm`.

## 4. Configure VPS Environment

Create the VPS env file:

```bash
cd /opt/unnatify-crm
cp -n deploy/vps/.env.example deploy/vps/.env
```

Edit:

```bash
nano deploy/vps/.env
```

Set these carefully:

```env
DOMAIN=app.yourdomain.com
ACME_EMAIL=admin@yourdomain.com

POSTGRES_DB=crm
POSTGRES_USER=crm_app
POSTGRES_PASSWORD=<strong-password>

DATABASE_URL=postgresql://crm_app:<strong-password>@postgres:5432/crm
DIRECT_DATABASE_URL=postgresql://crm_app:<strong-password>@postgres:5432/crm

NODE_ENV=production
DATA_ACCESS_MODE=postgres
JWT_SECRET=<long-random-secret>

FILE_STORAGE_DRIVER=local
FILE_STORAGE_ROOT=/app/storage

APP_INTERNAL_URL=http://web:3000
WORKER_REPEAT_MS=60000
WORKER_CONCURRENCY=5

AUTOMATION_CRON_SECRET=<long-random-secret>
TASKS_CRON_SECRET=<long-random-secret>
REPORTING_CRON_SECRET=<long-random-secret>
COMMUNICATIONS_CRON_SECRET=<long-random-secret>
COMMUNICATIONS_WEBHOOK_SECRET=<long-random-secret>
WEBHOOK_SIGNING_SECRET=<long-random-secret>
```

Generate secrets with:

```bash
openssl rand -base64 48
```

Do not add Supabase URL, anon key, or service-role key to production runtime env.

## 5. DNS Setup

Before cutover, lower DNS TTL for your CRM domain to 300 seconds.

Point an `A` record to the VPS IP:

```text
app.yourdomain.com -> <VPS_PUBLIC_IP>
```

Do this before starting the final HTTPS/cutover flow so Caddy can issue certificates.

For the Unnati Vidya public website on the same VPS, point these records to the same VPS IP:

```text
unnatividya.com     -> <VPS_PUBLIC_IP>
www.unnatividya.com -> <VPS_PUBLIC_IP>
```

The website runs as a separate Next.js service, uses the same Postgres server, and uses a separate
database/user configured through `UNNATIVIDYA_DATABASE_URL`.

## 6. Validate Docker Compose

On the VPS:

```bash
cd /opt/unnatify-crm
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env config
```

## Unnati Vidya Website on the Same VPS

After copying `deploy/vps/.env.example` to `deploy/vps/.env`, set these website values:

```env
UNNATIVIDYA_DOMAIN=unnatividya.com
UNNATIVIDYA_POSTGRES_DB=unnatividya
UNNATIVIDYA_POSTGRES_USER=unnatividya_app
UNNATIVIDYA_POSTGRES_PASSWORD=<strong-password>
UNNATIVIDYA_DATABASE_URL=postgresql://unnatividya_app:<strong-password>@postgres:5432/unnatividya
UNNATIVIDYA_SESSION_SECRET=<long-random-secret>
NEXT_PUBLIC_UNNATIVIDYA_SITE_URL=https://unnatividya.com
ZEPTOMAIL_API_URL=https://api.zeptomail.in/v1.1/email
ZEPTOMAIL_API_KEY=<Zoho-enczapikey ...>
ZEPTOMAIL_FROM_EMAIL=info@unnatividya.com
ZEPTOMAIL_FROM_NAME=Unnati Vidya
```

Create the website database/user and apply the website migration:

```bash
cd /opt/unnatify-crm
sh deploy/vps/scripts/setup-unnatividya-db.sh
```

Seed the initial website catalog, if needed:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm unnatividya-web node scripts/seed.js
```

Run the source importer manually when you want to refresh captured source snapshots:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm unnatividya-web node scripts/source-import.js
```

Start the CRM and website stack:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
```

The website CRM sync worker is intentionally not started by default. Start it only after CRM/API
handoff is configured and `UNNATIVIDYA_CRM_SYNC_WORKER_ENABLED=true`:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env --profile unnatividya-crm-sync up -d unnatividya-crm-worker
```

After first deployment:

```bash
curl -I https://unnatividya.com
curl -s https://unnatividya.com/api/health
curl -s https://unnatividya.com/robots.txt
curl -s https://unnatividya.com/sitemap.xml
curl -s https://unnatividya.com/sitemap-index.xml
curl -s https://unnatividya.com/sitemaps/courses.xml
curl -s https://unnatividya.com/sitemaps/universities.xml
```

Then open `https://unnatividya.com/admin/setup` once, create the first independent website CMS admin,
and set `UNNATIVIDYA_CMS_SETUP_ENABLED=false` in `deploy/vps/.env` before restarting the website.

Local website verification status before VPS push, last checked 04/08/2026:

```bash
cd /Users/arjunh/Documents/crm/crm
npx tsc --noEmit --project apps/unnatividya/tsconfig.json
npm run unnatividya:routes:smoke
npm run unnatividya:sitemap:smoke
npm run unnatividya:mobile:smoke
npm run unnatividya:lead-otp:smoke
npm run unnatividya:build
```

Current Unnati Vidya caveats:

- Docker Compose config validation must be done on the VPS or another Docker-enabled machine.
- Final image optimization/Lighthouse checks should be done after production assets from `14_UNNATIVIDYA_ASSET_CHECKLIST.md` are added.
- The website CRM sync worker stays disabled unless the CMS CRM/API sync settings are configured and explicitly enabled.
- The public lead wizard stores leads locally first and verifies email OTP; it does not auto-push to CRM by default.

Expected: Compose prints the rendered config without errors.

Build the image:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env build
```

## 7. Database Migration Options

### Option A — Fresh Demo Database

Use this if you only need a clean demo/staging VPS.

Start Postgres first:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d postgres
```

Apply migrations after base schema is available. If the base schema has already been restored, run:

```bash
deploy/vps/scripts/migrate-postgres.sh
```

Seed demo data if needed:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm web node scripts/seed-demo-test-data.js
```

### Option B — Migrate Existing Supabase Data

From local or a secure machine with access to the old Supabase direct database URL:

```bash
npm run db:export:supabase
```

Copy the dump to the VPS.

For a custom-format dump:

```bash
deploy/vps/scripts/restore-postgres.sh /absolute/path/to/backup.dump
deploy/vps/scripts/migrate-postgres.sh
```

For plain SQL dumps, restore manually with `psql` into the `postgres` service, then run:

```bash
deploy/vps/scripts/migrate-postgres.sh
```

## 8. Start VPS Stack

```bash
cd /opt/unnatify-crm
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps
```

Check health:

```bash
deploy/vps/scripts/healthcheck.sh
```

Check logs:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f web
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f worker
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs -f caddy
```

Expected worker log includes heartbeat lines.

## 9. Create or Confirm Platform Admin

If a platform admin does not exist:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm \
  -e PLATFORM_ADMIN_EMAIL=admin@example.com \
  -e PLATFORM_ADMIN_PASSWORD='ChangeMeStrong123!' \
  -e PLATFORM_ADMIN_NAME='Platform Admin' \
  web node scripts/ensure-platform-admin.js
```

Store the generated/admin password safely.

## 10. Configure Communication Connectors

Inside CRM UI:

- Settings -> Integrations -> Messaging
- Configure SMTP provider
- Configure WhatsApp HTTP provider
- Configure SMS HTTP provider
- Configure templates
- Verify webhook shared secret matches `COMMUNICATIONS_WEBHOOK_SECRET`

Run test sends only after real provider credentials are entered.

## 11. Smoke Test Checklist

Log in and test:

- Dashboard cards load.
- Leads list loads.
- Lead detail opens.
- Create lead works.
- Opportunities load by type.
- Create/update opportunity works.
- Activities list loads.
- Create activity works.
- Tasks list loads.
- Create/complete task works.
- Views module loads assigned views.
- Reports page loads inbuilt reports.
- Custom report builder runs a query.
- Payout settings/cycles load.
- Gamification rules/settings load.
- Predictive scoring settings and recompute work.
- Partner profile/payout pages load for partner login.
- Public form route loads and submits.
- Audit logs load.
- Notifications load.

Also verify:

```bash
deploy/vps/scripts/healthcheck.sh
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env logs --tail=100 worker
```

## 12. Backup and Restore Rehearsal

Create a backup:

```bash
deploy/vps/scripts/backup-postgres.sh
```

Copy the backup path printed by the command.

Do a restore rehearsal on staging or a temporary VPS, not on production:

```bash
deploy/vps/scripts/restore-postgres.sh /absolute/path/to/backup.dump
deploy/vps/scripts/healthcheck.sh
```

Do not cut over production until backup and restore are proven.

## 13. Production Cutover

Before cutover:

- Lower DNS TTL to 300 seconds.
- Take a final Supabase database export.
- Export old file storage objects if any remain.
- Stop writes on old Vercel/Supabase app, or put it into maintenance mode.
- Confirm latest code is on VPS.
- Confirm `.env` secrets are final.

During cutover:

```bash
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
deploy/vps/scripts/healthcheck.sh
```

Then switch DNS to the VPS IP if not already done.

After cutover:

- Watch web logs for 2 hours.
- Watch worker logs for 2 hours.
- Verify key users can log in.
- Verify dashboards/reports.
- Verify new writes.
- Verify communications queue.
- Verify backup runs.

## 14. Rollback Plan

Rollback if:

- users cannot log in
- leads/opportunities do not load
- writes fail
- worker is duplicating jobs
- data mismatch is severe
- payout/invoice flow is broken

Rollback steps:

1. Stop new writes on VPS.
2. Point DNS back to Vercel.
3. Keep managed Supabase as source of truth.
4. Export any VPS-only writes for manual reconciliation.
5. Diagnose VPS issue offline.

Do not delete the old Vercel/Supabase setup until the VPS has run cleanly through a full business cycle.

## 15. Current Known Pending Items

These are pending because Docker is not installed locally and must be done on the VPS:

- Compose config validation.
- Production Docker image build.
- VPS stack startup.
- Live `/api/health` check.
- Worker heartbeat verification.
- Backup/restore rehearsal.
- Final DNS cutover.

These are operational decisions still needed:

- Final production domain.
- VPS provider and machine size.
- Whether to keep local VPS file storage long-term or move to S3/R2 later.
- SMTP provider.
- WhatsApp provider.
- SMS provider.
- Maintenance window for final cutover.
