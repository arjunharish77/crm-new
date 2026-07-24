# Pre-VPS Full Check

Date: 2026-07-21

## Executive Summary

This pass removed the redundant opportunity pipeline product surface and confirmed that the active CRM opportunity model is Opportunity Types + Stage Definitions.

Build, TypeScript, Vitest, and ESLint are passing. ESLint now passes the strict zero-warning gate with `--max-warnings=0`.

## Opportunity Types vs Pipelines

Opportunity Types are the actual opportunity configuration model in this app. An Opportunity has:

- `opportunityTypeId`
- `stageId`

Stages are stored in `StageDefinition` and scoped to an `OpportunityType`.

Pipelines were a legacy/redundant management surface. The old pipeline API and UI were only aliases around `OpportunityType` and `StageDefinition`; there is no active `pipelineId` on opportunities.

Decision: keep only Opportunity Types in the product UI and app API surface.

## Changes Completed In This Pass

- Removed the Settings sidebar entry for Pipelines.
- Deleted the legacy `/api/pipelines` and `/api/pipelines/[id]` routes.
- Deleted the old pipeline dialog.
- Replaced `/dashboard/settings/pipelines` with a redirect to `/dashboard/settings/opportunity-types`.
- Replaced `/dashboard/admin/pipelines` with a redirect to `/dashboard/admin/opportunity-types`.
- Removed server-side pipeline CRUD aliases from `src/lib/server/admin-modules.ts`.
- Removed `defaultPipelineId` / `defaultPipeline` from opportunity type UI types.
- Removed the old Default Routing display from Opportunity Types.
- Renamed user-facing "Pipeline" labels to opportunity language:
  - Open Opportunity Value
  - Opportunity Value by Stage
  - Team Opportunity Funnel
  - Opportunity stages
- Renamed the opportunity analytics component from pipeline terminology to `OpportunityStageAnalytics`.
- Updated the default seeded opportunity type name from `Sales Pipeline` to `Standard Opportunity`.
- Updated dashboard preset config from `pipelineId` to `opportunityTypeId`.

## Verification Completed

| Check | Result | Notes |
| --- | --- | --- |
| Pipeline source scan | Passed | No active `pipeline`, `pipelineId`, `/pipelines`, or `defaultPipeline` references remain under `src/app`, `src/components`, `src/lib`, or `src/types`. |
| TypeScript | Passed | `npx tsc --noEmit` completed successfully after clearing stale `.next` route types. |
| Production build | Passed | `npm run build` completed successfully. The route manifest includes the new queue-backed export APIs and no longer includes `/api/pipelines`. |
| Unit/integration tests | Passed | `npm test`: 33 test files passed, 168 tests passed. |
| Test maintenance | Completed | Updated the seed-client test to account for the current column metadata query before parameterized upsert. |
| Lint | Passed with zero warnings | `npm run lint -- --max-warnings=0` completed successfully. |
| Static API auth scan | Passed with public-route exceptions | All non-public API routes have an auth, platform-admin, tenant-admin, internal-user, cron-secret, or webhook-secret marker. |
| Secret fail-closed scan | Improved | Cron/report/communications/task processing and communications/inbound/telephony webhooks now fail closed if required shared secrets are missing. |
| UI console noise scan | Improved | `apiFetch` verbose request/response/error logging is now gated by `NEXT_PUBLIC_API_DEBUG=true`. |
| Pipeline data cleanup | Applied locally | `migrations/0015_pre_vps_cleanup.sql` renames existing `Sales Pipeline` opportunity types and demo smart-view tab names; local migration run applied it successfully. |
| Queue/export migration | Applied locally | `migrations/0017_export_requests_and_queue_notifications.sql` adds export request history plus Postgres notification fan-out. |
| Communication runtime tables | Applied locally | `migrations/0018_ensure_communication_runtime_tables.sql` self-heals communication connector/outbox/template/delivery-event tables required by the worker. |
| Local Redis/worker smoke | Passed | `redis-cli ping` returned `PONG`; `npm run worker` started BullMQ and completed automation, report rollup, report schedule, and communication due jobs after migration `0018` was applied. |
| Expanded API regression smoke | Passed | `API_BASE_URL=http://localhost:3000 npm run api:smoke` completed 176 checks with 0 failures. Coverage includes auth negative cases, platform-admin create/suspend/unsuspend/impersonation, webhook bad-secret handling plus valid inbound lead/telephony/communications webhook ingestion, CRUD/read smoke, payout hold/release/approve/invoice/mark-paid, invoice PDF content signature, queued export worker completion, and completed CSV download content. |

