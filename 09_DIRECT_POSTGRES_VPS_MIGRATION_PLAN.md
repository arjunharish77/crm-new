# Direct Postgres VPS Migration Plan — CRM

This plan migrates the CRM from Vercel + managed Supabase to a VPS-hosted stack using direct Postgres access instead of self-hosted Supabase.

## Execution Status

### Completed — Batch 1 and Batch 2 Foundation

- [x] Installed direct Postgres dependency: `pg`.
- [x] Installed TypeScript definitions: `@types/pg`.
- [x] Added TypeScript DB foundation under `src/lib/db/`:
  - pool management
  - query/queryOne/execute helpers
  - transaction helper with tenant/user/session settings
  - advisory lock helper
  - SQL identifier and pagination safety helpers
  - data-access mode helper
- [x] Added local native Postgres scripts:
  - `npm run db:setup:local`
  - `npm run db:migrate:local`
  - `npm run db:seed:local` placeholder for Batch 3
- [x] Added migration tracking table logic via `SchemaMigration`.
- [x] Added `.env.example` entries for local native Postgres and dual-path migration mode.
- [x] Added Supabase touchpoint inventory at `docs/DIRECT_POSTGRES_SUPABASE_INVENTORY.md`.
- [x] Added DB foundation tests at `tests/db-foundation.test.ts`.
- [x] Verified `npm test -- db-foundation.test.ts`.
- [x] Verified `npm test -- commission-ledger.test.ts` after preserving admin payout visibility behavior.
- [x] Verified full `npm test`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified `npm run build`.

Current runtime behavior is unchanged: the app still runs on the existing Supabase path until individual modules are migrated to direct Postgres and `DATA_ACCESS_MODE=postgres` is enabled for those paths.

### Started — Batch 3 Local Data Bootstrap

- [x] Added Supabase direct-Postgres export helper: `npm run db:export:supabase`.
- [x] Added local data import helper: `npm run db:import:local-data`.
- [x] Adapted the rich demo seed script to support `DATA_ACCESS_MODE=postgres`.
- [x] Wired `npm run db:seed:local` to seed through direct Postgres mode.
- [x] Added seed-client unit coverage for safe quoting, parameterized filters, and upsert SQL.
- [x] Verified `npm test -- seed-client.test.ts db-foundation.test.ts`.
- [x] Verified full `npm test`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified `npm run build`.
- [ ] Run local bootstrap against native Postgres after the Supabase direct DB URL/base schema dump is available:
  - [x] `npm run db:setup:local`
  - `npm run db:export:supabase`
  - `BASE_SCHEMA_SQL_PATH=./db-dumps/supabase-schema.sql npm run db:migrate:local`
  - `npm run db:import:local-data`
  - `npm run db:seed:local`
- [x] Confirmed `npm run db:migrate:local` stops with a clear base-schema checkpoint when the local database has no base CRM schema.
- [ ] Confirm local login and demo counts against direct Postgres.

### Started — Batch 4 Auth, Users, Roles, Permissions

- [x] Added direct Postgres repository for auth/admin foundation at `src/lib/repositories/auth-admin-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - login user lookup
  - active platform admin lookup
  - current-user hydration
  - bootstrap platform admin
  - tenant users
  - roles
  - permission templates
  - platform tenant listing/config/users
  - tenant creation/status/feature flags
  - platform impersonation token creation
- [x] Added direct Postgres repository for tenant admin module foundation at `src/lib/repositories/admin-modules-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - teams
  - team members
  - sales groups
  - sales group members
  - general settings
- [x] Verified `npm test -- auth.test.ts tenant-isolation.test.ts seed-client.test.ts db-foundation.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Started — Batch 5 Leads Foundation

- [x] Added direct Postgres repository for lead foundation at `src/lib/repositories/leads-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - lead listing with pagination
  - lead detail lookup
  - lead create
  - lead update
  - lead bulk delete
  - owner-scoped record access
  - whitelisted lead filters
  - predictive score attachment/filter short-circuit
  - audit log inserts for create/update
- [x] Added focused lead repository tests at `tests/leads-postgres.test.ts`.
- [x] Verified `npm test -- leads-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Distribution engine and automation triggers remain on the Supabase path until their dedicated migration batches.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Started — Batch 6 Opportunities

- [x] Added direct Postgres repository for opportunity foundation at `src/lib/repositories/opportunities-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - opportunity type/stage listing
  - opportunity list by type
  - opportunity detail lookup
  - opportunity create
  - opportunity update
  - opportunity delete
  - opportunity stage history
  - opportunity stats
  - owner-scoped record access
  - whitelisted opportunity filters
  - predictive score attachment/filter short-circuit
  - audit log inserts and stage history inserts
- [x] Added focused opportunity repository tests at `tests/opportunities-postgres.test.ts`.
- [x] Verified `npm test -- opportunities-postgres.test.ts leads-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Distribution engine, automations, and scoring refresh side effects remain on the Supabase path until their dedicated migration batches.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Started — Batch 7 Activities and Tasks

- [x] Added direct Postgres repository for activities at `src/lib/repositories/activities-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - activity type listing and core seed types
  - activity listing with relations
  - activity create
  - activity update
  - activity stats
  - whitelisted activity filters
  - audit log inserts for create/update
- [x] Added direct Postgres repository for tasks at `src/lib/repositories/tasks-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - task listing
  - task detail lookup
  - task create
  - task update
  - task delete
  - due reminder processing
  - owner-scoped record access
  - task relation hydration
  - audit log inserts for create/update/delete
- [x] Added focused repository tests at `tests/activities-postgres.test.ts` and `tests/tasks-postgres.test.ts`.
- [x] Verified `npm test -- activities-postgres.test.ts tasks-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Automation emission and scoring refresh side effects remain on the Supabase path until worker/automation/scoring migration batches.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Completed — Batch 8 Views

- [x] Added direct Postgres repository for saved/smart Views at `src/lib/repositories/views-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - standalone Views listing via `CustomReport`
  - module-specific view lookup
  - multi-tab view matching
  - private/shared/default/pinned config serialization
  - user, team, sales-group, and role visibility targeting
  - create/update/clone/delete
  - clearing competing default views in the same tenant/module
- [x] Added focused repository tests at `tests/views-postgres.test.ts`.
- [x] Verified `npm test -- views-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Completed — Batch 9 Forms

- [x] Added direct Postgres repository for Forms at `src/lib/repositories/forms-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - forms list/detail
  - form builder create/update/delete persistence
  - CRM placement availability rules
  - user/team/sales-group/role visibility checks
  - public form rendering
  - public form submission
  - lead creation/update from submitted form data
  - opportunity creation/update from submitted form data
  - activity creation/update from submitted form data
  - form stats
  - form submissions list
  - CSV export
- [x] Added focused repository tests at `tests/forms-postgres.test.ts`.
- [x] Verified `npm test -- forms-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Public form distribution side effects remain deferred until the distribution/worker migration batch.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Completed — Batch 10 Automations and Queue Processing

- [x] Added direct Postgres repository for Automation V2 at `src/lib/repositories/automations-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - automation list/detail
  - automation create/update/delete
  - execution history
  - test execution
  - live trigger matching
  - workflow branch evaluation
  - delay/wait queue scheduling
  - due queue processing
  - advisory locking per queued automation job
  - execution log persistence
- [x] Implemented direct Postgres action support for:
  - update lead/opportunity/activity fields
  - clear field
  - create activity
  - assign owner
  - change opportunity stage
  - add opportunity
  - tag/star/remove lead tag
  - increment lead score
  - create notification
  - webhook callback
- [x] Added focused repository tests at `tests/automations-postgres.test.ts`.
- [x] Verified `npm test -- automations-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Distribution, commission, gamification, and badge automation actions remain deferred until their module migration batches.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Completed — Batch 11 Reports and Dashboards

- [x] Added direct Postgres repository for dashboard/custom report persistence at `src/lib/repositories/reports-dashboards-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - dashboard widget list/create/update/delete/detail
  - dashboard widget data lookup through already-migrated lead/opportunity/activity/report helpers
  - custom report list/create/update/delete
  - custom report export
  - structured custom report query execution
- [x] Added direct Postgres dataset loading to the structured report query engine in `src/lib/server/reporting-query.ts`.
- [x] Preserved the safe report builder approach: structured JSON definitions, fixed object/field catalog validation, fixed table maps, and parameterized tenant/owner filters.
- [x] Added direct Postgres repository for report schedules at `src/lib/repositories/report-schedules-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - schedule list/create/update/delete
  - due schedule processing
  - scheduled report rendering
  - durable `ReportEmailDelivery` rows
- [x] Added direct Postgres repository for report rollups at `src/lib/repositories/report-rollups-postgres.ts`.
- [x] Wired `DATA_ACCESS_MODE=postgres` path for:
  - manual refresh requests
  - refresh state upsert
  - rollup computation persistence
  - pending refresh job processing
- [x] Wired direct Postgres helper lookups inside inbuilt reports for:
  - lead campaign custom-field lookup
  - reassignment/audit events
  - commission ledger, payout, invoice, payout cycle, partner, and user inputs
  - opportunity stage history
  - required lead fields
  - tenant custom-field values
