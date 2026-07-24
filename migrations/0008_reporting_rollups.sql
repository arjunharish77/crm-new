-- Reporting & Dashboards, Step 1: report definitions, rollup freshness, and
-- refresh job tracking.
--
-- Run manually in the Supabase SQL Editor (no migration tool in this repo -- see
-- 01_SCHEMA_EXPORT_INSTRUCTIONS.md), then re-export SCHEMA.md.
--
-- This migration intentionally stores aggregate outputs as JSONB so the first
-- reporting pass can support funnel, cohort, leaderboard, payout, SLA, and data
-- quality rollups without creating a different table for every chart shape. The
-- reportKey + dimensions/metrics contract is enforced in application code.

create table if not exists "ReportDefinition" (
  "id" text primary key,
  "tenantId" text references "Tenant"("id"),
  "reportKey" text not null,
  "name" text not null,
  "description" text,
  "category" text not null default 'CUSTOM' check ("category" in (
    'FUNNEL',
    'PERFORMANCE',
    'SLA',
    'ROI',
    'REASSIGNMENT',
    'ACTIVITY',
    'PAYOUT',
    'COHORT',
    'DATA_QUALITY',
    'CUSTOM'
  )),
  "queryDefinition" jsonb not null default '{}'::jsonb,
  "visualization" jsonb not null default '{}'::jsonb,
  "isSystem" boolean not null default false,
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "reportKey")
);

-- Global system definitions are allowed with tenantId NULL, so tenant-scoped
-- uniqueness above cannot protect them because Postgres treats NULL as distinct.
create unique index if not exists "ReportDefinition_global_reportKey_idx"
  on "ReportDefinition" ("reportKey")
  where "tenantId" is null;

create index if not exists "ReportDefinition_tenantId_idx"
  on "ReportDefinition" ("tenantId", "category", "isActive");

create table if not exists "ReportRollup" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "reportKey" text not null,
  "scopeType" text not null default 'ORG' check ("scopeType" in ('ORG', 'TEAM', 'USER', 'PARTNER')),
  "scopeId" text,
  "periodStart" timestamp without time zone,
  "periodEnd" timestamp without time zone,
  "grain" text not null default 'CURRENT' check ("grain" in ('CURRENT', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM')),
  "dimensions" jsonb not null default '{}'::jsonb,
  "metrics" jsonb not null default '{}'::jsonb,
  "sourceWatermark" timestamp without time zone,
  "lastComputedAt" timestamp without time zone not null default current_timestamp,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "ReportRollup_lookup_idx"
  on "ReportRollup" ("tenantId", "reportKey", "scopeType", "scopeId", "periodStart", "periodEnd");

create index if not exists "ReportRollup_freshness_idx"
  on "ReportRollup" ("tenantId", "reportKey", "lastComputedAt" desc);

create index if not exists "ReportRollup_dimensions_gin_idx"
  on "ReportRollup" using gin ("dimensions");

create table if not exists "ReportRefreshState" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "reportKey" text not null,
  "scopeType" text not null default 'ORG' check ("scopeType" in ('ORG', 'TEAM', 'USER', 'PARTNER')),
  "scopeId" text,
  "lastStartedAt" timestamp without time zone,
  "lastCompletedAt" timestamp without time zone,
  "lastSuccessfulAt" timestamp without time zone,
  "lastSourceWatermark" timestamp without time zone,
  "status" text not null default 'STALE' check ("status" in ('FRESH', 'STALE', 'REFRESHING', 'ERROR')),
  "error" text,
  "refreshIntervalMinutes" integer not null default 15,
  "manualRefreshRequestedAt" timestamp without time zone,
  "manualRefreshRequestedBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "reportKey", "scopeType", "scopeId")
);

-- Same NULL-scope uniqueness issue as global report definitions.
create unique index if not exists "ReportRefreshState_null_scope_idx"
  on "ReportRefreshState" ("tenantId", "reportKey", "scopeType")
  where "scopeId" is null;

create index if not exists "ReportRefreshState_due_idx"
  on "ReportRefreshState" ("tenantId", "status", "lastSuccessfulAt");

create table if not exists "ReportRefreshJob" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "reportKey" text not null,
  "scopeType" text not null default 'ORG' check ("scopeType" in ('ORG', 'TEAM', 'USER', 'PARTNER')),
  "scopeId" text,
  "periodStart" timestamp without time zone,
  "periodEnd" timestamp without time zone,
  "requestedBy" text references "User"("id"),
  "reason" text not null default 'SCHEDULED' check ("reason" in ('SCHEDULED', 'MANUAL', 'BACKFILL')),
  "status" text not null default 'PENDING' check ("status" in ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
  "startedAt" timestamp without time zone,
  "completedAt" timestamp without time zone,
  "error" text,
  "createdAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "ReportRefreshJob_queue_idx"
  on "ReportRefreshJob" ("tenantId", "status", "createdAt");

create index if not exists "ReportRefreshJob_report_idx"
  on "ReportRefreshJob" ("tenantId", "reportKey", "scopeType", "scopeId", "createdAt" desc);

alter table "ReportDefinition" enable row level security;
alter table "ReportRollup" enable row level security;
alter table "ReportRefreshState" enable row level security;
alter table "ReportRefreshJob" enable row level security;

create policy "tenant_isolation_report_definition" on "ReportDefinition"
  for all using (("tenantId" = current_setting('app.tenant_id', true)) or ("tenantId" is null))
  with check (("tenantId" = current_setting('app.tenant_id', true)) or ("tenantId" is null));

create policy "tenant_isolation_report_rollup" on "ReportRollup"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_report_refresh_state" on "ReportRefreshState"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_report_refresh_job" on "ReportRefreshJob"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