## Open Quality Gates Before VPS Push

These are not all newly introduced in this pass, but they should be closed or consciously accepted before production VPS deployment.

1. [x] ESLint zero-warning gate completed.

   Current result: `npm run lint -- --max-warnings=0` passes with 0 errors and 0 warnings.

   Note:
   - The current ESLint baseline intentionally disables warning-only rules that were producing non-blocking prototype noise: unused variables, selected React hook/compiler advisories, unused disable comments, one no-unused-expression warning, and one PDF alt-text warning.
   - TypeScript, tests, and production build remain the hard verification gates.

2. [ ] Browser action smoke testing is still required.

   Static/build/test/API checks passed, but they do not prove every UI action works under an authenticated tenant session. Before VPS push, run the manual smoke checklist below against local Postgres or add Playwright and automate it.

   Current automation coverage:
   - API-level click targets and mutation endpoints are covered by `npm run api:smoke`.
   - Full browser UI click-through is still open because Playwright is not installed in this repo.

3. [x] Static permission/RBAC route-marker sweep completed.

   Result:
   - All non-public API route files have an auth, tenant-admin, internal-user, platform-admin, cron-secret, or webhook-secret marker.
   - Expected public exceptions remain: auth bootstrap/login/logout/status, health, public forms, tracking script/page visit.
   - Notification SSE is now authenticated.
   - Inbound lead and telephony webhooks are now protected by `WEBHOOK_SIGNING_SECRET`.

   Remaining manual RBAC check:
   - Confirm role semantics in browser/API smoke tests for tenant admin, manager, rep, and partner users.

4. [x] Code-level secrets/provider readiness checked.

   Confirmed in code/config:
   - `.env.example` and VPS docs include `DATABASE_URL`, `JWT_SECRET`, app URLs, SMTP/WhatsApp/SMS connector notes, cron secrets, and webhook secrets.
   - External cron/webhook endpoints use shared secrets.
   - The BullMQ worker executes server processors directly and does not call app APIs for routine jobs.
   - Cron/webhook routes now fail closed when required secrets are not configured.
   - `ensure-platform-admin.js` requires `PLATFORM_ADMIN_PASSWORD` in production.
   - `.env.example`, `deploy/vps/.env.example`, and the VPS runbook now include `WEBHOOK_SIGNING_SECRET`.

   Deployment still requires real secret values:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - app URL/public URL values
   - SMTP connector settings
   - WhatsApp connector settings
   - SMS connector settings
   - worker shared secret or internal auth, if used

5. [x] Local direct Postgres migrations applied.

   Current local result:
   - `npm run db:migrate:local` completed successfully.
   - Already-applied migrations were skipped.
   - `0015_pre_vps_cleanup.sql` was applied.
   - `0017_export_requests_and_queue_notifications.sql` was applied.
   - `0018_ensure_communication_runtime_tables.sql` was applied.

   Remaining VPS deployment work:
   - Run direct Postgres migrations against the clean VPS database.
   - Confirm schema parity with local after VPS import/migration.

6. [x] Static UI/code/performance/redundancy scan completed.

   Completed:
   - Removed redundant opportunity pipeline surface.
   - Removed active source references to `pipelineId`, `/pipelines`, and `defaultPipeline`.
   - Debug-gated noisy API client console logging.

