-- Priority Module 11 -- Service Desk and Case Management. Core build: case schema,
-- queue-based assignment, SLA due-date tracking, and comments. Deliberately excludes
-- (per the checklist's own scope decision for this pass) email-to-case parsing, a
-- knowledge base, macros/templates, CSAT/NPS capture, analytics rollups, merge/dedup
-- (CaseMerge), attachments (CaseAttachment), and a separate CaseSlaEvent log -- SLA
-- due/breach state lives directly on the Case row instead of a separate event table,
-- and case numbers are a plain per-tenant counter, not a dedicated sequence table.
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "CaseType" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "description" text,
  "order" integer not null default 0,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "name")
);

create table if not exists "CaseStatus" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "category" text not null check ("category" in ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED')),
  "order" integer not null default 0,
  "isDefault" boolean not null default false,
  "isClosedStatus" boolean not null default false,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "name")
);

create table if not exists "CasePriority" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "level" integer not null default 1,
  "color" text,
  "isDefault" boolean not null default false,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "name")
);

create table if not exists "CaseQueue" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "description" text,
  "isDefault" boolean not null default false,
  -- Round-robin position for queue-based assignment, persisted the same way
  -- distribution-engine.ts persists AssignmentRule.conditions.__roundRobinCursor -- a
  -- plain column here since queues have no jsonb conditions blob to piggyback on.
  "roundRobinCursor" integer not null default -1,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "name")
);

create table if not exists "CaseQueueMembership" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "queueId" text not null references "CaseQueue"("id") on delete cascade,
  "userId" text not null references "User"("id") on delete cascade,
  "createdAt" timestamp with time zone not null default now(),
  unique ("tenantId", "queueId", "userId")
);

-- Nullable caseTypeId/casePriorityId, both on delete set null: a policy scoped to a
-- since-deleted type/priority degrades to "applies more broadly" rather than the delete
-- failing or the policy silently vanishing. Resolution picks the most specific active
-- match (see resolveSlaPolicyForCase in cases-postgres.ts).
create table if not exists "CaseSlaPolicy" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "caseTypeId" text references "CaseType"("id") on delete set null,
  "casePriorityId" text references "CasePriority"("id") on delete set null,
  "firstResponseMinutes" integer not null default 60,
  "resolutionMinutes" integer not null default 1440,
  "isDefault" boolean not null default false,
  "isActive" boolean not null default true,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table if not exists "Case" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "caseNumber" integer not null,
  "subject" text not null,
  "description" text,
  "typeId" text not null references "CaseType"("id"),
  "statusId" text not null references "CaseStatus"("id"),
  "priorityId" text not null references "CasePriority"("id"),
  "queueId" text references "CaseQueue"("id"),
  "ownerId" text references "User"("id") on delete set null,
  -- The requester is deliberately not forced to be a User/Lead FK -- a service desk
  -- needs to accept cases from people who aren't a CRM record yet (this is exactly what
  -- the deferred email-to-case flow would create cases for). Free-text contact fields
  -- plus optional links into existing CRM context cover both cases.
  "requesterName" text,
  "requesterEmail" text,
  "requesterPhone" text,
  "relatedLeadId" text references "Lead"("id") on delete set null,
  "relatedOpportunityId" text references "Opportunity"("id") on delete set null,
  "relatedPartnerId" text references "PartnerProfile"("id") on delete set null,
  "slaPolicyId" text references "CaseSlaPolicy"("id") on delete set null,
  "firstResponseDueAt" timestamp with time zone,
  "resolutionDueAt" timestamp with time zone,
  "firstRespondedAt" timestamp with time zone,
  "resolvedAt" timestamp with time zone,
  "closedAt" timestamp with time zone,
  "reopenedCount" integer not null default 0,
  "resolutionNotes" text,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "caseNumber")
);

create table if not exists "CaseComment" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "caseId" text not null references "Case"("id") on delete cascade,
  "authorId" text references "User"("id") on delete set null,
  "body" text not null,
  "isInternal" boolean not null default true,
  "createdAt" timestamp with time zone not null default now()
);

-- Real per-decision assignment log, mirroring the AssignmentLog fix from the Distribution
-- Engine module -- populated from day one here rather than repeating that mistake.
create table if not exists "CaseAssignmentLog" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "caseId" text not null references "Case"("id") on delete cascade,
  "assignedToId" text references "User"("id") on delete set null,
  "assignedById" text references "User"("id") on delete set null,
  "queueId" text references "CaseQueue"("id") on delete set null,
  "reason" text,
  "assignedAt" timestamp with time zone not null default now()
);

create index if not exists "Case_tenant_status_idx" on "Case" ("tenantId", "statusId");
create index if not exists "Case_tenant_owner_idx" on "Case" ("tenantId", "ownerId");
create index if not exists "Case_tenant_queue_idx" on "Case" ("tenantId", "queueId");
create index if not exists "Case_tenant_sla_idx" on "Case" ("tenantId", "resolutionDueAt");
create index if not exists "CaseComment_case_idx" on "CaseComment" ("tenantId", "caseId", "createdAt");
create index if not exists "CaseAssignmentLog_case_idx" on "CaseAssignmentLog" ("tenantId", "caseId", "assignedAt" desc);
create index if not exists "CaseQueueMembership_queue_idx" on "CaseQueueMembership" ("tenantId", "queueId");
create index if not exists "CaseSlaPolicy_tenant_idx" on "CaseSlaPolicy" ("tenantId", "isActive");

alter table "CaseType" enable row level security;
create policy "tenant_isolation_case_type" on "CaseType"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseStatus" enable row level security;
create policy "tenant_isolation_case_status" on "CaseStatus"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CasePriority" enable row level security;
create policy "tenant_isolation_case_priority" on "CasePriority"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseQueue" enable row level security;
create policy "tenant_isolation_case_queue" on "CaseQueue"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseQueueMembership" enable row level security;
create policy "tenant_isolation_case_queue_membership" on "CaseQueueMembership"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseSlaPolicy" enable row level security;
create policy "tenant_isolation_case_sla_policy" on "CaseSlaPolicy"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "Case" enable row level security;
create policy "tenant_isolation_case" on "Case"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseComment" enable row level security;
create policy "tenant_isolation_case_comment" on "CaseComment"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "CaseAssignmentLog" enable row level security;
create policy "tenant_isolation_case_assignment_log" on "CaseAssignmentLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
