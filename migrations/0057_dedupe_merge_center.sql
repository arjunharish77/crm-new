-- Priority Module 9 -- Data Platform, Integrations, and Governance: dedupe and merge center.
-- Confirmed by audit before building: no merge capability of any kind exists anywhere in this
-- codebase (grep for "merge"/"MergedInto"/"DuplicateOf" across schema and src turned up nothing
-- related). "Partner" is not its own table -- every partner-shaped table FKs to User(id) with an
-- isPartner flag, so a "Partner merge" is a User merge, not a fourth entity type; Leads and
-- Opportunities are the two entity types where merge is unambiguously meaningful and mechanically
-- tractable in this schema. Users are scoped out of this pass (see checklist prose) because two of
-- their money-adjacent tables (CommissionLedger, GamificationPointsLedger) are enforced append-only
-- by DB triggers (prevent_commission_ledger_mutation/prevent_gamification_ledger_mutation) and
-- cannot be repointed via a plain UPDATE.
--
-- Design: a SOFT merge, not a hard delete. The losing record's row survives (flagged via
-- mergedIntoId/mergedAt) rather than being deleted -- this sidesteps every append-only/RESTRICT
-- foreign-key concern entirely (nothing needs to reference-count before deleting a row that still
-- exists) and is what makes "unmerge where feasible" tractable: MergeAudit stores the exact ids of
-- every child row that got repointed, so a real per-row reversal is possible for straightforward
-- 1:1 FK tables (Activity, Task, FormSubmission, Note, FileObject, EmailLog, CommunicationOutbox,
-- TelephonyCallLog, Opportunity.leadId), not just a "trust us" audit note.

create table if not exists "DedupeMatchRule" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "entityType" text not null check ("entityType" in ('LEAD','OPPORTUNITY')),
  "ruleType" text not null check ("ruleType" in ('EXACT_EMAIL','EXACT_PHONE','FUZZY_NAME')),
  threshold numeric,
  "isActive" boolean not null default true,
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "entityType", "ruleType")
);

create table if not exists "DedupeMatch" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "entityType" text not null check ("entityType" in ('LEAD','OPPORTUNITY')),
  "recordIds" text[] not null,
  "matchedRuleType" text not null,
  "matchScore" numeric,
  status text not null default 'PENDING' check (status in ('PENDING','MERGED','DISMISSED')),
  "dismissedBy" text,
  "dismissedAt" timestamptz,
  "resolvedMergeAuditId" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "entityType", "recordIds")
);

create index if not exists "DedupeMatch_tenant_status_idx" on "DedupeMatch" ("tenantId", "entityType", status);

create table if not exists "MergeAudit" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "entityType" text not null check ("entityType" in ('LEAD','OPPORTUNITY')),
  "survivorId" text not null,
  "loserId" text not null,
  "loserSnapshot" jsonb not null,
  "survivorSnapshotBefore" jsonb not null,
  "fieldChoices" jsonb not null default '{}',
  "repointedRows" jsonb not null default '[]',
  "mergedBy" text not null,
  "unmergedAt" timestamptz,
  "unmergedBy" text,
  "createdAt" timestamptz not null default now()
);

create index if not exists "MergeAudit_tenant_idx" on "MergeAudit" ("tenantId", "entityType", "survivorId");

alter table "Lead" add column if not exists "mergedIntoId" text references "Lead"(id) on delete set null;
alter table "Lead" add column if not exists "mergedAt" timestamptz;
alter table "Opportunity" add column if not exists "mergedIntoId" text references "Opportunity"(id) on delete set null;
alter table "Opportunity" add column if not exists "mergedAt" timestamptz;

create index if not exists "Lead_mergedIntoId_idx" on "Lead" ("tenantId", "mergedIntoId");
create index if not exists "Opportunity_mergedIntoId_idx" on "Opportunity" ("tenantId", "mergedIntoId");
