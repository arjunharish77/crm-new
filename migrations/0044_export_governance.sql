-- Priority Module 9 -- Data Platform, Governance: export governance.
-- Selected-record-vs-full-view scoping, download audit logs, and per-user export history
-- already existed and worked (confirmed by reading exports.ts before assuming otherwise).
-- The 3 genuinely missing sub-items: reusable export templates, an approval gate for
-- exports that include admin-flagged sensitive fields, and expiry/cleanup for generated
-- files (previously kept forever with no TTL at all).

alter table "ExportRequest"
  add column if not exists "expiresAt" timestamptz;

create table if not exists "ExportTemplate" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  name text not null,
  "moduleName" text not null,
  filters jsonb not null default '{}',
  columns jsonb not null default '[]',
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);

create table if not exists "ExportSensitiveFieldRule" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "moduleName" text not null,
  "fieldKey" text not null,
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  unique ("tenantId", "moduleName", "fieldKey")
);
