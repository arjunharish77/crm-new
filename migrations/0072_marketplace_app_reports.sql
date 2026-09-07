-- Priority Module 16 -- Marketplace and App Ecosystem, Phase 3 (second half): app-backed
-- report datasets. An installed app's owning tenant declares a named report dataset with a
-- column schema (name/label/type per column -- the "validated schema" the checklist item
-- names); an installing tenant can fetch its rows, gated by the same
-- TenantAppPermissionGrant("reports", "read") scope every other app-permission surface in this
-- module already checks. MarketplaceAppReportCache is the "cached rollups where needed" half:
-- a live fetch only happens once "cacheTtlMinutes" has elapsed since the last successful fetch
-- for that (tenant, app, report) triple, not on every page view.
create table if not exists "MarketplaceAppReport" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  "columnSchema" jsonb not null default '[]',
  "cacheTtlMinutes" integer not null default 15,
  "isActive" boolean not null default true,
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("appId", key)
);

create table if not exists "MarketplaceAppReportCache" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  "reportKey" text not null,
  rows jsonb,
  status text not null default 'OK' check (status in ('OK', 'ERROR')),
  "errorMessage" text,
  "fetchedAt" timestamptz not null default now(),
  "expiresAt" timestamptz not null,
  unique ("tenantId", "appId", "reportKey")
);

create index if not exists "MarketplaceAppReport_app_idx" on "MarketplaceAppReport" ("appId", "isActive");
