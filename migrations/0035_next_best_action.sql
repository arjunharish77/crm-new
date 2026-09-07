-- Priority Module 6 -- Next-Best Action Engine. Deterministic recommendation/ranking
-- logic (no required external LLM/API cost, per the checklist's explicit scope
-- decision) -- built to sit alongside the existing self-learning predictive-scoring
-- pipeline (RecordScore, migration 0014) rather than duplicate it: NBA reads
-- RecordScore as one of several ranking signals but owns its own candidate/
-- recommendation/decision-log/feedback tables.
--
-- NextBestActionCandidate is the durable per-rule-evaluation audit trail (every rule
-- checked for a record during a generation run, eligible or not, with its score or
-- suppression reason) -- distinct from NextBestActionRecommendation, which is only the
-- top-ranked subset actually surfaced to a user as an actionable card. Keeping both
-- means "why wasn't X recommended" is answerable from data, not just "why was Y."
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "NextBestActionStrategy" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "targetModule" text not null check ("targetModule" in ('LEAD', 'OPPORTUNITY')),
  "isActive" boolean not null default true,
  "maxVisibleRecommendationsPerUser" integer not null default 5,
  "cooldownHours" integer not null default 24,
  "dailyActionCapPerUser" integer not null default 20,
  "suppressionConditions" jsonb not null default '[]',
  "createdBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now(),
  unique ("tenantId", "targetModule")
);

create table if not exists "NextBestActionRule" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "strategyId" text not null references "NextBestActionStrategy"("id") on delete cascade,
  "name" text not null,
  "actionType" text not null check ("actionType" in (
    'CREATE_TASK', 'CALL_LEAD', 'SEND_EMAIL', 'SEND_WHATSAPP', 'SEND_SMS', 'ASSIGN_OWNER',
    'ADD_TO_LIST', 'UPDATE_FIELD', 'SCHEDULE_ACTIVITY', 'ESCALATE_TO_MANAGER', 'DO_NOTHING'
  )),
  "eligibilityConditions" jsonb not null default '[]',
  "actionConfig" jsonb not null default '{}',
  "basePriority" integer not null default 50,
  "businessValue" numeric not null default 0,
  "priority" integer not null default 0,
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table if not exists "NextBestActionRecommendation" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "strategyId" text references "NextBestActionStrategy"("id") on delete set null,
  "ruleId" text references "NextBestActionRule"("id") on delete set null,
  "recordType" text not null check ("recordType" in ('LEAD', 'OPPORTUNITY')),
  "recordId" text not null,
  "ownerId" text,
  "actionType" text not null,
  "actionConfig" jsonb not null default '{}',
  "score" numeric not null default 0,
  "scoreBreakdown" jsonb not null default '{}',
  "reason" text,
  "status" text not null default 'PENDING' check ("status" in ('PENDING', 'ACCEPTED', 'SNOOZED', 'DISMISSED', 'COMPLETED', 'NOT_USEFUL', 'EXPIRED')),
  "snoozedUntil" timestamp with time zone,
  "respondedBy" text references "User"("id"),
  "respondedAt" timestamp with time zone,
  "expiresAt" timestamp with time zone,
  "generatedAt" timestamp with time zone not null default now(),
  "createdAt" timestamp with time zone not null default now(),
  "updatedAt" timestamp with time zone not null default now()
);

create table if not exists "NextBestActionCandidate" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "runId" text not null,
  "recordType" text not null,
  "recordId" text not null,
  "ruleId" text references "NextBestActionRule"("id") on delete set null,
  "actionType" text not null,
  "score" numeric not null default 0,
  "scoreBreakdown" jsonb not null default '{}',
  "isEligible" boolean not null default true,
  "suppressedReason" text,
  "createdAt" timestamp with time zone not null default now()
);

create table if not exists "NextBestActionDecisionLog" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "runId" text not null,
  "recordType" text not null,
  "recordId" text not null,
  "candidateCount" integer not null default 0,
  "chosenRecommendationIds" jsonb not null default '[]',
  "suppressed" boolean not null default false,
  "suppressedReason" text,
  "generatedAt" timestamp with time zone not null default now()
);

create table if not exists "NextBestActionFeedback" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "recommendationId" text not null references "NextBestActionRecommendation"("id") on delete cascade,
  "outcome" text not null check ("outcome" in ('ACCEPTED', 'SNOOZED', 'DISMISSED', 'COMPLETED', 'NOT_USEFUL')),
  "recordedBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default now()
);

create index if not exists "NextBestActionRule_strategy_idx" on "NextBestActionRule" ("tenantId", "strategyId", "isActive");
create index if not exists "NextBestActionRecommendation_record_idx" on "NextBestActionRecommendation" ("tenantId", "recordType", "recordId", "status");
create index if not exists "NextBestActionRecommendation_owner_idx" on "NextBestActionRecommendation" ("tenantId", "ownerId", "status", "score" desc);
create index if not exists "NextBestActionCandidate_run_idx" on "NextBestActionCandidate" ("tenantId", "runId");
create index if not exists "NextBestActionDecisionLog_record_idx" on "NextBestActionDecisionLog" ("tenantId", "recordType", "recordId", "generatedAt" desc);
create index if not exists "NextBestActionFeedback_recommendation_idx" on "NextBestActionFeedback" ("tenantId", "recommendationId");

alter table "NextBestActionStrategy" enable row level security;
create policy "tenant_isolation_nba_strategy" on "NextBestActionStrategy"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "NextBestActionRule" enable row level security;
create policy "tenant_isolation_nba_rule" on "NextBestActionRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "NextBestActionRecommendation" enable row level security;
create policy "tenant_isolation_nba_recommendation" on "NextBestActionRecommendation"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "NextBestActionCandidate" enable row level security;
create policy "tenant_isolation_nba_candidate" on "NextBestActionCandidate"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "NextBestActionDecisionLog" enable row level security;
create policy "tenant_isolation_nba_decision_log" on "NextBestActionDecisionLog"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

alter table "NextBestActionFeedback" enable row level security;
create policy "tenant_isolation_nba_feedback" on "NextBestActionFeedback"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
