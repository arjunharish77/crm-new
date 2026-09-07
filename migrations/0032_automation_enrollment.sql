-- Bulk enrollment: manually run an Automation's workflow for a batch of existing Lead/
-- Opportunity records, bypassing the normal event-trigger matching. No enrollment mechanism
-- existed before this at all. Modeled on ImportJob's row-lifecycle (insert PROCESSING up
-- front, per-item try/catch accumulates counts/errors, update to a final status) since that's
-- this codebase's existing "batch job with tracking" precedent -- AutomationExecution already
-- exists per individual run but has no concept of a parent batch.
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "AutomationEnrollmentJob" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "automationId" text not null references "AutomationV2"("id") on delete cascade,
  "entityType" text not null check ("entityType" in ('LEAD', 'OPPORTUNITY')),
  "totalRecords" integer not null default 0,
  "processed" integer not null default 0,
  "succeeded" integer not null default 0,
  "failed" integer not null default 0,
  "status" text not null default 'PROCESSING' check ("status" in ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS')),
  "errors" jsonb not null default '[]',
  "createdBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp,
  "completedAt" timestamp with time zone
);

create index if not exists "AutomationEnrollmentJob_automation_idx" on "AutomationEnrollmentJob" ("tenantId", "automationId", "createdAt" desc);
