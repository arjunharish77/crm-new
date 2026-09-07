-- Priority Module 9 -- Data Platform, Governance: scheduled data-quality scorecards.
-- Append-only snapshots of the data-quality report, written on a recurring schedule
-- (dataQuality.processScheduledScan in scripts/worker.ts) so quality trends over time
-- are visible, not just a single point-in-time read on demand.

create table if not exists "DataQualityScorecard" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "generatedAt" timestamptz not null default now(),
  "staleDays" integer not null default 30,
  totals jsonb not null default '{}',
  issues jsonb not null default '[]',
  "createdAt" timestamptz not null default now()
);

create index if not exists "DataQualityScorecard_tenantId_generatedAt_idx"
  on "DataQualityScorecard" ("tenantId", "generatedAt" desc);
