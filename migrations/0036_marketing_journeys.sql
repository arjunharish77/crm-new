-- Priority Module 8 -- Marketing Journey Orchestration and Attribution.
--
-- Architecture decision, deliberately deviating from the checklist's literal table list:
-- `AutomationV2.workflow` (nodes+edges jsonb) already has a fully working, already-tested
-- graph executor (branching, condition/split-test nodes, timezone-aware wait windows,
-- resume-from-queue) via `executeAutomationWorkflow`/`AutomationQueue`. Rather than
-- duplicate that engine with new `MarketingJourneyNode`/`MarketingJourneyEdge` tables, a
-- Journey *wraps* one `AutomationV2` row for its actual workflow -- this schema only adds
-- what Automations don't already have: audience-based bulk enrollment, lifecycle/
-- versioning, attribution capture, and a preference center. No `MarketingJourneyStepRun`/
-- `MarketingExperiment` tables either -- step execution already has `AutomationQueue`,
-- and A/B branching already has the `split_test` node type.
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "MarketingJourney" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "automationId" text not null references "AutomationV2"("id"),
  "name" text not null,
  "description" text,
  "targetModule" text not null check ("targetModule" in ('LEAD', 'OPPORTUNITY')),
  "status" text not null default 'DRAFT' check ("status" in ('DRAFT', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  "audienceType" text not null default 'LEAD_LIST' check ("audienceType" in ('LEAD_LIST', 'SAVED_VIEW', 'MANUAL')),
  "audienceConfig" jsonb not null default '{}',
  "continuousEnrollment" boolean not null default false,
  "scheduledAt" timestamp with time zone,
  "currentVersion" integer not null default 1,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table if not exists "MarketingJourneyVersion" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "journeyId" text not null references "MarketingJourney"("id") on delete cascade,
  "version" integer not null,
  "workflowSnapshot" jsonb not null,
  "publishNotes" text,
  "publishedBy" text references "User"("id"),
  "publishedAt" timestamp with time zone not null default now(),
  unique ("journeyId", "version")
);

create table if not exists "MarketingJourneyEnrollment" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "journeyId" text not null references "MarketingJourney"("id") on delete cascade,
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "status" text not null default 'ACTIVE' check ("status" in ('ACTIVE', 'EXITED', 'CONVERTED', 'UNSUBSCRIBED', 'FAILED')),
  "enrolledAt" timestamp with time zone not null default now(),
  "exitedAt" timestamp with time zone,
  "exitReason" text,
  unique ("journeyId", "recordType", "recordId")
);

create table if not exists "MarketingAttributionTouch" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "source" text,
  "medium" text,
  "campaign" text,
  "channel" text not null default 'OTHER' check ("channel" in ('FORM_SUBMISSION', 'WEBSITE_VISIT', 'JOURNEY_ENROLLMENT', 'MANUAL', 'COMMUNICATION_CLICK', 'OTHER')),
  "touchType" text not null default 'TOUCH' check ("touchType" in ('TOUCH', 'CONVERSION')),
  "journeyId" text references "MarketingJourney"("id") on delete set null,
  "metadata" jsonb not null default '{}',
  "occurredAt" timestamp with time zone not null default now()
);

create table if not exists "MarketingPreference" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "topic" text not null default 'GENERAL',
  "isOptedIn" boolean not null default true,
  "source" text,
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "recordType", "recordId", "topic")
);

create index if not exists "MarketingJourney_tenant_status_idx" on "MarketingJourney" ("tenantId", "status");
create index if not exists "MarketingJourneyEnrollment_journey_idx" on "MarketingJourneyEnrollment" ("tenantId", "journeyId", "status");
create index if not exists "MarketingJourneyEnrollment_record_idx" on "MarketingJourneyEnrollment" ("tenantId", "recordType", "recordId");
create index if not exists "MarketingAttributionTouch_record_idx" on "MarketingAttributionTouch" ("tenantId", "recordType", "recordId", "occurredAt" desc);
create index if not exists "MarketingPreference_record_idx" on "MarketingPreference" ("tenantId", "recordType", "recordId");

alter table "MarketingJourney" enable row level security;
create policy "tenant_isolation_marketing_journey" on "MarketingJourney"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketingJourneyVersion" enable row level security;
create policy "tenant_isolation_marketing_journey_version" on "MarketingJourneyVersion"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketingJourneyEnrollment" enable row level security;
create policy "tenant_isolation_marketing_journey_enrollment" on "MarketingJourneyEnrollment"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketingAttributionTouch" enable row level security;
create policy "tenant_isolation_marketing_attribution_touch" on "MarketingAttributionTouch"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "MarketingPreference" enable row level security;
create policy "tenant_isolation_marketing_preference" on "MarketingPreference"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
