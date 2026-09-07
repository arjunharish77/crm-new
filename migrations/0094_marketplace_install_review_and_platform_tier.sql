-- Gap checklist Module 16 -- two sub-items, both built per explicit user decisions:
--
-- 1. "Add app install approval workflow": the one remaining named sub-item, "security
--    review"/"permission review" as a tracked, auditable step, not just an approver's implicit
--    glance at requested permissions before clicking Approve.
--
-- 2. "Add scoped app permissions": "platform-admin-only restricted capabilities" -- per explicit
--    user decision, ANY write-scope permission (not just the previously-flagged "sensitive" set)
--    requires platform-admin sign-off, separate from a tenant admin's own install/upgrade
--    approval. Read-only grants stay tenant-admin-approvable, unchanged.

alter table "TenantAppInstall" add column if not exists "reviewState" text not null default 'PENDING' check ("reviewState" in ('PENDING', 'REVIEWED'));
alter table "TenantAppInstall" add column if not exists "reviewComment" text;
alter table "TenantAppInstall" add column if not exists "reviewedBy" text references "User"(id) on delete set null;
alter table "TenantAppInstall" add column if not exists "reviewedAt" timestamptz;

-- Write-scope permissions awaiting platform-admin sign-off -- deliberately a SEPARATE column
-- from the pre-existing "pendingPermissions" (which stays tenant-admin-approvable and, from this
-- migration forward, only ever holds read-only escalations by construction). Used both at
-- initial install (a write-scope request materializes read-only grants immediately but stages
-- write grants here) and at upgrade time (updateMarketplaceApp's existing escalation-diff logic,
-- extended to route write additions here instead of the tenant-admin-approvable column).
alter table "TenantAppInstall" add column if not exists "pendingPlatformPermissions" jsonb;
