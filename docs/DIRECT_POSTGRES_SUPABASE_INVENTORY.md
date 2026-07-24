# Direct Postgres Migration Inventory

Generated at the start of the direct-Postgres migration.

## Current Runtime Shape

- The active app is `crm/`, a Next.js app with frontend pages and backend route handlers in the same project.
- There are 165 `src/app/api/**/route.ts` files.
- Current data access is Supabase-heavy and should be migrated module by module.
- Invoice PDFs currently depend on Supabase Storage.
- Background jobs are cron-style HTTP endpoints today; a dedicated worker is still needed.

## Confirmed Supabase Touchpoint Areas

- `src/lib/supabase/*`
- `src/lib/server/auth.ts`
- `src/lib/server/admin.ts`
- `src/lib/server/admin-modules.ts`
- `src/lib/server/crm.ts`
- `src/lib/server/report-rollups.ts`
- `src/lib/server/report-schedules.ts`
- `src/lib/server/reporting-query.ts`
- `src/lib/server/inbuilt-reports.ts`
- `src/lib/server/commission.ts`
- `src/lib/server/payouts.ts`
- `src/lib/server/partner-invoices.ts`
- `src/lib/server/partners.ts`
- `src/lib/server/partner-access.ts`
- `src/lib/server/gamification.ts`
- `src/lib/server/badges.ts`
- `src/lib/server/leaderboard.ts`
- `src/lib/server/self-learning-scoring.ts`
- `src/lib/server/distribution-engine.ts`
- direct route handlers for login, inbound leads, telephony webhook, notifications, and payout invoice generation.
- scripts:
  - `scripts/seed-demo-test-data.js`
  - `scripts/ensure-platform-admin.js`

## Migration Implication

Do not remove Supabase packages or env vars yet. The first implementation batches add direct Postgres infrastructure while preserving the existing Supabase runtime path.

## First Safe Cut

- Add `pg` and DB helpers.
- Add local native Postgres scripts.
- Add migration tracking.
- Keep `DATA_ACCESS_MODE=supabase` until each module is migrated and verified.
