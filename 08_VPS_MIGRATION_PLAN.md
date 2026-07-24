# VPS Migration Plan — CRM

This plan migrates the CRM from Vercel + managed Supabase to a VPS-hosted stack with frontend, backend, worker, and database services.

## Current State Confirmed From Code

- The active CRM app is the Next.js app under `crm/`.
- Frontend and backend are currently combined in one Next.js app:
  - frontend pages under `src/app/dashboard/...`
  - backend route handlers under `src/app/api/...`
- Data access is through `@supabase/supabase-js` and `@supabase/ssr`, not through a direct Postgres driver.
- Server-side DB access relies on:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- The app uses custom auth/JWT logic, but Supabase clients are still the database API layer.
- Background work currently exists as cron-style API endpoints, not a dedicated worker process:
  - `/api/automation-v2/process-due`
  - `/api/tasks/process-reminders`
  - `/api/reports/rollups/process-jobs`
  - `/api/reports/schedules/process-due`
- Supabase Storage is used at least for partner invoice PDFs through migration `0005_partner_invoice.sql`.

## Recommended Architecture

For the first VPS migration, use a Docker Compose stack that self-hosts the Supabase-compatible services the app already expects.

This avoids a risky full rewrite of the data layer before the demo/product is stable.

### Services

1. `web`
   - Next.js production app.
   - Serves both frontend and existing Next API routes.
   - Runs `npm run build` at image build time and `npm run start` at runtime.

2. `worker`
   - Dedicated Node worker container.
   - Runs scheduled jobs by calling internal backend endpoints on a cadence.
   - Handles automation due processing, task reminders, report rollups, report schedule delivery/outbox, and future scoring retraining.

3. `postgres`
   - VPS-hosted Postgres database.
   - Owns all CRM tables, RLS policies, storage metadata, and migrations.

4. `postgrest`
   - Supabase-compatible REST API over Postgres.
   - Required because the current app uses `supabase-js`.

5. `storage`
   - Supabase Storage API-compatible service.
   - Stores invoice PDFs and future uploaded assets.
   - Backed by a mounted VPS volume or S3-compatible storage such as MinIO.

6. `auth`
   - Supabase Auth service can be included for compatibility.
   - The CRM currently uses custom auth, so this can be minimal, but keeping it avoids surprises from `@supabase/ssr` calls.

7. `kong` or `nginx`
   - Public/internal routing layer for Supabase-compatible endpoints.
   - Exposes a stable `SUPABASE_URL` equivalent to the Next app.

8. `redis`
   - Optional in the first cut if the worker only calls cron endpoints.
   - Recommended for the second cut so background jobs can move to queue-based execution.

9. `nginx` or `caddy`
   - Public reverse proxy.
   - Terminates TLS.
   - Routes:
     - `https://crm.example.com` → `web`
     - `https://supabase.crm.example.com` → Supabase-compatible API gateway, if exposed publicly

## Why Not Plain Postgres Immediately?

The app does not currently use `pg`, Prisma, Drizzle, or direct SQL for runtime data access. Most server modules call:

```ts
createSupabaseAdminClient().from("Table").select(...)
```

If we move to plain Postgres only, we must rewrite the data access layer across the CRM. That is possible, but it is a larger project and more likely to introduce regressions in leads, opportunities, reports, payouts, gamification, tasks, smart views, and scoring.

Recommended path:

1. **Phase 1:** VPS-host the Supabase-compatible stack and keep app behavior stable.
2. **Phase 2:** Gradually introduce a direct Postgres repository layer for server-side code.
3. **Phase 3:** Retire Supabase compatibility services if desired.

## Target Environment Variables

### `web`

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://crm.example.com
JWT_SECRET=strong-random-secret
AUTH_DEBUG=false

NEXT_PUBLIC_SUPABASE_URL=https://supabase.crm.example.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=generated-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=generated-local-service-role-key