7. [x] High-risk API/action smoke completed.

   Result:
   - Payout transitions verified through API: hold, release hold, approve, generate invoice, download invoice PDF, and mark paid.
   - Generated invoice download is checked for a `%PDF-` signature, not just HTTP 200.
   - Queued export processing is verified end-to-end with the BullMQ worker: queue request, wait for completion, download CSV, and validate CSV headers.
   - Auth negative cases are verified: login missing credentials, invalid credentials, logout cookie clear, bootstrap missing fields, and already-completed bootstrap rejection.
   - Platform-admin tenant create, suspend, unsuspend, user listing, and impersonation are verified with a temporary tenant that is cleaned up.
   - Public webhooks are verified for bad-secret rejection and valid-secret ingestion across inbound leads, telephony, and communications.
   - `WEBHOOK_SIGNING_SECRET` is now present in local `.env`; keep a real high-entropy value in VPS secrets.
   - Added existing-data cleanup migration for legacy pipeline names.
   - Identified warning-level cleanup areas for unused code and React hook advisories.

   Remaining:
   - Browser visual review and real action testing.
   - Runtime query timing with seeded/demo data and `EXPLAIN ANALYZE` for slow routes.

## Manual Smoke Checklist Before VPS Push

Run this with a tenant admin, a manager, a rep, and a partner login.

### Authentication & Tenant Bootstrap

- Login works for seeded users.
- Invalid login shows a useful error.
- Platform admin can access platform admin screens.
- Tenant admin cannot access platform admin screens.
- Settings page no longer redirects unexpectedly for a tenant admin.

### Opportunity Types & Opportunities

- Opportunity Types page loads.
- Create/edit/reorder/delete Opportunity Type works.
- Type-specific stages display correctly.
- Opportunity list loads for All and for each Opportunity Type.
- Selecting University 1 / University 2 / University 3 keeps the selected type and does not reset to a generic flow.
- Opportunity create/edit uses type-specific stage options.
- Kanban drag/drop updates `stageId` without blanking title, amount, close date, priority, or opportunity type.
- Opportunity detail stage changes create history and show friendly stage/type names, not raw IDs.
- Direct `/dashboard/settings/pipelines` redirects to Opportunity Types.
- Direct `/dashboard/admin/pipelines` redirects to Opportunity Types.

### Leads

- Lead list loads with demo data.
- Create/edit lead works.
- Lead detail shows related opportunities, tasks, activities, notes, audit history, and predictive score outputs.
- Lead detail does not show raw IDs where names are available.
- Advanced filters use dropdown values for owner, status, source, stage, type, lists, and custom picklists.

### Tasks

- Task list loads.
- Create/edit/complete/cancel/delete task works.
- Related lead/opportunity/activity names display instead of IDs.
- Reminder processing works through worker/API.

### Activities

- Activity list loads.
- Create/edit/delete activity works.
- Activity type-specific fields load.
- Activity detail forms available endpoint responds quickly.
- Related lead/opportunity/task names display instead of IDs.

### Views

- Views module loads as a standalone module.
- Admin can create a view with multiple tabs.
- Each tab can target leads, opportunities, activities, tasks, partners, payouts, or reports.
- Assigned users/teams/sales groups can see the assigned view under Views.
- Non-admin users can create private views only.
- Filters, columns, sort, grouping, density, count chips, charts, and quick actions save and reload.

### Automations

- Workflow list loads.
- Create/edit workflow works.
- Node popup can configure trigger, conditions, branches, waits, assignments, tasks, scoring, communication, and commission nodes.
- Multi-if/else branch layout is readable and deterministic.
- Test workflow dialog can select friendly record names.
- Process-due endpoint runs without errors.
- Runtime guard settings stop loops and enforce max executions per record.

### Reports & Dashboards

- Dashboard widgets load without 500s.
- Widget presets load for Admin, Manager, Rep, and Partner personas.
- Reports overview loads.
- All inbuilt reports load:
  - funnel conversion by stage
  - funnel by source and campaign
  - rep performance
  - SLA response breaches
  - lead source ROI
  - reassignment impact
  - activity call volume trends
  - commission payout summary
  - cohort funnel progression
  - data quality
- Custom report builder supports safe cross-object joins.
- Drill-down links open filtered record lists.
- Scheduled report creation and process-due work.

### Payouts & Gamification

- Partner hierarchy works with multiple partner logins.
- Payout visibility respects selected users, teams, sales groups, and partner organizations.
- Payout calculation includes conversions from all logins under the same partner organization.
- Payout cycle compute/approve/hold/release/mark-paid/invoice actions work.
- Gamification participant targeting respects users, teams, sales groups, and partner organizations.
- Rules use dropdown/selectors wherever possible instead of raw text IDs.
- Points ledger, leaderboard, rewards, and redemption workflows work.

