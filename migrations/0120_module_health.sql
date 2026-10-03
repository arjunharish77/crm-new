-- Module health badges (Module 21; decisions confirmed 2026-09-29):
--   * platform admins see every tenant's module health; tenant admins see their own on
--     Settings -> Modules with a plain next step;
--   * a failing connector or backed-up work sends tenant and platform admins one in-app notice per
--     module per day; setup-incomplete and stale data only show the badge.
-- Single-tenant pages compute health live (and refresh the snapshot); the modules.processHealth
-- worker job refreshes snapshots for every active tenant so the cross-tenant view needs no
-- per-tenant fan-out at request time.

create table if not exists "TenantModuleHealth" (
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "moduleKey" text not null references "PlatformModule"("key") on delete cascade,
  state text not null check (state in (
    'HEALTHY', 'SETUP_INCOMPLETE', 'CONNECTOR_FAILING', 'WORKER_BACKLOG', 'STALE_DATA',
    'DISABLED_BY_DEPENDENCY', 'SUSPENDED', 'TRIAL_EXPIRED', 'DISABLED', 'NOT_AVAILABLE'
  )),
  issues jsonb not null default '[]'::jsonb,
  "checkedAt" timestamptz not null default now(),
  primary key ("tenantId", "moduleKey")
);

-- Cross-tenant view lists only unhealthy rows; the worker picks the tenants checked longest ago.
create index if not exists "TenantModuleHealth_state_idx" on "TenantModuleHealth" (state, "checkedAt");
create index if not exists "TenantModuleHealth_checked_idx" on "TenantModuleHealth" ("tenantId", "checkedAt");

-- One row per (module, problem kind, tenant-local day) already notified.
create table if not exists "TenantModuleHealthAlert" (
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "moduleKey" text not null,
  kind text not null check (kind in ('CONNECTOR_FAILING', 'WORKER_BACKLOG')),
  day text not null check (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "sentAt" timestamptz not null default now(),
  primary key ("tenantId", "moduleKey", kind, day)
);

-- Backlog checks look for overdue rows per tenant; these had no tenant-leading due index.
-- (CommunicationOutbox, WebhookOutbox, AutomationQueue, ReportSchedule, ReportRefreshState and
-- Case."resolutionDueAt" already do.)
create index if not exists "TenantAppDelivery_tenant_status_retry_idx" on "TenantAppDelivery" ("tenantId", status, "nextRetryAt");
create index if not exists "TelephonyCallLog_tenant_recording_expiry_idx" on "TelephonyCallLog" ("tenantId", "recordingExpiresAt") where "recordingUrl" is not null;
create index if not exists "Case_tenant_first_response_due_idx" on "Case" ("tenantId", "firstResponseDueAt") where "firstRespondedAt" is null;

alter table "TenantModuleHealth" enable row level security;
alter table "TenantModuleHealthAlert" enable row level security;
drop policy if exists tenant_isolation_tenant_module_health on "TenantModuleHealth";
create policy tenant_isolation_tenant_module_health on "TenantModuleHealth"
  using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
drop policy if exists tenant_isolation_tenant_module_health_alert on "TenantModuleHealthAlert";
create policy tenant_isolation_tenant_module_health_alert on "TenantModuleHealthAlert"
  using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
