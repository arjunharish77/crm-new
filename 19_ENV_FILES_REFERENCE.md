# Environment Files Reference — All Locations, Commands, Required Keys

This document lists every `.env`-related file in this repo (CRM app, Unnati Vidya website,
ML service, and the VPS production deployment), exactly where it lives, the commands to check
whether it exists and to open it, and which keys it actually needs.

**Method**: every key listed as "used by code" below was verified by grepping actual
`process.env.X` (Node/Next.js) and `os.environ`/`os.getenv` (Python) references across the
whole codebase — not copied blindly from the `.env.example` templates. Where a template
disagrees with what the code actually reads, that's called out explicitly in §6.

**Safety reminder** (same rule as everywhere else in this repo): never overwrite a real `.env`
wholesale, and never copy a blank template over a file with live secrets already in it. Only
ever open it, add/change specific lines, save. This is doubly true for `deploy/vps/.env` on
the production VPS.

---

## Quick reference — all 5 locations

| # | File | Real or template? | Used by |
|---|---|---|---|
| 1 | `.env` (repo root) | Real file, local dev secrets | Main CRM app (`src/`), run locally outside Docker |
| 2 | `.env.example` (repo root) | Template for #1 | — |
| 3 | `apps/unnatividya/.env` | Real file, local dev secrets | Unnati Vidya website app, run locally outside Docker |
| 4 | `ml-service/.env.example` | Template only (no real file exists yet) | Standalone Python ML service (Docker/production only) |
| 5 | `deploy/vps/.env` | Real file, **production secrets**, lives only on the VPS | Every service in `deploy/vps/docker-compose.yml` (CRM, Unnati Vidya, ML service, Postgres, Redis, worker) |
| — | `deploy/vps/.env.example` | Template for #5 | — |

There is **no** `apps/unnatividya/.env.example` file — only the real `.env` exists for that app.

---

## 1. Root `.env` — local dev, main CRM app

**Location**: repo root, i.e. `/Users/arjunh/Documents/crm/crm/.env`

**Check it exists:**
```bash
ls -la .env
```

**Open it:**
```bash
nano .env
```

