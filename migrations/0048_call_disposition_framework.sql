-- Priority Module 15 -- Telephony: call disposition framework.
-- Confirmed by direct audit before building: the only pre-existing "disposition" concept in
-- this codebase is the Telephony settings page's callDispositionUrl/callDispositionTemplate,
-- which pushes ONE existing lead field to the external provider after a call -- not a CRM-side
-- disposition taxonomy. There was no disposition group/outcome table, no "reason lost" field
-- anywhere (Opportunity only has stage-level isWon/isClosed booleans), no agent-asserted
-- "interest level" field (RecordScore.scoreBand is a different, system-computed signal), and
-- no outcome column on TelephonyCallLog (its "status" is the provider connect-status, not an
-- agent-chosen disposition). This migration adds real, tenant-configurable storage for all of
-- it, modeled on OpportunityType/StageDefinition's parent-child shape (the closest existing
-- tenant-taxonomy pattern in this app) rather than inventing a new one.

create table if not exists "DispositionGroup" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  name text not null,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);

-- "requiredFields" is a jsonb array of field-key strings drawn from a fixed, known set
-- (reasonLost/interestLevel/nextAction/callbackAt/notes) rather than a full FieldDefinition/
-- CustomFieldManager registration -- the checklist's "mandatory fields by disposition" refers
-- to which of a disposition's own built-in capture fields are required for a given outcome,
-- not a general custom-field system, so this stays a lightweight config column instead of
-- pulling in the heavier custom-field machinery for something that isn't actually extensible
-- per-tenant beyond this fixed set.
-- "parentOutcomeId" self-references to model sub-outcomes as a second level under an outcome,
-- rather than a separate third table -- Postgres treats NULLs as distinct for the unique
-- constraint below, so top-level outcomes (parentOutcomeId is null) and sub-outcomes under
-- different parents can freely reuse the same name within a group.
create table if not exists "DispositionOutcome" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "groupId" text not null references "DispositionGroup"(id) on delete cascade,
  "parentOutcomeId" text references "DispositionOutcome"(id) on delete cascade,
  name text not null,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "requiredFields" jsonb not null default '[]',
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "groupId", "parentOutcomeId", name)
);
create index if not exists "DispositionOutcome_group_idx" on "DispositionOutcome" ("tenantId", "groupId");
create index if not exists "DispositionOutcome_parent_idx" on "DispositionOutcome" ("tenantId", "parentOutcomeId");

-- The actual per-call record an agent creates by selecting a disposition. "dispositionOutcomeId"
-- uses on delete set null (not restrict/cascade) so deleting an outcome from the admin config
-- later doesn't block or silently destroy call history -- matches this session's established
-- precedent for FK columns pointing at admin-configurable taxonomy rows.
-- "reasonLost" and "interestLevel" are captured here, not written back onto Opportunity/Lead --
-- Opportunity has no lost-reason column of its own today (confirmed by audit; adding one is a
-- larger, separate Opportunities-module change, not part of this telephony bullet) and
-- "interest level" is deliberately kept distinct from RecordScore.scoreBand (a system-computed
-- signal) rather than overloading that column with an agent-asserted value.
-- "taskId" links to an auto-created callback Task when callbackAt is supplied (see
-- logCallDispositionForTenant), reusing Task.dueAt/reminderAt as this app's existing
-- "do X at time Y" mechanism instead of inventing a parallel scheduling concept.
create table if not exists "CallDisposition" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "callLogId" uuid references "TelephonyCallLog"(id) on delete set null,
  "leadId" text references "Lead"(id) on delete cascade,
  "opportunityId" text references "Opportunity"(id) on delete cascade,
  "activityId" text references "Activity"(id) on delete set null,
  "dispositionOutcomeId" text references "DispositionOutcome"(id) on delete set null,
  "reasonLost" text,
  "interestLevel" text check ("interestLevel" in ('HOT', 'WARM', 'COLD')),
  "nextAction" text,
  "callbackAt" timestamptz,
  notes text,
  "taskId" text references "Task"(id) on delete set null,
  "createdBy" text,
  "createdAt" timestamptz not null default now()
);
create index if not exists "CallDisposition_lead_idx" on "CallDisposition" ("tenantId", "leadId", "createdAt" desc);
create index if not exists "CallDisposition_opportunity_idx" on "CallDisposition" ("tenantId", "opportunityId", "createdAt" desc);
create index if not exists "CallDisposition_calllog_idx" on "CallDisposition" ("tenantId", "callLogId");