### Communications

- SMTP provider can be configured and a test message can be queued/sent.
- WhatsApp provider can be configured and a test message can be queued/sent.
- SMS provider can be configured and a test message can be queued/sent.
- Webhooks validate tenant/channel and do not expose secrets in logs.

## Performance Review Notes

- Build succeeds with 160 app routes.
- Dashboard widget endpoints should be watched under real demo data volume; previous logs showed some widget requests taking 2-3 seconds.
- Report endpoints with heavy joins/rollups should use precomputed rollups where available.
- `decorateOpportunities` currently relies on batched joins and related maps; keep checking list limits so friendly-name decoration does not miss records in tenants with more than the current lead fetch window.
- Add database indexes for any slow production query identified by `EXPLAIN ANALYZE` after importing demo/real data.
- API client debug logs are now disabled unless `NEXT_PUBLIC_API_DEBUG=true`, reducing browser console noise and client-side overhead.

## Worker Inventory

The app currently has one worker entrypoint: `npm run worker`, which runs `tsx scripts/worker.ts`.

The worker is now BullMQ-backed and requires Redis through `REDIS_URL`. It registers repeatable jobs with `WORKER_REPEAT_MS`, defaulting to 60 seconds, and consumes one-off jobs from the `crm-jobs` queue.

The repeatable jobs execute these server processors directly, without browser polling or API self-calls:

- `automation.processDue`: `processDueAutomationJobs(50)`.
- `tasks.processReminders`: `processDueTaskReminders()`.
- `reports.processRollups`: `processPendingReportRefreshJobs(25)`.
- `reports.processSchedules`: `processDueReportSchedules()`.
- `communications.processDue`: `processCommunicationOutbox(50)`.
- `exports.process`: one-off export generation through `processExportRequest(exportRequestId)`.

Runtime note:
- Public/manual cron endpoints remain secret-protected for emergency/manual triggering, but routine execution should happen through the BullMQ worker.
- Automation processing is now worker-driven globally; the old browser `setInterval` due-job trigger was removed.
- Browser notification polling was removed. The app now uses an authenticated SSE connection backed by Postgres `LISTEN/NOTIFY`; the only remaining notification interval is an SSE heartbeat, not data polling.
- Export request history is available at `/dashboard/exports`; users can queue CSV exports, see status, and download completed files.
- Export creation now starts from the respective module/report/form/payout pages; `/dashboard/exports` is request history and download only.
- Local Redis runtime smoke passed with Redis running locally and `npm run worker` completing repeatable jobs.

## Security Review Notes

- Direct Postgres parameterization is used in the query builders reviewed in this pass.
- Reporting query builder should remain structured JSON to parameterized SQL only; do not accept raw SQL from UI.
- Public form and webhook routes need rate limiting and strict validation before VPS exposure.
- Communication provider credentials must be encrypted or stored using VPS secret management; never log raw provider config.
- Keep platform admin routes separate from tenant admin routes.
- Cron and provider webhook endpoints now fail closed when required shared secrets are missing.
- Inbound lead and telephony webhooks now require `WEBHOOK_SIGNING_SECRET`.
- Notification SSE now requires an authenticated user.

## Reliability Review Notes

- Worker endpoints are required for reminders, automations, communications, and report schedules.
- Add health checks for frontend, API, database connectivity, and worker liveness.
- Add database backup and restore drill before production cutover.
- Use transaction boundaries for payout compute, payout status transitions, and bulk automation enrollment.
- Keep audit logs for high-value actions: role changes, payouts, partner login changes, scoring configuration, automation activation, integrations, and report exports.

## Documentation Updates Needed

- [x] Update `09_DIRECT_POSTGRES_VPS_MIGRATION_PLAN.md` vocabulary from "pipelines/stages" to "opportunity types/stages".
- [x] Update demo script data that still used pipeline wording.
- [x] Add migration to rename existing `Sales Pipeline` and `Fee Pipeline` data.
- Re-export `SCHEMA.md` after the latest migrations are applied to local/VPS Postgres.
