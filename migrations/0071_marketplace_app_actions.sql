-- Priority Module 16 -- Marketplace and App Ecosystem, Phase 3: app-backed automation nodes.
-- An installed app's owning tenant declares safe, named "actions" with a schema-defined input
-- list (each field optionally dropdown-backed via a fixed `options` list); an installing
-- tenant's automation builder can then call one as a workflow action node, gated by the same
-- TenantAppPermissionGrant("automations", "write") scope every other app-permission surface in
-- this module already checks. MarketplaceAppActionRun is the runtime audit log the checklist
-- item asks for -- one row per invocation, independent of automation-execution history, so an
-- app's action activity is reviewable even if the triggering automation run is later deleted.
create table if not exists "MarketplaceAppAction" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  "inputSchema" jsonb not null default '[]',
  "isActive" boolean not null default true,
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("appId", key)
);

create table if not exists "MarketplaceAppActionRun" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  "actionKey" text not null,
  "automationId" text,
  input jsonb,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  "httpStatus" integer,
  "responseBody" text,
  "errorMessage" text,
  "createdAt" timestamptz not null default now()
);

create index if not exists "MarketplaceAppAction_app_idx" on "MarketplaceAppAction" ("appId", "isActive");
create index if not exists "MarketplaceAppActionRun_tenant_idx" on "MarketplaceAppActionRun" ("tenantId", "appId", "createdAt" desc);
