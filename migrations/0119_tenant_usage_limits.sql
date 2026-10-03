-- Per-tenant usage limits (Module 21; decisions confirmed 2026-09-29):
--   * four limits: active internal users, active partner logins, file storage, monthly messages;
--   * NULL = unlimited (the default for every existing and new tenant until a platform admin sets
--     a value -- nothing changes for anyone on deploy);
--   * tenant and platform admins are warned at 80% and 100%; at 100% only new usage is refused.
-- The pre-existing TenantFeature."maxUsers"/"maxStorage" (defaults 10/5000, never enforced) and
-- TenantConfig."userLimit"/"storageQuota" (display-only) are deliberately NOT reused: enforcing
-- them would silently cap every existing tenant at their defaults.

create table if not exists "TenantUsageLimit" (
  "tenantId" text primary key references "Tenant"(id) on delete cascade,
  "maxActiveUsers" integer check ("maxActiveUsers" is null or "maxActiveUsers" > 0),
  "maxPartnerLogins" integer check ("maxPartnerLogins" is null or "maxPartnerLogins" >= 0),
  "maxStorageMb" integer check ("maxStorageMb" is null or "maxStorageMb" > 0),
  "maxMonthlyMessages" integer check ("maxMonthlyMessages" is null or "maxMonthlyMessages" >= 0),
  "updatedBy" text references "User"(id),
  "updatedAt" timestamptz not null default now()
);

-- Atomic per-period counters (period 'YYYY-MM' in the tenant's time zone for monthly messages).
-- Incrementing with "count < limit" in one statement makes the monthly cap race-free and O(1)
-- per send, instead of re-counting the outbox on every message.
create table if not exists "TenantUsageCounter" (
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  metric text not null check (metric in ('MONTHLY_MESSAGES')),
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  count integer not null default 0 check (count >= 0),
  primary key ("tenantId", metric, period)
);

-- One row per (metric, period, threshold) already notified, so each 80%/100% notice is sent once
-- per period (per month for messages; re-armed for seats/storage once usage drops below it).
create table if not exists "TenantUsageAlert" (
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  metric text not null check (metric in ('ACTIVE_USERS', 'PARTNER_LOGINS', 'STORAGE', 'MONTHLY_MESSAGES')),
  period text not null,
  level integer not null check (level in (80, 100)),
  "sentAt" timestamptz not null default now(),
  primary key ("tenantId", metric, period, level)
);

alter table "TenantUsageLimit" enable row level security;
alter table "TenantUsageCounter" enable row level security;
alter table "TenantUsageAlert" enable row level security;
drop policy if exists tenant_isolation_tenant_usage_limit on "TenantUsageLimit";
create policy tenant_isolation_tenant_usage_limit on "TenantUsageLimit"
  using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
drop policy if exists tenant_isolation_tenant_usage_counter on "TenantUsageCounter";
create policy tenant_isolation_tenant_usage_counter on "TenantUsageCounter"
  using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
drop policy if exists tenant_isolation_tenant_usage_alert on "TenantUsageAlert";
create policy tenant_isolation_tenant_usage_alert on "TenantUsageAlert"
  using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
