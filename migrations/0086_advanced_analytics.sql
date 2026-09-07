-- Gap checklist Module 17 (Advanced Analytics and BI Layer). Closes a real, buildable core of
-- the 19 previously-unbuilt items on top of the substantial reporting/dashboard/rollup
-- infrastructure already in this codebase (inbuilt reports, custom-report-builder,
-- DashboardWidget, report rollups/schedules) -- deliberately NOT attempting a from-scratch
-- semantic metric layer, anomaly detection, forecasting, or a formula-builder for calculated
-- fields in this pass (documented per-bullet in the checklist why those stay unbuilt).
-- No RLS policy added, matching the precedent set by every migration since 0080: tenant
-- scoping is enforced at the application query layer.

-- ---------------------------------------------------------------------------------------------
-- Dashboard sharing (item 3's "sharing" sub-item). DashboardWidget rows are per-user today
-- (hard-scoped `where "userId" = $1`, un-shareable by construction) -- this widens that to an
-- opt-in visibility scope without changing the existing private default.
-- ---------------------------------------------------------------------------------------------
alter table "DashboardWidget" add column if not exists visibility text not null default 'PRIVATE'
  check (visibility in ('PRIVATE', 'TEAM', 'TENANT'));
alter table "DashboardWidget" add column if not exists "sharedWithTeamId" uuid references "Team"(id) on delete set null;
create index if not exists "DashboardWidget_visibility_idx" on "DashboardWidget" ("tenantId", visibility);

-- ---------------------------------------------------------------------------------------------
-- Analytics annotations (item 21) -- mark campaigns/events/outages/policy changes/intake and
-- fee deadlines/launch dates on charts for context. `occurredAt` is a date (not a timestamp):
-- annotations mark a day on a time-series chart, not a precise instant.
-- ---------------------------------------------------------------------------------------------
create table if not exists "ReportAnnotation" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  label text not null,
  description text,
  category text not null check (category in
    ('CAMPAIGN', 'EVENT', 'OUTAGE', 'POLICY_CHANGE', 'INTAKE_DEADLINE', 'FEE_DEADLINE', 'LAUNCH', 'OTHER')),
  "occurredAt" date not null,
  "createdBy" text references "User"(id),
  "createdAt" timestamptz not null default now()
);
create index if not exists "ReportAnnotation_tenant_date_idx" on "ReportAnnotation" ("tenantId", "occurredAt" desc);
