-- SCIM 2.0 user/group provisioning (gap checklist: "Add SCIM/user lifecycle management").
-- "externalId" is the IdP's own correlation id for a User/Group (SCIM's standard optional
-- attribute) -- nullable since manually-created records have none, unique per tenant where
-- present so an IdP's repeated PUT/PATCH against the same external identity resolves to the
-- same row rather than creating duplicates.
alter table "User" add column if not exists "externalId" text;
alter table "Team" add column if not exists "externalId" text;

-- "role/team/sales-group mapping": a SCIM Group maps 1:1 onto an existing Team (the closest
-- native concept to an IdP group -- a named collection of users). These two columns are the
-- actual mapping mechanism: when a user's SCIM group membership changes (added to this Team),
-- the Team's configured default Role/SalesGroup, if any, is applied to that user automatically.
-- Both nullable -- a Team with neither configured behaves exactly as a plain membership-only
-- group, matching the "no mapping configured" case honestly rather than forcing a choice.
alter table "Team" add column if not exists "defaultRoleId" text references "Role"(id);
alter table "Team" add column if not exists "defaultSalesGroupId" text references "SalesGroup"(id);

create unique index if not exists "User_tenant_externalId_key" on "User" ("tenantId", "externalId") where "externalId" is not null;
create unique index if not exists "Team_tenant_externalId_key" on "Team" ("tenantId", "externalId") where "externalId" is not null;

-- Reconciliation-report data source: one row per SCIM-driven mutation, independent of
-- AuditLog (whose userId is NOT NULL and FK'd to a real User -- a SCIM client acting via an
-- API key has no such row to attribute to). "resourceId" is intentionally not FK'd -- a synced
-- user/group can be deleted later and the sync history should survive that, matching this
-- codebase's existing precedent (e.g. ExternalPushAttempt's nullable, on-delete-set-null FKs)
-- rather than blocking deletes or losing history.
create table if not exists "ScimSyncLog" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "resourceType" text not null check ("resourceType" in ('USER', 'GROUP')),
  "resourceId" text,
  action text not null check (action in ('CREATE', 'UPDATE', 'DEACTIVATE', 'DELETE', 'MEMBERSHIP_CHANGE')),
  payload jsonb,
  status text not null check (status in ('SUCCESS', 'ERROR')),
  "errorMessage" text,
  "createdAt" timestamptz not null default now()
);

create index if not exists "ScimSyncLog_tenant_idx" on "ScimSyncLog" ("tenantId", "createdAt" desc);
