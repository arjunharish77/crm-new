-- Gap checklist Module 17, item 2 (semantic metric layer). Self-service metric authoring only:
-- pick a root + object/field + aggregation + filters + optional single groupBy dimension -- no
-- free-text formulas, no sandboxed expression evaluator. Generic against reporting-query.ts's
-- FIELD_CATALOG: any object that catalog already models (including the Task/TelephonyCallLog/
-- Case join-only satellites added in the prior pass) is usable as a metric's aggregated/
-- filtered/grouped field with zero changes needed here or in the query engine.
-- No RLS policy added, matching the precedent set by every migration since 0080: tenant
-- scoping is enforced at the application query layer.

create table if not exists "Metric" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  name text not null,
  description text,
  root text not null check (root in ('lead', 'opportunity', 'activity')),
  aggregation text not null check (aggregation in ('SUM', 'COUNT', 'AVG', 'MIN', 'MAX')),
  -- Nullable: COUNT aggregates context rows, not a specific field, so these stay null for it.
  "aggregateObject" text,
  "aggregateField" text,
  -- Array of { object, field, operator, value }, validated against FIELD_CATALOG at write time
  -- (see validateMetricDefinition in reporting-query.ts) -- same shape ReportQueryDefinition
  -- filters already use, so the two share one mental model.
  filters jsonb not null default '[]'::jsonb,
  "groupByObject" text,
  "groupByField" text,
  -- Governance fields (all four named in the checklist bullet): owner, certification status,
  -- deprecation status, permission scope (visibility/sharedWithTeamId, mirroring
  -- DashboardWidget's sharing model from this same module's earlier pass).
  "ownerId" text references "User"(id) on delete set null,
  "certificationStatus" text not null default 'UNCERTIFIED' check ("certificationStatus" in ('UNCERTIFIED', 'CERTIFIED')),
  "certifiedBy" text references "User"(id) on delete set null,
  "certifiedAt" timestamptz,
  "deprecationStatus" text not null default 'ACTIVE' check ("deprecationStatus" in ('ACTIVE', 'DEPRECATED')),
  "deprecatedReason" text,
  "deprecatedAt" timestamptz,
  visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE', 'TEAM', 'TENANT')),
  "sharedWithTeamId" uuid references "Team"(id) on delete set null,
  "createdBy" text references "User"(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);
create index if not exists "Metric_tenant_idx" on "Metric" ("tenantId");
create index if not exists "Metric_visibility_idx" on "Metric" ("tenantId", visibility);
