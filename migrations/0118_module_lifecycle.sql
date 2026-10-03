-- Module 21 lifecycle (decisions confirmed 2026-09-29):
--   * switching a module off pauses its live work and switching it back on restores exactly that
--     work (items a tenant paused itself stay paused)          -> "ModulePausedItem"
--   * a TRIAL has an end date; at the end date the module is SUSPENDED (data kept), together with
--     any enabled module that depends on it, after a 7-day warning -> trial columns + audit actions
--   * Create Tenant offers editable Starter / Admissions / Full bundles -> "ModuleBundle"
--   * tenant admins can see their modules and request access  -> "ModuleAccessRequest"

alter table "TenantModuleEntitlement" add column if not exists "trialEndsAt" timestamptz;
alter table "TenantModuleEntitlement" add column if not exists "trialWarningSentAt" timestamptz;

alter table "TenantModuleAuditLog" drop constraint if exists "TenantModuleAuditLog_action_check";
alter table "TenantModuleAuditLog" add constraint "TenantModuleAuditLog_action_check"
  check (action in ('ENABLED', 'DISABLED', 'SUSPENDED', 'TRIAL_STARTED', 'RETIRED', 'TRIAL_EXPIRED', 'DEPENDENCY_SUSPENDED'));

-- One row per live item a module switch-off paused. "previousState" holds exactly the column
-- values to put back; restore only happens while the item is still in "pausedState" (so a later,
-- deliberate change by someone else is never overwritten).
create table if not exists "ModulePausedItem" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "moduleKey" text not null references "PlatformModule"(key),
  "entityTable" text not null,
  "entityId" text not null,
  "previousState" jsonb not null,
  "pausedState" jsonb not null,
  "pausedAt" timestamptz not null default now(),
  "restoredAt" timestamptz
);
create unique index if not exists "ModulePausedItem_open_key" on "ModulePausedItem" ("tenantId", "entityTable", "entityId") where "restoredAt" is null;
create index if not exists "ModulePausedItem_module_idx" on "ModulePausedItem" ("tenantId", "moduleKey") where "restoredAt" is null;
alter table "ModulePausedItem" enable row level security;
drop policy if exists tenant_isolation_module_paused_item on "ModulePausedItem";
create policy tenant_isolation_module_paused_item on "ModulePausedItem"
  using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

-- Platform-wide (not tenant data): editable by platform admins without code changes.
create table if not exists "ModuleBundle" (
  key text primary key check (key ~ '^[A-Z][A-Z0-9_]{1,40}$'),
  name text not null check (length(name) between 1 and 80),
  description text,
  modules text[] not null,
  "sortOrder" integer not null default 0,
  "updatedBy" text references "User"(id),
  "updatedAt" timestamptz not null default now()
);
insert into "ModuleBundle" (key, name, description, modules, "sortOrder") values
  ('STARTER', 'Starter', 'Core CRM only: leads, lists, activities, tasks, views, dashboard and security.',
   array(select key from "PlatformModule" where "isCore"), 1),
  ('ADMISSIONS', 'Admissions', 'Starter plus opportunities, forms, automations, reports, marketing, product catalog and telephony.',
   array(select key from "PlatformModule" where "isCore" or key in ('OPPORTUNITIES', 'FORMS', 'AUTOMATIONS', 'REPORTS', 'MARKETING', 'PRODUCT_CATALOG', 'TELEPHONY')), 2),
  ('FULL', 'Full', 'Every module in the catalog.', array(select key from "PlatformModule"), 3)
on conflict (key) do nothing;

create table if not exists "ModuleAccessRequest" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "moduleKey" text not null references "PlatformModule"(key),
  "requestedBy" text not null references "User"(id),
  message text check (message is null or length(message) <= 1000),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN')),
  "createdAt" timestamptz not null default now(),
  "resolvedBy" text references "User"(id),
  "resolvedAt" timestamptz,
  "resolutionNote" text check ("resolutionNote" is null or length("resolutionNote") <= 1000)
);
create unique index if not exists "ModuleAccessRequest_pending_key" on "ModuleAccessRequest" ("tenantId", "moduleKey") where status = 'PENDING';
create index if not exists "ModuleAccessRequest_status_idx" on "ModuleAccessRequest" (status, "createdAt");
alter table "ModuleAccessRequest" enable row level security;
drop policy if exists tenant_isolation_module_access_request on "ModuleAccessRequest";
create policy tenant_isolation_module_access_request on "ModuleAccessRequest"
  using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
