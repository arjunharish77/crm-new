-- Priority Module 16 -- Marketplace and App Ecosystem: two-way sync engine.
-- Confirmed decision: real two-way sync is needed (field mapping, conflict resolution,
-- scheduled sync), not just the existing push (real-time webhook events) + pull (on-demand
-- authenticated API) an installed app already had. This closes "installed app settings pages"
-- (provider credentials, field mapping, sync direction, sync cadence, default ownership,
-- conflict resolution, failure notifications, per-module enablement) plus the "sync job
-- contract"/"sync dry run"/"mapping validation"/"sync counts" sub-items of three other
-- bullets that were previously marked not-applicable pending exactly this.
--
-- Scope, stated up front: CRM_TO_APP sync is a scheduled, field-mapped RECONCILIATION push
-- (distinct from the existing real-time event bus -- catches drift/missed events, not just
-- reacts to them) sent to the app's own webhookUrl. APP_TO_CRM sync is NOT a CRM-initiated
-- pull (no app-exposed "list records" endpoint exists for the CRM to call) -- it's field
-- mapping + default ownership + conflict resolution applied to the app's own existing
-- inbound-API writes (POST to create, and a new PATCH to update, both /api/v1/apps/**).

create table if not exists "TenantAppSyncConfig" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "installId" text not null references "TenantAppInstall"(id) on delete cascade,
  "syncDirection" text not null default 'CRM_TO_APP' check ("syncDirection" in ('CRM_TO_APP','APP_TO_CRM','BIDIRECTIONAL')),
  "syncCadenceMinutes" integer,
  "enabledModules" text[] not null default '{}',
  "defaultOwnerId" text references "User"(id),
  "conflictResolution" text not null default 'CRM_WINS' check ("conflictResolution" in ('CRM_WINS','APP_WINS','NEWEST_WINS')),
  "notifyOnFailure" boolean not null default true,
  "lastSyncedAt" timestamptz,
  "lastSyncStatus" text check ("lastSyncStatus" in ('OK','FAILED')),
  "lastSyncError" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("installId")
);

create table if not exists "TenantAppFieldMapping" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "installId" text not null references "TenantAppInstall"(id) on delete cascade,
  module text not null check (module in ('leads', 'opportunities')),
  "crmField" text not null,
  "appField" text not null,
  "createdAt" timestamptz not null default now(),
  unique ("installId", module, "crmField")
);

create table if not exists "TenantAppSyncRun" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "installId" text not null references "TenantAppInstall"(id) on delete cascade,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  "recordsSynced" integer not null default 0,
  "errorMessage" text,
  "createdAt" timestamptz not null default now()
);

create index if not exists "TenantAppSyncRun_install_idx" on "TenantAppSyncRun" ("installId", "createdAt" desc);
create index if not exists "TenantAppSyncConfig_due_idx" on "TenantAppSyncConfig" ("syncCadenceMinutes") where "syncCadenceMinutes" is not null;

alter table "TenantAppUsage" add column if not exists "syncCount" integer not null default 0;
