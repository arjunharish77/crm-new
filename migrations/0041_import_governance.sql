-- Priority Module 9 -- Data Platform, Governance: import governance.
-- CSV import moves from synchronous (run entirely inside the POST request, blocking on
-- every row) to worker-backed async processing, gains staged validation/preview,
-- cooperative cancel, an approval gate for destructive (duplicateMode=UPDATE) imports,
-- and reusable column-mapping templates.

alter table "ImportJob"
  add column if not exists rows jsonb,
  add column if not exists "cancelRequested" boolean not null default false;

create table if not exists "ImportTemplate" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  name text not null,
  module text not null,
  mapping jsonb not null default '[]',
  "duplicateMode" text not null default 'SKIP',
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);
