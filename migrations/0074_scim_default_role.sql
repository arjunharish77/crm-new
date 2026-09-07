-- SCIM user creation requires a Role (User."roleId" is NOT NULL), but an IdP's "create user"
-- push often arrives before any group-membership push that would otherwise supply one via a
-- Team's "defaultRoleId" (migration 0073). This is the tenant-level fallback: configured once,
-- alongside the existing "apiAccessEnabled" flag that already gates the API-key/SCIM auth path.
alter table "TenantFeature" add column if not exists "defaultScimRoleId" text references "Role"(id);