- [x] Added focused repository/query tests at `tests/reports-dashboards-postgres.test.ts`.
- [x] Added focused report infrastructure tests at `tests/report-infra-postgres.test.ts`.
- [x] Added focused inbuilt-report helper tests at `tests/inbuilt-reports-postgres.test.ts`.
- [x] Verified `npm test -- reports-dashboards-postgres.test.ts`.
- [x] Verified `npm test -- report-infra-postgres.test.ts`.
- [x] Verified `npm test -- inbuilt-reports-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

## Short Answers

### Are we changing the existing `crm/` folder or creating a new folder?

Use the existing `crm/` folder as the product app.

Do not create a new parallel CRM app. That would duplicate UI, routes, auth, permissions, reports, payout logic, gamification, tasks, views, and scoring. The safer engineering path is to refactor the existing app in place behind a database adapter/repository layer.

New folders should be supporting infrastructure only:

- `crm/src/lib/db/` for Postgres connection, query helpers, transactions, tenant context, and repository utilities.
- `crm/src/lib/repositories/` for module-by-module direct Postgres repositories.
- `crm/src/worker/` for background worker entrypoints.
- `crm/deploy/vps/` for Docker Compose, reverse proxy config, env templates, backup scripts, and deployment docs.

### Is Docker required?

Not strictly, but I strongly recommend Docker for VPS production.

You already have Postgres installed locally, so local development should run without Docker:

```bash
cd crm
npm run dev
```

The local app should point to your native local Postgres through `DATABASE_URL`.

On the VPS, use Docker Compose. You can run Node + Postgres directly with `systemd`, but Docker gives cleaner deployments, isolated services, easier worker management, repeatable backups, and easier rollback. For a CRM with frontend, backend, worker, database, reverse proxy, and future Redis/queues, Docker Compose is the practical option.

Recommendation:

- **Local:** native Node + native Postgres, no Docker required.
- **VPS production:** Docker Compose.
- Keep `npm run dev`, `npm run build`, and `npm run start` working outside Docker.

## Local Development Target

Local development should use the existing `crm/` app and your installed Postgres.

### Local Services

- Next.js app: started manually with `npm run dev`.
- Postgres: your native local Postgres service.
- Worker: started manually with `npm run worker` after the worker entrypoint is added.
- Redis: optional initially. If worker queues are added, either install Redis locally or allow the worker to run in simple interval mode without Redis for development.

### Local Environment

Use `crm/.env.local` or `crm/.env`:

```env
NODE_ENV=development
AUTH_DEBUG=true
JWT_SECRET=local-dev-secret-change-me

DATABASE_URL=postgresql://crm_app:local_password@localhost:5432/crm_dev
DIRECT_DATABASE_URL=postgresql://postgres:local_postgres_password@localhost:5432/crm_dev
DATABASE_SSL=false

FILE_STORAGE_DRIVER=local
FILE_STORAGE_ROOT=./storage

AUTOMATION_CRON_SECRET=local-automation-secret
TASKS_CRON_SECRET=local-tasks-secret
REPORTING_CRON_SECRET=local-reporting-secret
COMMUNICATIONS_CRON_SECRET=local-communications-secret
COMMUNICATIONS_WEBHOOK_SECRET=local-communications-webhook-secret
```

### Local Database Setup

Use scripts rather than Docker:

```bash
createdb crm_dev
psql crm_dev -f SCHEMA.md-derived-schema.sql
psql crm_dev -f migrations/0001_partner_profile.sql
psql crm_dev -f migrations/0002_commission_rule.sql
...
psql crm_dev -f migrations/0014_predictive_scoring.sql
```

As part of implementation, add proper local scripts so this becomes:

```bash
npm run db:setup:local
npm run db:export:supabase
BASE_SCHEMA_SQL_PATH=./db-dumps/supabase-schema.sql npm run db:migrate:local
npm run db:import:local-data
npm run db:seed:local
npm run db:backfill:invoice-files
```

These scripts use native `pg_dump`, `psql`, and Postgres. They do not require Docker. `db:export:supabase` needs `SUPABASE_DATABASE_URL`, which is Supabase's direct database connection string, not `NEXT_PUBLIC_SUPABASE_URL`.

## Target Architecture

### Runtime Services

1. `web`
   - Existing Next.js app from `crm/`.
   - Serves frontend pages and API routes.
   - Uses direct Postgres repositories on the server side.
   - Runs on internal port `3000`.

2. `worker`
   - Dedicated Node process from the same `crm/` codebase.
   - Runs scheduled/background jobs directly, not by relying on Vercel cron.
   - Handles:
     - automation due processing
     - task reminders
     - report rollup jobs
     - report schedule delivery/outbox
     - predictive scoring recompute/retraining
     - future marketing communications queues

3. `postgres`
   - Primary CRM database.
   - Stores all current CRM tables.
   - RLS can be retained for defense-in-depth, but app authorization should not depend only on RLS because server code will use a controlled app DB role.

4. `redis`
   - Recommended for durable background queues, locks, and rate limits.
   - Required once marketing communications, scoring retraining, and high-volume automations become real workloads.

5. `reverse-proxy`
   - Caddy or Nginx.
   - TLS termination.
   - Routes `https://crm.example.com` to `web`.

6. `file-storage`
   - Replace Supabase Storage.
   - Initial option: local mounted volume at `/data/crm-storage`.
   - Better production option: S3-compatible storage, such as MinIO on VPS or managed S3/R2.
   - Used for partner invoice PDFs and future uploads.

### VPS Production Components Checklist

Everything below must be accounted for in the VPS deployment. The current app has 165 Next API route files, server-rendered pages, cron-style endpoints, SSE notifications, CSV/PDF exports, public form routes, inbound integration endpoints, and invoice PDF storage.

Required:

- **Node runtime:** Node 20 LTS or newer compatible with Next.js 16 and React 19.
- **Package manager:** npm with lockfile install via `npm ci`.
- **Next standalone output:** `next.config.ts` already uses `output: "standalone"`; production Docker should copy `.next/standalone`, `.next/static`, and `public` if present.
- **Postgres:** private network only, not exposed to the internet.
- **Connection pooling:** configure app pool size and Postgres `max_connections`; do not let web + worker exhaust DB connections.
- **Worker process:** separate from web, with singleton/advisory locks for scheduled jobs.
- **Redis:** include for future queue/rate-limit/session scalability; simple worker mode may run without Redis during the first direct-Postgres cut, but VPS should reserve a Redis service.
- **Reverse proxy:** Caddy or Nginx with TLS, gzip/brotli, body size limits, request timeouts, and SSE-safe buffering settings.
- **File storage:** local volume or S3-compatible storage replacing Supabase Storage.
- **Backups:** database backups, file storage backups, encrypted offsite copy, and restore rehearsal.
- **Secrets:** production `.env`, secret generation, restricted permissions, and rotation plan.
- **Logs:** web logs, worker logs, proxy logs, Postgres logs, and log rotation.
- **Monitoring:** HTTP health, worker heartbeat, disk usage, memory/CPU, DB connections, backup success, failed job count.
- **Firewall:** expose only SSH, HTTP, and HTTPS publicly.
- **Cutover and rollback:** DNS TTL, maintenance/freeze, final import, smoke tests, rollback window.

Not required locally:

- Docker
- reverse proxy
- production TLS
- VPS backup scripts
- containerized Postgres

Local should continue to use native Postgres and normal `npm` commands.

### VPS Sizing Guidance

For a demo/small production CRM:

- 2 vCPU
- 4 GB RAM minimum
- 80 GB SSD minimum
- daily offsite backups

For realistic CRM usage with reports, scoring, automations, and partner payout workloads:

- 4 vCPU
- 8 GB RAM minimum
- 160 GB SSD minimum
- separate backup/object storage

Scale up when:

- report/dashboard pages are slow under real tenant data
- scoring recompute competes with user traffic
- worker jobs lag behind schedule
- Postgres CPU or I/O remains high
- disk usage exceeds 60%

### Production Environment Matrix

Direct Postgres production should eventually remove Supabase runtime env vars. During migration, both Supabase and Postgres env vars may coexist only while `DATA_ACCESS_MODE` still supports both paths.

Required for direct-Postgres production:

```env
NODE_ENV=production
AUTH_DEBUG=false
APP_URL=https://crm.example.com
NEXT_PUBLIC_APP_URL=https://crm.example.com

JWT_SECRET=strong-random-secret
COOKIE_SECURE=true

DATABASE_URL=postgresql://crm_app:password@postgres:5432/crm
DIRECT_DATABASE_URL=postgresql://crm_owner:password@postgres:5432/crm
DATABASE_SSL=false
DATABASE_POOL_MAX=20
DATABASE_STATEMENT_TIMEOUT_MS=30000
DATABASE_IDLE_TIMEOUT_MS=30000

DATA_ACCESS_MODE=postgres

FILE_STORAGE_DRIVER=local
FILE_STORAGE_ROOT=/data/crm-storage
# or, if using S3-compatible storage:
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=true

AUTOMATION_CRON_SECRET=strong-random-secret
TASKS_CRON_SECRET=strong-random-secret
REPORTING_CRON_SECRET=strong-random-secret
COMMUNICATIONS_CRON_SECRET=strong-random-secret
COMMUNICATIONS_WEBHOOK_SECRET=strong-random-secret

APP_INTERNAL_URL=http://web:3000
WORKER_APP_URL=http://web:3000
WORKER_INTERVAL_MS=60000

LOG_LEVEL=info
```

Supabase production runtime env:

- None. Direct Postgres production should not require Supabase URL, anon key, or service-role key.
- `SUPABASE_DATABASE_URL` is export-only and should be used only for one-time migration dumps from the old managed Supabase database.

Seed/admin script env:

