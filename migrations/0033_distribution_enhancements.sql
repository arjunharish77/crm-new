-- Distribution engine enhancements: a real default/catch-all rule flag, and a per-user
-- manual availability toggle ("away"/"check-in") the engine can respect when picking a
-- candidate. Assignment quotas and required-skill matching deliberately reuse the existing
-- "__-prefixed key inside AssignmentRule.conditions jsonb" convention already established by
-- __fallbackUserId/__roundRobinCursor (see admin-modules.ts) rather than adding more columns
-- for those -- isDefault and availability need to be real, queryable/filterable columns
-- (uniqueness-per-tenant enforcement, bulk per-user filtering during candidate selection),
-- which jsonb keys inside a different row don't support cleanly.
--
-- Run manually against the database, then re-export SCHEMA.md.

alter table "AssignmentRule" add column if not exists "isDefault" boolean not null default false;
alter table "User" add column if not exists "isAvailableForAssignment" boolean not null default true;

create index if not exists "AssignmentRule_tenant_default_idx" on "AssignmentRule" ("tenantId", "entityType", "isDefault");
