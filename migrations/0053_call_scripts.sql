-- Priority Module 15 -- Telephony: call scripts and guidance.
-- Confirmed by audit before building: there is no "course" entity, custom field, or
-- OpportunityType-as-course convention anywhere in this codebase (grepped the whole src/ tree
-- and base-schema.sql -- the only two hits were cosmetic placeholder/example text, not real
-- data). "Course" is reinterpreted here as `opportunityTypeId` -- the closest real, matchable
-- dimension to "what product/course is this deal about" in this data model -- documented
-- explicitly rather than inventing a fake Course table just to satisfy the checklist's wording
-- literally.

create table if not exists "CallScript" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  name text not null,
  "matchConditions" jsonb not null default '{"conditions": [], "conditionLogic": "AND"}',
  content text not null default '',
  "objectionHandling" jsonb not null default '[]',
  "complianceLines" jsonb not null default '[]',
  "isActive" boolean not null default true,
  "order" integer not null default 0,
  version integer not null default 1,
  "createdBy" text,
  "updatedBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- Script versioning: a real history table (mirroring RecordScoreHistory's own precedent for
-- keeping a full audit trail of a config-ish thing changing over time), not just an array on
-- the current row -- lets an admin actually browse/compare past versions with who-changed-it
-- metadata, not just see that a change happened.
create table if not exists "CallScriptVersion" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "scriptId" text not null references "CallScript"(id) on delete cascade,
  version integer not null,
  name text not null,
  content text not null,
  "objectionHandling" jsonb not null default '[]',
  "complianceLines" jsonb not null default '[]',
  "matchConditions" jsonb not null default '{}',
  "createdBy" text,
  "createdAt" timestamptz not null default now()
);
create index if not exists "CallScriptVersion_script_idx" on "CallScriptVersion" ("tenantId", "scriptId", version desc);