```env
PLATFORM_ADMIN_EMAIL=
PLATFORM_ADMIN_PASSWORD=
PLATFORM_ADMIN_NAME=
DEMO_TENANT_ID=
DEMO_ADMIN_USER_ID=
DEMO_LEAD_COUNT=
```

Immediate communication connector env:

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
SMTP_SECURE=true
SMTP_REPLY_TO=

WHATSAPP_PROVIDER=
WHATSAPP_API_BASE_URL=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_WEBHOOK_SECRET=

SMS_PROVIDER=
SMS_API_BASE_URL=
SMS_API_KEY=
SMS_SENDER_ID=
SMS_WEBHOOK_SECRET=

TELEPHONY_PROVIDER=
WEBHOOK_SIGNING_SECRET=
```

### Reverse Proxy Requirements

The proxy must support:

- TLS certificate automation.
- Web app routing to `web:3000`.
- Large enough request body for future imports/uploads.
- Long enough response timeout for exports/reports, but not unlimited.
- SSE endpoint compatibility for `/api/notifications/sse`.
- Static asset caching for `/_next/static/*`.
- No buffering for SSE.
- Security headers.

Suggested initial limits:

```text
max request body: 25 MB
regular proxy timeout: 60 seconds
long-running API timeout: 180 seconds for exports/recompute/report refresh endpoints
SSE buffering: off
```

Endpoints needing special attention:

- `/api/notifications/sse`
- `/api/forms/[id]/export`
- `/api/reports/custom/[id]/export`
- `/api/payout-cycles/[id]/finance-export`
- `/api/partner-invoices/[id]/pdf`
- `/api/lead-scoring/self-learning/recompute`
- `/api/reports/rollups/process-jobs`
- `/api/reports/schedules/process-due`

### Database Operations Requirements

Postgres must include:

- app runtime role `crm_app`
- migration/admin role `crm_owner`
- no app use of Postgres superuser
- required extensions from the current schema/export
- all tables, constraints, indexes, triggers, functions, and RLS policies
- `SchemaMigration` table for local/VPS migration tracking
- daily backup job
- restore rehearsal
- vacuum/analyze expectations
- connection count monitoring

Minimum indexes to verify after import:

- tenant scoping indexes on major tables
- lead/opportunity owner/status/source indexes
- task owner/status/due indexes
- report rollup indexes
- scoring indexes, especially `RecordScore_tenant_band_idx`
- payout/gamification ledger indexes
- custom field value lookup indexes

### Worker Jobs Required

The worker must cover current cron-style functionality:

- automation due processing
- task reminder processing
- report rollup job processing
- report schedule processing
- predictive scoring recompute jobs

The worker must also provide:

- heartbeat row/table
- advisory lock per job type
- retry policy
- failure log
- max runtime guard
- graceful shutdown handling
- single-run mode for debugging

Current HTTP cron endpoints can remain during transition, but VPS production should not depend on a browser session or Vercel cron.

### Storage Requirements

Current confirmed file dependency:

- partner invoice PDF upload/download currently goes through Supabase Storage.

Direct Postgres/VPS replacement must provide:

- private file writes
- authenticated downloads
- stable stored path
- MIME type tracking
- overwrite/upsert behavior where invoice generation expects it
- backup of file volume/bucket
- migration from existing Supabase Storage objects

Local development:

```env
FILE_STORAGE_DRIVER=local
FILE_STORAGE_ROOT=./storage
```

VPS local-volume option:

```env
FILE_STORAGE_DRIVER=local
FILE_STORAGE_ROOT=/data/crm-storage
```

### Integration and Public Endpoint Requirements

The VPS proxy/firewall must allow public access to:

- login
- public forms `/f/[slug]` and `/public-form/[id]`
- tracking endpoints
- inbound lead webhook endpoints
- telephony webhook endpoints
- WhatsApp delivery/reply webhooks
- SMS delivery/reply webhooks
- report/form export downloads for authenticated users
- invoice PDF downloads for authenticated users

Protect:

- cron/worker endpoints with secrets
- platform admin routes with auth
- internal worker endpoints from public access if possible
- Postgres and Redis from all public access

### Communication Connector Requirements

SMTP, WhatsApp, and SMS are immediate production requirements, not optional/future work.

The implementation should be connector-based so providers can be changed without rewriting campaigns, automations, reports, or lead timelines.

Required connector layer:

```text
src/lib/communications/
  channels.ts
  provider-registry.ts
  templates.ts
  tokens.ts
  consent.ts
  outbox.ts
  providers/
    smtp-provider.ts
    whatsapp-http-provider.ts
    sms-http-provider.ts
    mock-provider.ts
```

Required database tables:

- `CommunicationProviderConfig`
- `CommunicationSenderIdentity`
- `CommunicationTemplate`
- `CommunicationConsent`
- `CommunicationSuppression`
- `CommunicationOutbox`
- `CommunicationDeliveryEvent`
- `CommunicationInboundMessage`
- `CommunicationCampaign`
- `CommunicationCampaignStep`
- `CommunicationAudienceSnapshot`

Provider config should support:

- `EMAIL_SMTP`
- `WHATSAPP_HTTP`
- `SMS_HTTP`

Do not hard-code one vendor at the CRM business-logic layer. Use generic HTTP connector config for WhatsApp/SMS:

- base URL
- auth type
- API key/bearer token
- sender/phone number id
- message template mapping
- delivery webhook secret
- provider status mapping
- rate limits
- retry policy

SMTP connector must support:

- host
- port
- secure/TLS mode
- username/password
- default from address
- reply-to
- per-tenant sender identity
- test-send action

Communication worker must handle:

- queued email sends
- queued WhatsApp sends
- queued SMS sends
- provider retries with backoff
- provider rate limits
- quiet hours
- suppression/opt-out checks
- delivery event ingestion
- bounced/failed status updates
- report schedule email delivery, replacing current `ReportEmailDelivery` PENDING-only behavior

Public webhook endpoints needed:

- `POST /api/integrations/communications/whatsapp/webhook`
- `GET /api/integrations/communications/whatsapp/webhook` for provider verification when needed
- `POST /api/integrations/communications/sms/webhook`
- `POST /api/integrations/communications/email/webhook` for bounce/open/click providers if configured later

Admin UI needed:

- Settings -> Integrations -> Communications
- provider setup tabs for Email, WhatsApp, SMS
- sender identities
- consent/suppression settings
- template library
- test send
- provider event/status mapping
- rate limit and quiet-hour settings

Security requirements:

- encrypt provider secrets at rest where possible
- never expose provider tokens to the browser
- verify webhook signatures/secrets
- log request metadata, not full sensitive payloads
- keep opt-out/consent checks server-side
- support tenant-level provider isolation

Initial provider recommendation:

- Email: SMTP first, because it works with most transactional mail providers.
- WhatsApp: generic HTTP connector first, with provider-specific mapping through config.
- SMS: generic HTTP connector first, with provider-specific mapping through config.

This lets the CRM support providers such as SES/SendGrid/Mailgun for email and any HTTP-based WhatsApp/SMS aggregator without making the core CRM vendor-locked.

### Build and Release Requirements

Use immutable releases:

- build image from a specific git commit
- tag image with commit SHA
- keep previous image for rollback
- run migrations as an explicit release step, not hidden inside web startup
- start worker after migrations complete
- run health checks before DNS cutover

Production startup order:

1. Postgres healthy
2. Redis healthy
3. migrations applied
4. web started
5. worker started
6. proxy routes traffic

### Backup Requirements

Backups must include:

- Postgres dump
- file storage volume/bucket
- deployment env snapshot without printing secrets in logs
- migration state

Backup policy:

- hourly for 24 hours if feasible
- daily for 14 days
- weekly for 8 weeks
- encrypted offsite copy

Restore test:

- restore latest backup into a separate database
- run count checks
- login smoke test
- verify invoice PDF download

### Observability Requirements

Add or configure:

- `/api/health` endpoint
- worker heartbeat table/API
- process uptime
- DB connection count
- failed worker runs
- latest successful backup timestamp
- disk usage alert
- memory/CPU alert
- error log review

Recommended health endpoint response:

```json
{
  "status": "ok",
  "app": "crm",
  "version": "git-sha",
  "database": "ok",
  "workerHeartbeat": "ok",
  "storage": "ok"
}
```

### Security Requirements

Must do before production:

- rotate `JWT_SECRET`
- rotate cron secrets
- remove Supabase service-role key from production after migration
- restrict file permissions on env files
- disable password auth SSH if possible
- enable firewall
- use DB roles with least privilege
- ensure `AUTH_DEBUG=false`
- ensure cookies are secure in production
- protect backup files
- avoid logging secrets or full auth payloads
- define admin password reset/recovery process

### What Is Not Yet Accounted For In Code

These are gaps the migration should add:

- Direct Postgres DB layer.
- Local Postgres setup/migration scripts.
- Dedicated worker process.
- Storage adapter replacing Supabase Storage.
- Health endpoint.
- VPS Dockerfile/Compose/proxy files.
- Backup/restore scripts.
- Observability/heartbeat tables.
- Optional Redis queue implementation.

### External Inputs Needed Before VPS Implementation

These are not code issues, but they must be decided/provided before the VPS production setup can be completed:

- VPS provider and server size.
- Production domain name, for example `crm.example.com`.
- DNS access for cutover.
- Reverse proxy choice: Caddy or Nginx.
- File storage choice: VPS local volume, MinIO, Cloudflare R2, AWS S3, or another S3-compatible provider.
- Offsite backup destination.
- SMTP provider credentials for immediate report emails and communication sends.
- WhatsApp provider/aggregator credentials for immediate connector setup.
- SMS provider/aggregator credentials for immediate connector setup.
- Telephony provider credentials if call routing/click-to-call should be production-live at cutover.
- Final production platform admin email/password.
- Maintenance window for final Supabase-to-Postgres cutover.
- Decision on whether Postgres RLS remains enabled as defense-in-depth.

## Main Code Migration Strategy

Move from this:

```ts
createSupabaseAdminClient().from("Lead").select(...)
```

to this:

```ts
db.query(sql, params)
```

But do it through repositories, not scattered SQL in route handlers.

Recommended layers:

```text
src/lib/db/
  pool.ts
  query.ts
  transaction.ts
  tenant-context.ts
  pagination.ts

src/lib/repositories/
  leads.ts
  opportunities.ts
  activities.ts
  tasks.ts
  users.ts
  roles.ts
  permissions.ts
  reports.ts
  dashboards.ts
  forms.ts
  automations.ts
  partners.ts
  payouts.ts
  gamification.ts
  scoring.ts
  files.ts
```

Route handlers should call server services/repositories, not raw SQL directly.

## Database Access Standard

Use `pg` for the first migration.

Why:

- Lowest abstraction overhead.
- Best control for reports, dashboards, rollups, scoring, and complex filters.
- Easier to migrate existing Supabase-style queries module by module.
- Avoids locking the schema into ORM assumptions while the product is still changing fast.

Optional later:

- Add Drizzle for typed query composition after the repository layer stabilizes.
- Do not start with Prisma for this app; it may become awkward around dynamic custom fields, reporting joins, RLS/session settings, and JSONB-heavy modules.

## Tenant and Permission Model

Every repository method must require an authenticated app user context:

```ts
type AppUserContext = {
  id: string;
  tenantId: string;
  roleId?: string;
  role?: string;
  permissions: string[];
  teamIds: string[];
  salesGroupIds: string[];
  isPlatformAdmin?: boolean;
  isPartner?: boolean;
};
```

Rules:

- Never trust tenant id from request bodies.
- Always scope tenant-owned tables by `tenantId`.
- Preserve partner scoping:
  - partner users only see assigned/owned partner data
  - partner organization aggregation must continue for payouts
- Preserve manager/rep scoping:
  - owner, team, and sales group visibility rules must remain consistent
- Continue using existing auth cookie/JWT flow initially.

Optional defense-in-depth:

- Keep RLS policies in Postgres.
- Use `set_config('app.tenant_id', ...)` inside each transaction.
- Use a restricted app DB role rather than the Postgres superuser.

## Replacement for Supabase Storage

Current app uses Supabase Storage for invoice PDFs.

Direct Postgres migration needs a storage adapter:

```text
src/lib/storage/
  storage-provider.ts
  local-storage-provider.ts
  s3-storage-provider.ts
```

Initial implementation:

- Store files on a mounted VPS volume.
- Store file metadata in the existing or new `FileObject`/invoice fields.
- Serve downloads through authenticated Next API routes.

Production-preferred implementation:

- S3-compatible provider using MinIO/R2/S3.
- Private bucket.
- Generate signed download URLs or stream files through API routes.

## Migration Phases

### Phase 0 — Inventory and Safety Baseline

- Freeze this plan after approval.
- Run:
  - `rg "createSupabaseAdminClient|createClient|supabase\\.from|storage\\." src scripts`
  - `npm test`
  - `npx tsc --noEmit`
  - `npm run build`
- Create a module inventory of all Supabase access:
  - auth/session
  - leads
  - opportunities
  - activities
  - tasks
  - views
  - reports
  - dashboards
  - forms
  - automations
  - users/roles/permissions
  - partners/payouts/invoices
  - gamification
  - predictive scoring
  - storage
  - seed scripts

### Phase 1 — Add Direct Postgres Foundation

Add dependencies:

- `pg`
- `@types/pg`

Add env vars:

```env
DATABASE_URL=postgresql://crm_app:password@localhost:5432/crm_dev
DIRECT_DATABASE_URL=postgresql://postgres:password@localhost:5432/crm_dev
DATABASE_SSL=false
```

Add:

- `src/lib/db/pool.ts`
- `src/lib/db/query.ts`
- `src/lib/db/transaction.ts`
- `src/lib/db/tenant-context.ts`
- `src/lib/db/errors.ts`
- tests for query helpers and tenant scoping.

Add local scripts:

- `db:setup:local`
- `db:migrate:local`
- `db:seed:local`
- `worker`

These must run against your native Postgres install and must not require Docker.

Add VPS scripts separately under `deploy/vps/`; local scripts should not call Docker.

### Phase 2 — Database Bootstrap on VPS

- Export current Supabase schema/data.
- Restore into VPS Postgres.
- Apply all migrations in `crm/migrations/`.
- Create application DB role:
  - `crm_app`
  - no superuser
  - limited table/function privileges
- Confirm extensions required by current schema.
- Confirm triggers/functions/RLS policies were restored.
- Confirm indexes for reports/scoring/views are present.

### Phase 3 — Dual-Read/Dual-Path Adapter

Add a temporary database provider switch:

```env
DATA_ACCESS_MODE=supabase
# later:
DATA_ACCESS_MODE=postgres
```

Repository modules should expose the same service behavior while internally choosing:

- current Supabase implementation, or
- new direct Postgres implementation.

This lets us migrate one module at a time without breaking the whole CRM.

### Phase 4 — Migrate Core Auth and Admin Data

Direct Postgres first for:

- users
- roles
- permission templates
- teams
- sales groups
- settings/general
- platform admin tenant management

Reason: every other module depends on user/permission context.

Verification:

- login
- `/api/auth/me`
- platform admin access
- tenant admin access
- role guards
- partner role checks
- settings pages

### Phase 5 — Migrate CRM Core Modules

Migrate one module at a time:

1. Leads
2. Opportunities
3. Activities
4. Tasks
5. Lists
6. Views
7. Custom fields and type-specific fields

For each module:

- Replace Supabase calls with repository SQL.
- Preserve existing API response shape.
- Preserve permission scope.
- Preserve filters/sorts/pagination.
- Run:
  - module tests
  - `npx tsc --noEmit`
  - `npm run build`

### Phase 6 — Migrate Heavy/Analytical Modules

Migrate:

- reports
- inbuilt reports
- custom report query builder
- dashboard widgets
- report rollups
- predictive scoring

This is where direct Postgres should noticeably improve performance.

Improvements to include:

- SQL aggregates instead of repeated API-layer grouping.
- CTEs/window functions for reports.
- indexed score filters.
- direct rollup writes in transactions.
- chunked scoring recompute.

### Phase 7 — Migrate Business Modules

Migrate:

- partners
- partner organizations/logins
- commission rules
- commission ledger
- payouts
- invoices
- gamification rules/settings/points/badges/redemptions

Special care:

- payout aggregation across partner org logins
- append-only commission ledger
- anti-gaming idempotency
- partner visibility targeting
- invoice file storage replacement

### Phase 8 — Worker Implementation

Add `src/worker/index.ts`.

Worker responsibilities:

- schedule recurring jobs
- acquire Postgres advisory locks before each job
- process due automations
- process task reminders
- process report rollup jobs
- process report schedules
- process scoring recompute jobs
- write worker heartbeat rows

Recommended worker tables:

- `WorkerJob`
- `WorkerRun`
- `WorkerHeartbeat`

Keep existing HTTP cron endpoints during transition, but worker should eventually call internal service functions directly.

### Phase 9 — File Storage Replacement

Replace Supabase Storage calls with storage adapter.

Initial endpoints:

- upload file
- download file
- delete file
- generate signed/internal URL

Migrate existing invoice PDFs:

- export from Supabase Storage
- copy into VPS storage volume or S3 bucket
- update stored paths if necessary
- verify invoice download from partner/admin UI

### Phase 10 — Remove Supabase Runtime Dependency

After all server-side modules are direct Postgres:

- Remove `SUPABASE_SERVICE_ROLE_KEY` from production runtime.
- Remove server-side `@supabase/supabase-js` usage.
- Decide whether browser-side `@supabase/ssr` is still needed.
- If custom auth fully replaces Supabase auth, remove Supabase auth client usage too.
- Update `.env.example`.
- Update deployment docs.

Do not remove Supabase packages until `rg "supabase"` confirms no runtime use remains except migration docs/scripts.

### Phase 11 — VPS Deployment Artifacts

Add:

- `crm/Dockerfile`
- `crm/deploy/vps/docker-compose.yml`
- `crm/deploy/vps/.env.example`
- `crm/deploy/vps/Caddyfile` or `nginx.conf`
- `crm/deploy/vps/scripts/backup-postgres.sh`
- `crm/deploy/vps/scripts/restore-postgres.sh`
- `crm/deploy/vps/scripts/healthcheck.sh`
- `crm/deploy/vps/README.md`

Compose services:

- `web`
- `worker`
- `postgres`
- `redis`
- `reverse-proxy`
- optional `minio`

These files are for VPS production only. Local development remains native.

### Phase 12 — Cutover

- Keep Vercel + Supabase as source of truth until final cutover.
- Run a rehearsal import into VPS.
- Run full verification.
- Schedule maintenance window.
- Freeze writes.
- Final export from Supabase.
- Restore to VPS Postgres/storage.
- Start VPS stack.
- Run smoke tests.
- Switch DNS.
- Monitor logs and worker heartbeat.

## Docker Recommendation

Use Docker Compose for production.

Expected containers:

```text
crm-web
crm-worker
crm-postgres
crm-redis
crm-proxy
crm-minio optional
```

Docker is not required for local coding, but it should be the production deployment path.

## Effort Estimate

### Fast but risky direct conversion

- 2 to 3 weeks.
- Higher chance of regressions.
- Not recommended for a demo-critical build.

### Careful module-by-module conversion

- 4 to 6 weeks.
- Lower regression risk.
- Recommended.

### Full production-grade conversion with queues, storage migration, backup automation, and performance tuning

- 6 to 8 weeks.
- Best long-term path.

## Validation Standard

Every migrated module must pass:

- unit/integration tests for repository behavior
- API response shape comparison where practical
- permission-scope checks
- `npx tsc --noEmit`
- `npm run build`

Critical demo workflows must be manually verified:

- login
- dashboard
- leads
- opportunities
- activities
- tasks
- views
- reports
- automations
- forms
- partners
- payouts
- gamification
- scoring

## Detailed Execution Plan

This section is the implementation playbook after approval.

### Ground Rules

- Work inside the existing `crm/` app.
- Do not create a second CRM frontend/backend.
- Keep local development Docker-free.
- Use Docker only for VPS deployment artifacts.
- Keep the app runnable during the migration.
- Migrate one module or shared infrastructure slice at a time.
- Preserve current API response shapes unless there is an approved breaking change.
- Do not remove Supabase runtime code until the replacement path is verified.
- Every SQL query must be parameterized.
- No request handler should concatenate raw user input into SQL.

### Target Folder Layout

Add only these supporting folders/files:

```text
crm/
  src/
    lib/
      db/
        pool.ts
        query.ts
        transaction.ts
        tenant-context.ts
        pagination.ts
        sql.ts
        errors.ts
      repositories/
        auth-repository.ts
        users-repository.ts
        roles-repository.ts
        leads-repository.ts
        opportunities-repository.ts
        activities-repository.ts
        tasks-repository.ts
        views-repository.ts
        reports-repository.ts
        dashboard-repository.ts
        forms-repository.ts
        automations-repository.ts
        partners-repository.ts
        payouts-repository.ts
        gamification-repository.ts
        scoring-repository.ts
      storage/
        storage-provider.ts
        local-storage-provider.ts
        s3-storage-provider.ts
    worker/
      index.ts
      scheduler.ts
      jobs/
        automation-due.ts
        task-reminders.ts
        report-rollups.ts
        report-schedules.ts
        predictive-scoring.ts
  scripts/
    db-setup-local.js
    db-migrate-local.js
    db-seed-local.js
    db-export-supabase.sh
    db-import-local.sh
  deploy/
    vps/
      docker-compose.yml
      .env.example
      Caddyfile
      README.md
      scripts/
        backup-postgres.sh
        restore-postgres.sh
        healthcheck.sh
```

### Package Scripts To Add

Local, no Docker:

```json
{
  "db:setup:local": "node scripts/db-setup-local.js",
  "db:migrate:local": "node scripts/db-migrate-local.js",
  "db:seed:local": "node scripts/db-seed-local.js",
  "worker": "tsx src/worker/index.ts",
  "worker:build": "tsc -p tsconfig.worker.json"
}
```

Production/VPS scripts live under `deploy/vps/` and are invoked from the VPS shell, not from local development.

### Local Postgres Setup Details

Expected local database names:

```text
crm_dev
crm_test
```

Expected local roles:

```text
crm_owner  -- owns schema during setup/migrations
crm_app    -- app runtime role
crm_readonly optional
```

Local setup script should:

- Check `psql` is available.
- Check local Postgres is reachable.
- Create `crm_dev` if missing.
- Create `crm_app` role if missing.
- Apply base schema.
- Apply migrations in filename order.
- Grant required privileges to `crm_app`.
- Create local storage directory if missing.
- Print the correct `.env.local` values.

Local migration script should:

- Use `DIRECT_DATABASE_URL`.
- Maintain a simple `SchemaMigration` table if one does not already exist.
- Record migration filename, checksum, applied timestamp, and status.
- Refuse to rerun a changed migration unless explicitly forced.

### Database Helper Contract

`src/lib/db/query.ts` should expose:

```ts
query<T>(text: string, values?: unknown[]): Promise<T[]>
queryOne<T>(text: string, values?: unknown[]): Promise<T | null>
execute(text: string, values?: unknown[]): Promise<number>
```

`src/lib/db/transaction.ts` should expose:

```ts
withTransaction<T>(
  userContext: AppUserContext | null,
  fn: (tx: DbClient) => Promise<T>
): Promise<T>
```

Within transactions:

- Set `app.tenant_id` when a tenant user is present.
- Set `app.user_id`.
- Set `app.role_id` when available.
- Use advisory locks for worker jobs and financial/scoring recomputes.

### SQL Safety Rules

Allowed:

```ts
await query("select * from \"Lead\" where \"tenantId\" = $1 and \"id\" = $2", [tenantId, id]);
```

Not allowed:

```ts
await query(`select * from "Lead" where "id" = '${id}'`);
```

For dynamic filters:

- Whitelist table names.
- Whitelist column names.
- Whitelist operators.
- Values always go into parameter arrays.
- Sort fields must come from field metadata or static maps.
- Pagination must use numeric parsed `limit`/`offset` caps.

### Repository Contract

Each repository should:

- Accept `AppUserContext`.
- Own tenant scoping.
- Own permission scoping.
- Return the same shape the current API expects.
- Convert database rows to app types.
- Never expose raw DB row assumptions to React components.

Example shape:

```ts
export async function listLeads(
  user: AppUserContext,
  input: LeadListInput
): Promise<LeadListResult>
```

Repository tests should cover:

- tenant isolation
- partner visibility
- manager/team/sales-group scope
- filters
- sorting
- pagination
- empty results
- invalid inputs

### Supabase Replacement Map

| Current Supabase Use | Direct Postgres Replacement |
| --- | --- |
| `supabase.from(...).select()` | repository `query`/`queryOne` |
| `supabase.from(...).insert()` | repository insert with `returning *` |
| `supabase.from(...).update()` | repository update with tenant/id predicates |
| `supabase.from(...).delete()` | repository delete/soft delete with permission checks |
| `.eq`, `.in`, `.gte`, `.lte`, `.ilike` | filter builder with whitelisted fields/operators |
| `.range()` | limit/offset pagination helper |
| `.order()` | whitelisted sort helper |
| service-role bypass | `crm_app` DB role plus app permission checks |
| Supabase Storage upload/download | storage provider abstraction |
| Supabase auth session helpers | existing custom JWT/cookie auth, backed by Postgres repositories |

## Implementation Batches

### Batch 1 — Baseline Audit and Plan Lock

Deliverables:

- Supabase usage inventory document.
- Current API route/module map.
- Current schema/migration status note.
- Baseline test/build results.

Commands:

```bash
rg "createSupabaseAdminClient|createClient|supabase\\.from|storage\\." src scripts
npm test
npx tsc --noEmit
npm run build
```

Exit criteria:

- We know every Supabase runtime touchpoint.
- Build/test baseline is recorded.
- No code behavior changed yet.

### Batch 2 — Direct Postgres Foundation

Deliverables:

- `pg` dependency added.
- DB pool/query/transaction helpers.
- Tenant context helper.
- Migration runner for local Postgres.
- Local `.env.example` entries.
- Basic tests for DB helper behavior.

Exit criteria:

- `npm run db:setup:local` works with native Postgres.
- `npm run db:migrate:local` applies migrations.
- `npx tsc --noEmit` passes.
- `npm run build` passes.

### Batch 3 — Local Data Bootstrap

Deliverables:

- Import current Supabase schema/data into local Postgres.
- Adapt seed script to direct Postgres mode.
- Seed demo tenant locally.
- Add local file storage root.

Exit criteria:

- Local app can start against native Postgres.
- Demo admin can login locally.
- Counts match expected demo data.

### Batch 4 — Auth, Users, Roles, Permissions

Modules:

- auth login/me/logout
- users
- roles
- permission templates
- teams
- sales groups
- general settings
- platform admin tenant pages

Exit criteria:

- User context is loaded from direct Postgres.
- Role guards still work.
- Platform admin flows work.
- Tenant admin flows work.
- Partner role detection works.

### Batch 5 — Leads Foundation

Modules:

- lead list
- lead detail
- create/edit/delete/bulk update
- lead custom fields
- lead lists/members
- lead audit/history

Exit criteria:

- Leads page loads from Postgres.
- Advanced filters work.
- Smart/view filters still work where lead-backed.
- Lead detail tabs load.
- Lead create/edit works.
- Tenant/owner/partner scope verified.

### Batch 6 — Opportunities

Modules:

- opportunity list
- opportunity types
- opportunity types/stages
- stage history
- opportunity custom fields
- opportunity detail
- opportunity create/edit/stage movement

Exit criteria:

- University 1/2/3 opportunity type selection does not reset.
- Stage filters work.
- Opportunity detail loads all related data.
- Permission scope verified.

### Batch 7 — Activities and Tasks

Modules:

- activity types
- activities list/create/edit
- forms available for activity detail
- tasks list/create/edit/complete/reminders
- related lead/opportunity panels

Exit criteria:

- Activity and task APIs no longer use Supabase.
- Activity forms do not timeout.
- Task reminders can be processed by worker.

### Batch 8 — Views

Modules:

- standalone Views page
- smart/view builder
- multi-tab view execution
- assignment to users/teams/sales groups
- private user views

Exit criteria:

- Views render lists in the same page.
- Module-specific fields show correctly per tab.
- Admin assignment works.
- Non-admin private view creation works.

### Batch 9 — Forms

Modules:

- forms list/detail
- form builder
- public form renderer
- submissions
- CRM placement rules
- analytics

Exit criteria:

- Public form submit writes to direct Postgres.
- Form submissions and analytics load.
- Placement rules work for leads/opportunities/activities/tasks.

### Batch 10 — Automations and Worker

Modules:

- automation workflow CRUD
- workflow execution logs
- due-processing
- triggers/actions
- worker scheduler

Exit criteria:

- Existing cron endpoints still work.
- Worker can process due jobs directly or by internal service call.
- Advisory lock prevents duplicate worker execution.
- Automation logs are written.

### Batch 11 — Reports and Dashboards

Modules:

- dashboard widgets
- dashboard presets
- inbuilt reports
- custom report builder
- report rollups
- report schedules
- drill-down links

Exit criteria:

- Dashboard cards load faster than current Supabase path.
- Inbuilt report endpoints return correct numbers.
- Custom reports execute safe SQL only.
- Report schedule processor creates delivery rows.

### Completed — Batch 12 Partners, Payouts, Invoices

Modules:

- [x] partners
- [x] partner organizations/logins
- [x] commission rules
- [x] commission ledger
- [x] payout settings
- [x] payout cycles
- [x] payout approvals/holds/adjustments
- [x] invoice generation/download

Exit criteria:

- [x] Partner hierarchy works through direct Postgres profile/org/login paths.
- [x] Multiple partner logins aggregate into one org payout.
- [x] Payout visibility targeting works through direct Postgres user/team/sales-group/partner-org lookup.
- [x] Invoice PDFs use the new local filesystem storage adapter in Postgres mode.
- [x] Added focused Postgres regression tests at `tests/partners-payouts-postgres.test.ts`.
- [x] Verified `npm test -- partners-payouts-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Completed — Batch 13 Gamification

Modules:

- [x] gamification settings
- [x] rules
- [x] points ledger
- [x] badges
- [x] leaderboard
- [x] my points
- [x] redemption workflow
- [x] participant targeting

Exit criteria:

- [x] Award rules run from direct Postgres.
- [x] Anti-gaming controls still work.
- [x] Leaderboard respects participant targeting.
- [x] Partner/internal visibility remains correct.
- [x] Added focused Postgres regression tests at `tests/gamification-postgres.test.ts`.
- [x] Verified `npm test -- gamification-postgres.test.ts`.
- [x] Verified `npm test -- gamification.test.ts badges.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Completed — Batch 14 Predictive Scoring

Modules:

- [x] scoring settings
- [x] feature snapshots
- [x] recompute endpoint
- [x] score history
- [x] lead/opportunity score panels
- [x] scoring dashboard widgets
- [x] scoring automation fields

Exit criteria:

- [x] Recompute works against direct Postgres.
- [x] `RecordScore_source_check` is correct in `migrations/0014_predictive_scoring.sql`.
- [x] Lead/opportunity list/detail show scoring output through the same `RecordScore` APIs.
- [x] Score filters work through direct Postgres `recordType`/`recordId` predicates.
- [x] Added focused Postgres regression tests at `tests/predictive-scoring-postgres.test.ts`.
- [x] Verified `npm test -- predictive-scoring-postgres.test.ts`.
- [x] Verified `npm test -- self-learning-scoring.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Completed — Batch 15 Storage Cutover

Deliverables:

- [x] Local storage provider.
- [x] Optional S3/MinIO driver flag with explicit unsupported error until an S3 SDK/provider is added.
- [x] File metadata repository.
- [x] Invoice PDF migration/backfill script.

Exit criteria:

- [x] Existing imported invoice PDF paths can be downloaded in Postgres mode from local storage.
- [x] New invoices can be generated into local storage.
- [x] New generated invoice PDFs register tenant-scoped `FileObject` metadata.
- [x] Added migration `migrations/0015_file_storage.sql`.
- [x] Added `npm run db:backfill:invoice-files` for imported invoice metadata.
- [x] Added focused storage tests at `tests/file-storage.test.ts`.
- [x] Verified `npm test -- file-storage.test.ts partners-payouts-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.
- [ ] Runtime smoke test against local Postgres after base schema/data import is available.

### Batch 16 — Communication Connectors

Status: **Backend/API/admin configuration UI completed; provider credential smoke tests pending.**

Deliverables:

- [x] SMTP provider connector.
- [x] Generic WhatsApp HTTP provider connector.
- [x] Generic SMS HTTP provider connector.
- [x] Communication provider config tables/API/UI.
- [x] Sender identity table/data model.
- [x] Consent and suppression tables.
- [x] Template library with personalization tokens.
- [x] Communication outbox and delivery event tables.
- [x] Worker callable job for queued sends/retries/capped backoff.
- [x] Webhook endpoints for WhatsApp/SMS delivery and inbound replies.
- [x] Report schedule email delivery queue bridge from `ReportEmailDelivery` to `CommunicationOutbox`.
- [x] Added migration `migrations/0016_communication_connectors.sql`.
- [x] Added server implementation `src/lib/server/communications.ts`.
- [x] Added API routes under `src/app/api/communications`.
- [x] Added Messaging tab in Settings > Integrations for Email, WhatsApp, SMS providers, templates, and recent delivery queue status.
- [x] Added focused tests at `tests/communications.test.ts`.

Exit criteria:

- [x] Admin can configure SMTP, WhatsApp HTTP, and SMS HTTP connectors.
- [ ] Admin can send a live test email after real SMTP credentials are entered.
- [ ] Admin can send a live WhatsApp test/template message after real provider credentials are entered.
- [ ] Admin can send a live SMS test message after real provider credentials are entered.
- [x] Provider secrets are server-only and redacted from admin fetch responses.
- [x] Webhook shared-secret verification is in place for provider delivery/inbound callbacks.
- [x] Consent/suppression checks run before sending.
- [ ] Lead/opportunity timeline can show communication delivery/reply events.
- [x] Failed sends retry with capped backoff and visible failure reason.
- [x] Verified `npm test -- communications.test.ts`.
- [x] Verified `npx tsc --noEmit`.
- [x] Verified full `npm test`.
- [x] Verified `npm run build`.

### Batch 17 — Supabase Removal

Status: **Started. Server runtime/API/repository code is now on direct Postgres only. Production env/docs cleanup and archival script decisions remain.**

Deliverables:

- [x] Remove server runtime Supabase code.
- [x] Remove Supabase env requirements from production.
- [x] Confirmed browser/server Supabase session helpers are currently unreferenced by app runtime.
- [x] Added Postgres-mode paths for notifications API.
- [x] Added Postgres-mode path for inbound lead capture API.
- [x] Added Postgres-mode path for telephony webhook tenant-user lookup.
- [x] Added Postgres-mode payout ownership check before invoice generation.
- [x] Removed Supabase fallback runtime code from login API user lookup and platform-admin lookup.
- [x] Removed Supabase fallback runtime code from notifications API.
- [x] Removed Supabase fallback runtime code from inbound lead capture API.
- [x] Removed Supabase fallback runtime code from telephony webhook API.
- [x] Removed Supabase fallback runtime code from payout invoice ownership check.
- [x] Converted distribution engine execution for lead/opportunity assignment to direct Postgres only.
- [x] Switched `.env.example` default to `DATA_ACCESS_MODE=postgres`; Supabase envs are documented as legacy/export-only.
- [x] Added focused distribution engine tests at `tests/distribution-engine-postgres.test.ts`.
- [x] Updated auth route tests to cover the direct Postgres login/current-user path.
- [x] Removed Supabase fallback runtime code from report rollup server wrapper.
- [x] Removed Supabase fallback runtime code from report schedule server wrapper.
- [x] Removed Supabase fallback runtime code from task server wrapper.
- [x] Removed Supabase fallback runtime code from distribution engine.
- [x] Removed Supabase fallback runtime code from auth server helper.
- [x] Removed Supabase fallback runtime code from structured reporting query engine.
- [x] Removed Supabase fallback runtime code from badge server module.
- [x] Removed Supabase fallback runtime code from partner access/targeting helper.
- [x] Removed Supabase fallback runtime code from leaderboard server module.
- [x] Removed Supabase fallback runtime code from commission rules/ledger server module.
- [x] Removed Supabase fallback runtime code from partner profile/login server module.
- [x] Removed Supabase fallback runtime code from gamification settings/rules/points/redemptions server module.
- [x] Removed Supabase fallback runtime code from partner invoice template/generation/download/export server module.
- [x] Removed Supabase fallback runtime code from predictive scoring settings/scores/history/recompute server module.
- [x] Removed Supabase fallback runtime code from payout settings/cycles/computation/listing/transitions/holds/adjustments server module.
- [x] Removed Supabase fallback runtime code from inbuilt reporting helper lookups/calculations.
- [x] Removed Supabase fallback runtime code from platform/tenant admin server wrapper.
- [x] Removed Supabase fallback runtime code from admin modules server wrapper.
- [x] Removed Supabase fallback runtime code from `crm.ts` lead CRUD/list/count/audit wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` opportunity list/detail/create/update/delete/history/stats wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` activity type/list/create/update/stats wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` dashboard widget wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` forms/public form/submission wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` custom report/list/export wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` saved view/Views wrapper paths.
- [x] Added direct Postgres lead-list repository.
- [x] Removed Supabase fallback runtime code from `crm.ts` lead list/list-detail/member wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` webhook subscription wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` global search wrapper path.
- [x] Removed Supabase fallback runtime code from `crm.ts` website tracking wrapper path.
- [x] Removed Supabase fallback runtime code from `crm.ts` CSV import job/import execution wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` telephony settings/call-log/click-to-call/agent-popup wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` object metadata helper/listing paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` governance history, audit log, and notes wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` activity type create/update/delete wrapper paths.
- [x] Removed Supabase fallback runtime code from `crm.ts` automation workflow/action/queue wrapper paths.
- [x] Removed final `crm.ts` Supabase import and data-access mode dependency.
- [x] Removed unused Supabase helper files from `src/lib/supabase/`.
- [x] Removed `@supabase/ssr` and `@supabase/supabase-js` from `package.json`.
- [x] Removed obsolete Supabase mocks from direct-Postgres tests.
- [x] Switched test default data-access mode to Postgres.
- [x] Removed Supabase fallback from `scripts/seed-client.js`; seed/admin scripts now use direct Postgres only.
- [ ] Keep archival migration/import scripts if useful.
- [x] Update docs for direct-Postgres production env and VPS deployment.

Remaining server runtime cleanup:

- None currently identified in `src/lib/server`, `src/app/api`, or `src/lib/repositories`.
- Legacy Supabase helper files and export/import scripts may stay temporarily for migration support until production env/docs cleanup is complete.

Exit criteria:

```bash
rg "createSupabaseAdminClient|supabase\\.from|isPostgresMode\\(\\)|@/lib/supabase/server" src/lib/server/crm.ts src/lib/server src/app/api src/lib/repositories -S
```

returns no server/API/repository runtime usage.

Current verification:

- [x] Verified `npx tsc --noEmit` after edge-route migration.
- [x] Verified full `npm test` after edge-route migration.
- [x] Verified `npm run build` after edge-route migration.
- [x] Verified `npm test -- distribution-engine-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after distribution engine migration.
- [x] Verified full `npm test` after distribution engine migration.
- [x] Verified `npm run build` after distribution engine migration.
- [x] Verified `npm test -- report-infra-postgres.test.ts communications.test.ts`.
- [x] Verified `npm test -- tasks-postgres.test.ts report-infra-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after wrapper cleanup.
- [x] Verified updated task server wrapper tests at `npm test -- tasks.test.ts tasks-postgres.test.ts`.
- [x] Verified direct-only distribution engine at `npm test -- distribution-engine-postgres.test.ts`.
- [x] Verified full `npm test` after direct-only wrapper cleanup.
- [x] Verified `npm run build` after direct-only wrapper cleanup.
- [x] Verified no Supabase imports remain in migrated edge routes:
  - `src/app/api/auth/login/route.ts`
  - `src/app/api/notifications/route.ts`
  - `src/app/api/integrations/inbound/leads/[tenantId]/route.ts`
  - `src/app/api/integrations/telephony/webhook/route.ts`
  - `src/app/api/payouts/[id]/generate-invoice/route.ts`
- [x] Verified updated auth route test at `npm test -- auth.test.ts`.
- [x] Verified `npx tsc --noEmit` after direct-only edge route cleanup.
- [x] Verified full `npm test` after direct-only edge route cleanup.
- [x] Verified `npm run build` after direct-only edge route cleanup.
- [x] Verified direct-only auth helper at `npm test -- auth.test.ts`.
- [x] Verified direct-only reporting query engine at `npm test -- reports-dashboards-postgres.test.ts`.
- [x] Verified direct-only badge module at `npm test -- badges.test.ts gamification-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after auth/reporting-query/badge cleanup.
- [x] Verified full `npm test` after auth/reporting-query/badge cleanup.
- [x] Verified `npm run build` after auth/reporting-query/badge cleanup.
- [x] Verified direct-only partner access helper at `npm test -- partners-payouts-postgres.test.ts`.
- [x] Verified legacy payout-cycle tests after mocking the partner-rollup boundary at `npm test -- payout-cycles.test.ts partners-payouts-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after partner-access cleanup.
- [x] Verified full `npm test` after partner-access cleanup.
- [x] Verified `npm run build` after partner-access cleanup.
- [x] Verified direct-only leaderboard module at `npm test -- leaderboard.test.ts gamification-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after leaderboard cleanup.
- [x] Verified direct-only commission module at `npm test -- commission-engine.test.ts commission-ledger.test.ts partners-payouts-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after commission cleanup.
- [x] Verified full `npm test` after leaderboard/commission cleanup.
- [x] Verified `npm run build` after leaderboard/commission cleanup.
- [x] Verified direct-only partner module at `npm test -- partners.test.ts partners-payouts-postgres.test.ts partner-owner-scoping.test.ts`.
- [x] Verified `npx tsc --noEmit` after partner cleanup.
- [x] Verified full `npm test` after partner cleanup.
- [x] Verified `npm run build` after partner cleanup.
- [x] Verified direct-only gamification module at `npm test -- gamification.test.ts gamification-postgres.test.ts leaderboard.test.ts badges.test.ts`.
- [x] Verified `npx tsc --noEmit` after gamification cleanup.
- [x] Verified full `npm test` after gamification cleanup.
- [x] Verified `npm run build` after gamification cleanup.
- [x] Verified direct-only partner invoice module at `npm test -- partner-invoices.test.ts partners-payouts-postgres.test.ts file-storage.test.ts`.
- [x] Verified `npx tsc --noEmit` after partner invoice cleanup.
- [x] Verified full `npm test` after partner invoice cleanup.
- [x] Verified `npm run build` after partner invoice cleanup.
- [x] Verified direct-only predictive scoring module at `npm test -- self-learning-scoring.test.ts predictive-scoring-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after predictive scoring cleanup.
- [x] Verified full `npm test` after predictive scoring cleanup.
- [x] Verified `npm run build` after predictive scoring cleanup.
- [x] Verified direct-only payout module at `npm test -- payout-cycles.test.ts partners-payouts-postgres.test.ts partner-invoices.test.ts`.
- [x] Verified `npx tsc --noEmit` after payout cleanup.
- [x] Verified full `npm test` after payout cleanup.
- [x] Verified `npm run build` after payout cleanup.
- [x] Verified direct-only inbuilt reports module at `npm test -- inbuilt-reports-postgres.test.ts reporting-calculations.test.ts reports-dashboards-postgres.test.ts report-infra-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after inbuilt reports cleanup.
- [x] Verified full `npm test` after inbuilt reports cleanup.
- [x] Verified `npm run build` after inbuilt reports cleanup.
- [x] Verified direct-only admin wrapper at `npm test -- auth.test.ts tenant-isolation.test.ts db-foundation.test.ts`.
- [x] Verified `npx tsc --noEmit` after admin wrapper cleanup.
- [x] Verified full `npm test` after admin wrapper cleanup.
- [x] Verified `npm run build` after admin wrapper cleanup.
- [x] Verified direct-only admin modules wrapper at `npm test -- tenant-isolation.test.ts db-foundation.test.ts views-postgres.test.ts leads-postgres.test.ts opportunities-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after admin modules cleanup.
- [x] Verified full `npm test` after admin modules cleanup.
- [x] Verified `npm run build` after admin modules cleanup.
- [x] Verified direct-only `crm.ts` lead wrapper cluster at `npm test -- leads-postgres.test.ts leads-crud.test.ts tenant-isolation.test.ts partner-owner-scoping.test.ts`.
- [x] Verified `npx tsc --noEmit` after `crm.ts` lead wrapper cleanup.
- [x] Verified full `npm test` after `crm.ts` lead wrapper cleanup.
- [x] Verified `npm run build` after `crm.ts` lead wrapper cleanup.
- [x] Verified direct-only `crm.ts` opportunity wrapper cluster at `npm test -- opportunities-postgres.test.ts leads-postgres.test.ts reporting-calculations.test.ts`.
- [x] Verified direct-only `crm.ts` activity wrapper cluster at `npm test -- activities-postgres.test.ts opportunities-postgres.test.ts leads-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after `crm.ts` opportunity/activity wrapper cleanup.
- [x] Verified full `npm test` after `crm.ts` opportunity/activity wrapper cleanup.
- [x] Verified `npm run build` after `crm.ts` opportunity/activity wrapper cleanup.
- [x] Verified direct-only `crm.ts` forms/reports/Views/dashboard wrapper clusters at `npm test -- forms-postgres.test.ts reports-dashboards-postgres.test.ts views-postgres.test.ts report-infra-postgres.test.ts`.
- [x] Verified no `crm.ts` Supabase fallback references remain for `DashboardWidget`, `Form`, `FormSubmission`, `CustomReport`, or saved-view helper branches.
- [x] Verified `npx tsc --noEmit` after `crm.ts` forms/reports/Views/dashboard wrapper cleanup.
- [x] Verified full `npm test` after `crm.ts` forms/reports/Views/dashboard wrapper cleanup.
- [x] Verified `npm run build` after `crm.ts` forms/reports/Views/dashboard wrapper cleanup.
- [x] Verified no `crm.ts` Supabase fallback references remain for `LeadList` or `LeadListMember`.
- [x] Verified `npx tsc --noEmit` after `crm.ts` lead-list wrapper cleanup.
- [x] Verified full `npm test` after `crm.ts` lead-list wrapper cleanup.
- [x] Verified `npm run build` after `crm.ts` lead-list wrapper cleanup.
- [x] Verified no `crm.ts` Supabase fallback references remain for `WebhookSubscription` or global-search lead/opportunity/activity queries.
- [x] Verified `npx tsc --noEmit` after `crm.ts` webhook/search wrapper cleanup.
- [x] Verified full `npm test` after `crm.ts` webhook/search wrapper cleanup.
- [x] Verified `npm run build` after `crm.ts` webhook/search wrapper cleanup.
- [x] Verified no `crm.ts` Supabase fallback references remain for `ImportJob`, `IntegrationSetting`, or `TelephonyCallLog`.
- [x] Verified `npx tsc --noEmit` after `crm.ts` imports/telephony wrapper cleanup.
- [x] Verified full `npm test` after `crm.ts` imports/telephony wrapper cleanup.
- [x] Verified `npm run build` after `crm.ts` imports/telephony wrapper cleanup.
- [x] Verified no `crm.ts` Supabase fallback references remain for object metadata, governance history, audit logs, notes, activity type mutations, or automation wrapper/action/queue paths.
- [x] Verified server/API/repository runtime grep is clean:
  - `rg -n "createSupabaseAdminClient|supabase\\.from|isPostgresMode\\(\\)|@/lib/supabase/server" src/lib/server/crm.ts src/lib/server src/app/api src/lib/repositories -S`
- [x] Verified targeted final cleanup tests at `npm test -- automations-postgres.test.ts activities-postgres.test.ts`.
- [x] Verified `npx tsc --noEmit` after final `crm.ts` runtime Supabase cleanup.
- [x] Verified full `npm test` after final `crm.ts` runtime Supabase cleanup.
- [x] Verified `npm run build` after final `crm.ts` runtime Supabase cleanup.
- [x] Verified `scripts/seed-demo-test-data.js` and `scripts/ensure-platform-admin.js` no longer require Supabase URL/service-role envs for direct-Postgres mode.
- [x] Verified `.env.example` and `deploy/vps/.env.example` no longer contain Supabase URL/anon/service-role production runtime envs.
- [x] Verified direct-Postgres seed abstraction at `npm test -- seed-client.test.ts`.
- [x] Verified full `npm test` after seed/admin env cleanup.
- [x] Verified no Supabase package/helper/env references remain in production source, scripts, tests, package manifest, or runtime env examples:
  - `rg -n "@/lib/supabase|@supabase|createSupabaseAdminClient|createSupabaseServerClient|createBrowserClient|createServerClient|NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|DATA_ACCESS_MODE=supabase" src scripts tests package.json .env.example deploy/vps/.env.example -S`
- [x] Verified targeted package/helper cleanup tests at `npm test -- predictive-scoring-postgres.test.ts gamification-postgres.test.ts partners-payouts-postgres.test.ts reporting-calculations.test.ts distribution-engine-postgres.test.ts seed-client.test.ts`.
- [x] Verified `npx tsc --noEmit` after Supabase package/helper cleanup.
- [x] Verified full `npm test` after Supabase package/helper cleanup.
- [x] Verified `npm run build` after Supabase package/helper cleanup.

### Batch 18 — VPS Deployment

Status: **Started. VPS deployment scaffold is present and locally verifiable Node/Next checks pass. Docker/Compose runtime validation remains VPS-only because Docker is not installed on the local machine.**

Deliverables:

- [x] `Dockerfile` for the Next.js standalone production image.
- [x] `deploy/vps/docker-compose.yml` with separate `postgres`, `web`, `worker`, and `caddy` services.
- [x] Caddy reverse proxy config at `deploy/vps/caddy/Caddyfile`.
- [x] VPS env template at `deploy/vps/.env.example`.
- [x] Backup script at `deploy/vps/scripts/backup-postgres.sh`.
- [x] Restore script at `deploy/vps/scripts/restore-postgres.sh`.
- [x] Migration script at `deploy/vps/scripts/migrate-postgres.sh`.
- [x] Healthcheck script at `deploy/vps/scripts/healthcheck.sh`.
- [x] Deployment README at `deploy/vps/README.md`.
- [x] App health endpoint at `src/app/api/health/route.ts`.
- [x] Separate worker command at `npm run worker`, backed by `scripts/worker.js`.
- [x] Worker processes due automations, task reminders, report rollup jobs, report schedules, and communication outbox jobs through internal cron-secret-protected endpoints.
- [x] Production image includes `migrations/` and DB utility scripts so one-off migrations can run inside the `web` image.
- [x] Added direct `dotenv` dependency for DB/seed utility scripts in the production image.

Exit criteria:

- [ ] Compose config validates on a Docker-enabled machine:
  - `docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env config`
- [ ] Production image builds on a Docker-enabled machine:
  - `docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env build`
- [ ] VPS stack starts.
- [ ] Healthcheck passes against the running VPS stack.
- [ ] Worker heartbeat is visible in `docker compose logs -f worker`.

Current verification:

- [x] Verified `node --check scripts/worker.js`.
- [x] Verified `sh -n deploy/vps/scripts/healthcheck.sh`.
- [x] Verified `sh -n deploy/vps/scripts/backup-postgres.sh`.
- [x] Verified `sh -n deploy/vps/scripts/restore-postgres.sh`.
- [x] Verified `sh -n deploy/vps/scripts/migrate-postgres.sh`.
- [x] Verified `node --check scripts/db-migrate-local.js`.
- [x] Verified `node --check scripts/seed-client.js`.
- [x] Verified `npx tsc --noEmit` after adding VPS deployment scaffold.
- [x] Verified full `npm test` after adding VPS deployment scaffold.
- [x] Verified `npm run build` after adding VPS deployment scaffold.
- [x] Verified no Supabase package/helper/env references remain in production source, scripts, tests, package manifest, or runtime env examples after image/script packaging changes.
- [x] Verified `npx tsc --noEmit` after Docker/script packaging changes.
- [x] Verified full `npm test` after Docker/script packaging changes.
- [x] Verified `npm run build` after Docker/script packaging changes.
- [x] Confirmed Docker is not installed locally, so image/Compose validation is deferred to the VPS.

## Local Native Postgres Command Flow

After implementation, local setup should be:

```bash
cd crm
npm install
npm run db:setup:local
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Optional worker:

```bash
npm run worker
```

No Docker command should be needed locally.

## VPS Docker Command Flow

After implementation, VPS setup should be:

```bash
cd /opt/crm
cp deploy/vps/.env.example deploy/vps/.env
# edit deploy/vps/.env
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env up -d --build
docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env ps
deploy/vps/scripts/healthcheck.sh
```

Backup:

```bash
deploy/vps/scripts/backup-postgres.sh
```

Restore rehearsal:

```bash
deploy/vps/scripts/restore-postgres.sh /opt/crm/backups/example.dump
```

Detailed operator checklist:

- `10_DIRECT_POSTGRES_VPS_RUNBOOK.md`

## Cutover Checklist

Before cutover:

- Fresh Supabase export created.
- Local import rehearsal completed.
- VPS import rehearsal completed.
- File storage export/import tested.
- DNS TTL lowered.
- SMTP provider configured and test email delivered.
- WhatsApp connector configured and test message/webhook verified.
- SMS connector configured and test message/webhook verified.
- Worker disabled on old environment or made harmless.

During cutover:

- Put Vercel app into maintenance mode or block writes.
- Export final Supabase DB.
- Export final Supabase Storage objects.
- Restore DB to VPS Postgres.
- Restore files to VPS storage.
- Start VPS stack.
- Run smoke tests.
- Switch DNS.

After cutover:

- Check logs for 2 hours.
- Verify worker heartbeat.
- Verify dashboard/report/scoring jobs.
- Keep old Vercel + Supabase untouched for rollback window.

## Rollback Checklist

Rollback if any of these fail:

- users cannot log in
- tenant admin cannot access settings
- leads/opportunities cannot load
- writes fail
- payout/invoice flows fail
- workers create duplicate jobs
- severe data mismatch appears

Rollback steps:

- Freeze VPS writes.
- Point DNS back to Vercel.
- Keep managed Supabase as source of truth.
- Export any VPS-only writes for manual reconciliation.
- Diagnose offline.

## Acceptance Criteria

The migration is complete only when:

- Local app runs with native Postgres and no Supabase runtime requirement.
- VPS app runs with Docker Compose.
- Worker runs separately from the web process.
- Database is VPS Postgres.
- Invoice/file storage no longer depends on Supabase Storage.
- `npm test` passes.
- `npx tsc --noEmit` passes.
- `npm run build` passes.
- All critical demo modules are manually verified.
- Backup and restore rehearsal is documented and tested.
- Rollback plan has been rehearsed once.

## Open Decisions Before Implementation

- File storage target: local VPS volume, MinIO, Cloudflare R2, or AWS S3.
- Reverse proxy: Caddy or Nginx.
- Queue mode: simple interval worker first, or Redis/BullMQ immediately.
- Migration source format: Supabase SQL dump, `pg_dump` custom format, or both.
- Whether to keep Postgres RLS as defense-in-depth after app-level permission enforcement.
- Whether to introduce Drizzle later after the `pg` repository layer stabilizes.

## Recommendation

Proceed with direct Postgres, but do it inside the existing `crm/` app using a repository layer and module-by-module migration.

Use Docker Compose for production VPS deployment.

Do not create a new CRM folder/app. Create only supporting folders for DB, repositories, worker, storage, and deployment.
