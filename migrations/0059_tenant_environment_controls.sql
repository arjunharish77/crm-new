-- Priority Module 9 -- Data Platform, Integrations, and Governance: tenant environment controls.
-- Confirmed by audit before building: changeTenantStatus (auth-admin-postgres.ts) and its two
-- real API routes (/api/platform-admin/tenants/[id]/suspend and .../unsuspend) already existed
-- and update Tenant.status to 'SUSPENDED' -- but nothing anywhere (getCurrentUser, the login
-- route) ever actually checked that status. A "suspended" tenant's users could log in and use
-- the app exactly as before; the control was cosmetic. Fixed in code alongside this migration,
-- not by this migration itself (no schema change needed for that fix).

-- Seed/test data labeling, scoped at the tenant level (a whole tenant is production, sandbox,
-- or test, matching how "environment controls" is framed here) rather than per-record, which
-- would need a label on every single table.
alter table "Tenant" add column if not exists environment text not null default 'PRODUCTION'
  check (environment in ('PRODUCTION', 'SANDBOX', 'TEST'));

-- Maintenance banner -- distinct from suspension (which blocks access outright): a tenant can
-- be fully usable but flagged with an informational banner (e.g. "scheduled maintenance
-- tonight 10pm-11pm IST", "data migration in progress, some numbers may be temporarily off").
alter table "TenantConfig" add column if not exists "maintenanceActive" boolean not null default false;
alter table "TenantConfig" add column if not exists "maintenanceMessage" text;