**Required (core — app won't start or a core feature breaks without these):**
| Key | Purpose |
|---|---|
| `NODE_ENV` | `development`/`production` — gates auth-debug, cookie `secure` flag, error detail |
| `DATA_ACCESS_MODE` | `postgres` (production target) |
| `DATABASE_URL` | Main app DB connection |
| `DIRECT_DATABASE_URL` | Migration-time direct DB connection |
| `JWT_SECRET` | Signs/verifies the app's auth JWT |
| `REDIS_URL` | BullMQ worker + rate limiting |
| `FILE_STORAGE_DRIVER` | `local` |
| `FILE_STORAGE_ROOT` | Local file storage path |

**Optional / feature-specific:**
| Key | Purpose |
|---|---|
| `AUTH_DEBUG` | Force auth-debug info outside dev |
| `NEXT_PUBLIC_API_DEBUG` | Browser-side API client verbose logging |
| `DATABASE_SSL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_POOL_MAX`, `DATABASE_REALTIME_POOL_MAX`, `DATABASE_STATEMENT_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS`, `DATABASE_CONNECTION_TIMEOUT_MS` | DB connection tuning — has working defaults |
| `BASE_SCHEMA_SQL_PATH` | One-time, only for bootstrapping a brand-new empty DB |
| `LOCAL_POSTGRES_ADMIN_URL` | Local dev DB/role creation only |
| `SUPABASE_DATABASE_URL`, `SUPABASE_SCHEMA_DUMP_PATH`, `SUPABASE_DATA_DUMP_PATH`, `PG_DUMP_PATH`, `PSQL_PATH` | One-time legacy Supabase export/import only |
| `WORKER_REPEAT_MS`, `WORKER_CONCURRENCY` | Background worker tuning |
| `AUTOMATION_CRON_SECRET`, `TASKS_CRON_SECRET`, `REPORTING_CRON_SECRET`, `COMMUNICATIONS_CRON_SECRET`, `COMMUNICATIONS_WEBHOOK_SECRET`, `WEBHOOK_SIGNING_SECRET` | Shared secrets each specific cron/webhook route checks — only needed if that route is actually called, but should be real random values in any live deployment |
| `ML_SERVICE_URL`, `ML_SERVICE_SECRET` | Optional third predictive-scoring candidate; recompute falls back gracefully if unset |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NAME` | Only read by manually-run `node scripts/ensure-platform-admin.js` — not needed for normal app operation |
| `DEMO_TENANT_ID`, `DEMO_ADMIN_USER_ID`, `DEMO_ADMIN_EMAIL`, `DEMO_LEAD_COUNT` | Only read by manually-run `node scripts/seed-demo-test-data.js` |
| `API_BASE_URL`, `API_SMOKE_TENANT_ID`, `API_SMOKE_USER_ID` | Only used by smoke-test scripts |

**Present in this file/template but NOT actually read by the CRM app's own code** (they only matter to the *Unnati Vidya* app, which reads its own separate `.env` — see §3; harmless to leave here, just not functionally required for the CRM app itself):
`NEXT_PUBLIC_UNNATIVIDYA_SITE_URL`, `UNNATIVIDYA_DATABASE_URL`, `UNNATIVIDYA_SESSION_SECRET`, `UNNATIVIDYA_REDIS_PREFIX`, `UNNATIVIDYA_CRM_SYNC_WORKER_ENABLED`, `ZEPTOMAIL_*`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GTM_ID`, `INDEXNOW_*`.

---

## 2. Root `.env.example` — template for #1

**Location**: `/Users/arjunh/Documents/crm/crm/.env.example`

**Check it exists / view it (read-only template, safe to just cat):**
```bash
ls -la .env.example
cat .env.example
```

Same key list as §1 (this is its template) — never copy this over the real `.env`.

---

## 3. `apps/unnatividya/.env` — local dev, Unnati Vidya website app

**Location**: `/Users/arjunh/Documents/crm/crm/apps/unnatividya/.env`

**Check it exists:**
```bash
ls -la apps/unnatividya/.env
```

**Open it:**
```bash
nano apps/unnatividya/.env
```

**Required:**
| Key | Purpose |
|---|---|
| `NEXT_PUBLIC_UNNATIVIDYA_SITE_URL` | Site's own base URL (e.g. `http://localhost:3100` for local dev) |
| `UNNATIVIDYA_DATABASE_URL` | This app's own Postgres DB (separate DB/user from the CRM) |
| `UNNATIVIDYA_SESSION_SECRET` | Admin session signing |
| `UNNATIVIDYA_CMS_SETUP_ENABLED` | Enables CMS setup routes |

**Optional / feature-specific:**
| Key | Purpose |
|---|---|
| `ZEPTOMAIL_API_URL`, `ZEPTOMAIL_API_KEY`, `ZEPTOMAIL_FROM_EMAIL`, `ZEPTOMAIL_FROM_NAME` | Real key required for OTP emails (admin 2FA, lead email verification) to actually send — without it, those features silently no-op |
| `UNNATIVIDYA_CRM_SYNC_WORKER_ENABLED`, `UNNATIVIDYA_CRM_SYNC_INTERVAL_MS`, `UNNATIVIDYA_CRM_SYNC_BATCH_SIZE` | CRM sync worker, off by default |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GTM_ID` | SEO/analytics — safe to leave blank |
| `INDEXNOW_ENABLED`, `INDEXNOW_KEY`, `INDEXNOW_KEY_LOCATION` | Self-issued, no external account needed |

---

## 4. `ml-service/.env.example` — template, standalone ML service

**Location**: `/Users/arjunh/Documents/crm/crm/ml-service/.env.example`

**Check it exists (note: no real `ml-service/.env` exists locally yet):**
```bash
ls -la ml-service/.env.example
ls -la ml-service/.env   # will say "No such file" unless you've created one
```

**Open the template / create a real one from it if you need to run it standalone (e.g. in Docker):**
```bash
cat ml-service/.env.example
```

**Keys (all of them, per the file itself):**
| Key | Purpose |
|---|---|
| `DIRECT_DATABASE_URL` | Same Postgres the CRM app uses |
| `ML_SERVICE_SECRET` | Shared secret with the CRM app's `ML_SERVICE_URL`/`ML_SERVICE_SECRET` pair |
| `FILE_STORAGE_ROOT` | Path to shared storage |
| `ML_SERVICE_PORT` | Port the service listens on |
| `ML_EMBEDDING_MODEL` | Model name (`all-MiniLM-L6-v2`) |

**Important note from the file's own comment**: if you run this via `npm run ml-service:dev` from the repo root, it reads the **root** `.env` instead (see §1's `ML_SERVICE_URL`/`ML_SERVICE_SECRET` entries) — this file only matters when running the ML service standalone (e.g. its own Docker container), which is exactly how `deploy/vps/docker-compose.yml`'s `ml-service` container runs it (via `deploy/vps/.env`, see §5).

---

## 5. `deploy/vps/.env` — production, VPS only (shared by every service)

**Location on the VPS**: `deploy/vps/.env`, relative to wherever the repo is checked out
(e.g. `/opt/unnatify-crm/deploy/vps/.env`) — **not** the repo root `.env`, and not inside the
`deploy/` folder itself. This is the file `docker-compose.yml`'s `env_file: - .env` resolves
to for every service (CRM web, Unnati Vidya web, worker, Postgres, Redis).

**Check it exists (run from the repo root, e.g. `/opt/unnatify-crm`):**
```bash
ls -la deploy/vps/.env
```

**Open it:**
```bash
nano deploy/vps/.env
```

**Check one specific key without printing the whole file (useful for secrets you don't want scrolling past):**
```bash
grep GOOGLE_SITE_VERIFICATION deploy/vps/.env
```

**Template for comparison:**
```bash
cat deploy/vps/.env.example
```

### Required keys (per the template, `deploy/vps/.env.example`)

**Domains:**
`APP_DOMAIN`, `API_DOMAIN`, `UNNATIVIDYA_DOMAIN`, `ACME_EMAIL`

**Database / Redis** (keep passwords consistent across the paired keys — e.g. `POSTGRES_PASSWORD` must match the password embedded in `DATABASE_URL`):
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`UNNATIVIDYA_POSTGRES_DB`, `UNNATIVIDYA_POSTGRES_USER`, `UNNATIVIDYA_POSTGRES_PASSWORD`,
`DATABASE_URL`, `DIRECT_DATABASE_URL`, `REDIS_URL`,
`DATABASE_SSL`, `DATABASE_POOL_MAX`, `DATABASE_STATEMENT_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS`, `DATABASE_CONNECTION_TIMEOUT_MS`

**App / auth:**
`NODE_ENV`, `DATA_ACCESS_MODE`, `BASE_SCHEMA_SQL_PATH`, `JWT_SECRET`, `AUTH_DEBUG`, `NEXT_PUBLIC_API_DEBUG`

**File storage / worker:**
`FILE_STORAGE_DRIVER`, `FILE_STORAGE_ROOT`, `APP_INTERNAL_URL`, `WORKER_REPEAT_MS`, `WORKER_CONCURRENCY`

**Cron/webhook secrets:**
`AUTOMATION_CRON_SECRET`, `TASKS_CRON_SECRET`, `REPORTING_CRON_SECRET`, `COMMUNICATIONS_CRON_SECRET`, `COMMUNICATIONS_WEBHOOK_SECRET`, `WEBHOOK_SIGNING_SECRET`

**ML service** (optional — falls back gracefully if unset):
`ML_SERVICE_URL`, `ML_SERVICE_SECRET`

**Unnati Vidya website:**
`NEXT_PUBLIC_UNNATIVIDYA_SITE_URL`, `UNNATIVIDYA_DATABASE_URL`, `UNNATIVIDYA_SESSION_SECRET`, `UNNATIVIDYA_CRM_SYNC_WORKER_ENABLED`, `UNNATIVIDYA_CRM_SYNC_INTERVAL_MS`, `UNNATIVIDYA_CRM_SYNC_BATCH_SIZE`, `ZEPTOMAIL_API_URL`, `ZEPTOMAIL_API_KEY`, `ZEPTOMAIL_FROM_EMAIL`, `ZEPTOMAIL_FROM_NAME`

**SEO/marketing** (optional, blank is fine):
`GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION`, `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GTM_ID`, `INDEXNOW_ENABLED`, `INDEXNOW_KEY`, `INDEXNOW_KEY_LOCATION`

### Also genuinely used by code, but missing from `deploy/vps/.env.example` (worth adding to the template, and confirming present in your real file)

| Key | Why it's needed |
|---|---|
| `UNNATIVIDYA_CMS_SETUP_ENABLED` | Read directly by the Unnati Vidya app (same as in `apps/unnatividya/.env`, §3) — the template omits it |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_NAME` | Only needed if you manually run `node scripts/ensure-platform-admin.js` on the VPS to bootstrap the first platform admin — throws in production if `PLATFORM_ADMIN_PASSWORD` is missing *when that script is run*, but it's not run automatically by anything, so it's not required day-to-day |

---

## 6. Extra keys observed in a real production `.env` that no code currently reads

While cross-checking against the actual VPS `.env` content shared earlier in this conversation, several keys appear there that **do not match any `process.env.*` reference anywhere in `src/`, `apps/unnatividya/`, or `ml-service/`**, and don't correspond to any installed package (no Sentry or Resend package is even in `package.json`). These are safe to leave as-is or leave blank — nothing in the current codebase reads them, so they have no effect either way:

`APP_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`, `PORT` (Docker Compose hardcodes the actual port per service instead), `CSV_MAX_FILE_BYTES`, `CSV_MAX_ROWS`, `UPLOAD_DIR`, `LOG_DIR`, `LOG_LEVEL`, `AUDIT_LOG_RETENTION_DAYS`, `AUDIT_LOG_DELETE_ENABLED`, `CONNECTOR_EVENT_RETENTION_DAYS`, `AUTOMATION_LOG_RETENTION_DAYS`, `UPLOADED_FILE_RETENTION_DAYS`, `REPORT_EXPORT_RETENTION_DAYS`, `TELEPHONY_RECORD_RETENTION_DAYS`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OPS_LOGIN_ENABLED`, `OPS_EMAIL`, `OPS_PASSWORD_HASH`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`, `SEED_ADMIN_PHONE`, `SEED_DEMO_DATA`, `HEALTH_METRICS_PUBLIC`, `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_DAYS`, `LOGIN_FAILURE_LIMIT`, `LOGIN_LOCK_SECONDS`, `UNNATIVIDYA_REDIS_PREFIX`.

These look like either leftovers from an earlier version of the code, or reserved names for features not yet built (e.g. Sentry error tracking, Resend email, audit-log retention policies). Not a bug, not something to fix — just don't spend time worrying about them being blank or "wrong."
