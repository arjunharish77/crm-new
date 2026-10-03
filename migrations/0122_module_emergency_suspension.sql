-- Emergency module suspension (Module 21 VPS runbook item). A platform operator can suspend one
-- module for one tenant or for every tenant from the command line (scripts/module-emergency.ts),
-- e.g. when a module misbehaves and the admin UI cannot be used. Each affected tenant's previous
-- status is recorded so lifting the emergency puts back exactly what was there -- and only where
-- nobody changed the module in between.

create table if not exists "ModuleEmergency" (
  id text primary key,
  "moduleKey" text not null references "PlatformModule"("key"),
  reason text not null,
  "tenantNotice" text,
  "startedBy" text not null references "User"(id),
  "startedAt" timestamptz not null default now(),
  "liftedBy" text references "User"(id),
  "liftedAt" timestamptz,
  "liftReason" text
);
-- At most one open emergency per module; re-running "suspend" adds tenants to it.
create unique index if not exists "ModuleEmergency_open_module_uidx" on "ModuleEmergency" ("moduleKey") where "liftedAt" is null;

create table if not exists "ModuleEmergencyTenant" (
  "emergencyId" text not null references "ModuleEmergency"(id) on delete cascade,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  -- The emergency's module, or a dependent suspended with it (--include-dependents).
  "moduleKey" text not null references "PlatformModule"("key"),
  "previousStatus" text not null check ("previousStatus" in ('ENABLED', 'TRIAL')),
  "previousTrialEndsAt" timestamptz,
  "suspendedAt" timestamptz not null default now(),
  "restoredAt" timestamptz,
  -- Why a lift left it suspended (changed since, trial ended meanwhile, requirement now off).
  "liftOutcome" text,
  primary key ("emergencyId", "tenantId", "moduleKey")
);
create index if not exists "ModuleEmergencyTenant_open_idx" on "ModuleEmergencyTenant" ("emergencyId") where "restoredAt" is null;

-- The command runs as the platform operator across tenants; tenant-scoped reads still go through
-- RLS like the rest of the module tables.
alter table "ModuleEmergencyTenant" enable row level security;
drop policy if exists tenant_isolation_module_emergency_tenant on "ModuleEmergencyTenant";
create policy tenant_isolation_module_emergency_tenant on "ModuleEmergencyTenant"
  using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "TenantModuleAuditLog" drop constraint if exists "TenantModuleAuditLog_action_check";
alter table "TenantModuleAuditLog" add constraint "TenantModuleAuditLog_action_check"
  check (action in ('ENABLED', 'DISABLED', 'SUSPENDED', 'TRIAL_STARTED', 'RETIRED', 'TRIAL_EXPIRED', 'DEPENDENCY_SUSPENDED', 'EMERGENCY_SUSPENDED', 'EMERGENCY_LIFTED'));