AUTOMATION_CRON_SECRET=strong-random-secret
TASKS_CRON_SECRET=strong-random-secret
REPORTING_CRON_SECRET=strong-random-secret
```

### `worker`

```env
INTERNAL_APP_URL=http://web:3000
AUTOMATION_CRON_SECRET=same-as-web
TASKS_CRON_SECRET=same-as-web
REPORTING_CRON_SECRET=same-as-web
WORKER_INTERVAL_SECONDS=60
```

### `postgres`

```env
POSTGRES_DB=crm
POSTGRES_USER=postgres
POSTGRES_PASSWORD=strong-random-password
POSTGRES_PORT=5432
```

## Migration Phases

### Phase 0 — VPS Prep

- Provision VPS with Ubuntu LTS.
- Install Docker and Docker Compose plugin.
- Configure firewall:
  - allow `22` only from trusted IPs
  - allow `80` and `443`
  - do not expose Postgres publicly
- Create deployment user.
- Create directories:
  - `/opt/crm/app`
  - `/opt/crm/postgres`
  - `/opt/crm/storage`
  - `/opt/crm/backups`
  - `/opt/crm/logs`
- Set up automatic security updates.

### Phase 1 — Add VPS Deployment Artifacts

Create repo-managed deployment files:

- `deploy/vps/docker-compose.yml`
- `deploy/vps/.env.example`
- `deploy/vps/nginx.conf` or `Caddyfile`
- `deploy/vps/worker/cron-worker.mjs`
- `deploy/vps/scripts/backup-postgres.sh`
- `deploy/vps/scripts/restore-postgres.sh`
- `deploy/vps/scripts/healthcheck.sh`
- `deploy/vps/README.md`

The Compose stack should include:

- `web`
- `worker`
- `postgres`
- Supabase-compatible REST/Auth/Storage services
- reverse proxy

### Phase 2 — Database Bootstrap

- Export schema and data from current Supabase project.
- Apply CRM migrations in order:
  - existing base schema from `SCHEMA.md` or a fresh schema export
  - `migrations/0001_*.sql` through `0014_predictive_scoring.sql`
- Confirm important schema repairs are applied:
  - `RecordScore_source_check` accepts `PREDICTIVE_SCORING`
  - storage bucket/policies for invoice PDFs exist
  - all RLS policies are present
- Re-export schema after import and compare with `SCHEMA.md`.

### Phase 3 — Data Migration From Managed Supabase

- Freeze writes during cutover window.
- Export managed Supabase Postgres:
  - schema
  - table data
  - roles/policies/functions/triggers
  - storage metadata
- Export Supabase Storage objects:
  - partner invoice PDFs
  - future uploaded assets, if any
- Import into VPS Postgres and storage volume.
- Run post-import verification:
  - tenant count
  - user count
  - lead/opportunity/activity/task counts
  - partner payout/invoice counts
  - report rollup counts
  - scoring rows
  - storage object count

### Phase 4 — Worker Extraction

Implement a dedicated worker container first as a reliable scheduler around existing APIs.

Worker should call:

- `POST /api/automation-v2/process-due`
- `POST /api/tasks/process-reminders`
- `POST /api/reports/rollups/process-jobs`
- `POST /api/reports/schedules/process-due`

Each call must pass the correct cron secret header.

Later, worker can be upgraded to direct function execution or queue processing once the repository layer is direct-Postgres.

### Phase 5 — App Configuration Switch

- Point `NEXT_PUBLIC_SUPABASE_URL` to the VPS Supabase-compatible gateway.
- Point frontend domain to VPS reverse proxy.
- Confirm cookies and auth work under the production domain.
- Confirm all route handlers use server-side service role key only from server env.
- Confirm no service-role key is exposed to browser bundles.

### Phase 6 — Verification Checklist

Run before DNS cutover:

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- Login as:
  - platform admin
  - tenant admin
  - manager
  - rep
  - partner
- Verify core modules:
  - dashboard cards
  - leads
  - opportunities by type and stage
  - activities
  - tasks
  - views
  - reports/inbuilt reports
  - report schedules
  - forms
  - automations
  - partners
  - payouts
  - gamification
  - predictive scoring recompute
- Verify file storage:
  - generate partner invoice PDF
  - download invoice PDF
- Verify workers:
  - automation due processor runs
  - task reminder processor runs
  - report rollup processor runs
  - report schedule processor creates delivery rows

### Phase 7 — DNS Cutover

- Lower DNS TTL before cutover.
- Put Vercel app in maintenance/freeze mode if possible.
- Run final DB export/import.
- Start VPS stack.
- Run smoke tests.
- Update DNS:
  - `crm.example.com` → VPS
  - optional `supabase.crm.example.com` → VPS
- Monitor logs for at least 2 hours.

### Phase 8 — Backup and Operations

- Nightly Postgres dumps to `/opt/crm/backups`.
- Retain:
  - hourly backups for 24 hours
  - daily backups for 14 days
  - weekly backups for 8 weeks
- Add backup upload to external object storage.
- Add restore rehearsal checklist.
- Add log rotation.
- Add uptime checks for:
  - public web app
  - internal worker heartbeat
  - Postgres health
  - storage health
- Add disk alerts for:
  - Postgres volume
  - storage volume
  - Docker logs

## Rollback Plan

During cutover:

- Keep Vercel + managed Supabase untouched until VPS verification passes.
- If VPS verification fails:
  - revert DNS to Vercel
  - keep managed Supabase as source of truth
  - discard VPS imported data or rerun import after fixing
- If failure occurs after DNS cutover:
  - freeze writes immediately
  - compare latest writes on VPS
  - either migrate delta back to Supabase or keep VPS and hotfix, depending on severity

## Risks

- Supabase compatibility is the biggest risk. The current app expects Supabase REST/storage behavior, not just Postgres.
- RLS behavior may differ if service-role claims/JWT settings are misconfigured.
- Supabase Storage policies and bucket metadata must migrate, not only table data.
- Existing cron endpoints are request-driven; without a worker or external cron, due automations/reminders/reports will not run.
- Large report/scoring recomputes can overload a small VPS unless worker cadence and Postgres resources are tuned.

## Proposed Implementation After Approval

After approval, implement in this order:

1. Add `deploy/vps/` deployment docs and environment templates.
2. Add Dockerfile for the active `crm/` Next app if needed.
3. Add Compose stack for `web`, `worker`, `postgres`, Supabase-compatible API/storage, and reverse proxy.
4. Add worker script that triggers existing due-processing endpoints.
5. Add backup/restore scripts.
6. Add healthcheck script.
7. Add deployment README with exact VPS commands.
8. Run local validation where possible:
   - `npm run build`
   - `npx tsc --noEmit`
   - Docker Compose config validation

## Approval Needed

Please approve one of these paths:

1. **Recommended:** VPS with self-hosted Supabase-compatible services first, then direct Postgres rewrite later.
2. **Larger rewrite:** Convert app server code from `supabase-js` to direct Postgres now, then deploy plain Postgres + Next + worker.

I recommend option 1 for speed and lower regression risk.
