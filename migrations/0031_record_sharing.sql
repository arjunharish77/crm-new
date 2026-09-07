-- Record sharing for Leads and Opportunities: today visibility is governed purely by
-- ownerId + Role.permissions.recordAccess (OWN/TEAM/ALL) -- there is no way to grant an
-- individual user or team explicit access to one specific record beyond that. One row per
-- (tenant, recordType, recordId), keyed the same way "RecordScore" already keys cross-object
-- concerns off (recordType, recordId), rather than a separate LeadShare/OpportunityShare
-- table per module. Scoped to Users + Teams only (not sales groups/roles, unlike Saved View
-- sharing) -- that covers the real-world "share with a person or their team" case without
-- adding two more target types on day one.
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "RecordShare" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "sharedUserIds" text[] not null default '{}',
  "sharedTeamIds" text[] not null default '{}',
  "createdBy" text references "User"("id"),
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "recordType", "recordId")
);

create index if not exists "RecordShare_lookup_idx" on "RecordShare" ("tenantId", "recordType", "recordId");

alter table "RecordShare" enable row level security;
create policy "tenant_isolation_record_share" on "RecordShare"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
