-- Gap checklist Module 17, item 16 ("custom calculated fields/measures"). Per explicit user
-- direction: simple fixed-operator math (+ − × ÷) chaining already-defined metrics only -- no
-- free-text formulas, no expression parser/sandbox at all. Deliberately a NEW, separate table
-- from the existing (dormant) "CalculatedFieldDefinition" -- that one is a per-RECORD custom
-- field formula tied to FieldDefinition (a different, still-unbuilt feature under the Forms/
-- CRM-fields area), while this is a tenant-wide calculation chaining the Metric layer's own
-- scalar values, an unrelated concept that happens to share the word "calculated."
create table if not exists "CalculatedMetric" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  name text not null,
  description text,
  -- Ordered array of {metricId, operator}. The first step's operator is always null (it's the
  -- starting value); each later step applies its operator between the running total and that
  -- step's own metric value, left to right -- no operator precedence to worry about, matching
  -- the "no free-text formula" scope decision exactly.
  steps jsonb not null default '[]'::jsonb,
  "ownerId" text references "User"(id) on delete set null,
  visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE', 'TEAM', 'TENANT')),
  "sharedWithTeamId" uuid references "Team"(id) on delete set null,
  "createdBy" text references "User"(id) on delete set null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);
create index if not exists "CalculatedMetric_tenant_idx" on "CalculatedMetric" ("tenantId");
create index if not exists "CalculatedMetric_visibility_idx" on "CalculatedMetric" ("tenantId", visibility);
