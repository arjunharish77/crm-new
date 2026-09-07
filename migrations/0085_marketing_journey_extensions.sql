-- Gap checklist Module 8: closes the 9 remaining open items on top of the real Marketing
-- Journey Orchestration foundation built earlier this session -- channel fallback/throttle,
-- contact fatigue governance, template governance, 6 additional attribution models, campaign
-- cost/ROI, sender reputation analytics, journey simulation, operational monitoring, and
-- journey-level RBAC. No RLS policy added for the new tables, matching the precedent set by
-- every migration since 0080: tenant scoping is enforced at the application query layer.

-- ---------------------------------------------------------------------------------------------
-- Contact fatigue governance (item 10) -- one settings row per tenant, same shape convention as
-- AiProviderSettings (migration 0083).
-- ---------------------------------------------------------------------------------------------
create table if not exists "MarketingFatigueSettings" (
  "tenantId" text primary key references "Tenant"(id) on delete cascade,
  "dailyCapPerContact" integer,
  "weeklyCapPerContact" integer,
  "monthlyCapPerContact" integer,
  "channelCaps" jsonb not null default '{}',       -- {EMAIL: n, WHATSAPP: n, SMS: n} -- per-channel daily cap
  "exclusionWindows" jsonb not null default '[]',   -- [{startDate, endDate, reason}] -- tenant-wide blackout dates, no marketing send during these
  "updatedBy" text references "User"(id),
  "updatedAt" timestamptz not null default now()
);

-- Journey priority (item 10's "campaign priority"/"collision handling" when multiple journeys
-- target the same record) -- a higher-priority journey wins a same-record enrollment collision.
alter table "MarketingJourney" add column if not exists priority integer not null default 0;

-- ---------------------------------------------------------------------------------------------
-- Template governance (item 12)
-- ---------------------------------------------------------------------------------------------
-- Versioned like AiPromptTemplate/KnowledgeBaseArticle: editing inserts a new version rather
-- than overwriting; "current" is the highest-numbered isActive row for a given (channel, name,
-- locale). The old unique(tenantId, channel, name) constraint is replaced to allow that.
alter table "CommunicationTemplate" drop constraint if exists "CommunicationTemplate_tenantId_channel_name_key";
alter table "CommunicationTemplate" add column if not exists version integer not null default 1;
alter table "CommunicationTemplate" add column if not exists locale text not null default 'en';
alter table "CommunicationTemplate" add column if not exists "approvalStatus" text not null default 'DRAFT'
  check ("approvalStatus" in ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'));
alter table "CommunicationTemplate" add column if not exists "declaredTokens" text[] not null default '{}';
alter table "CommunicationTemplate" add column if not exists "tokenDefaults" jsonb not null default '{}';
alter table "CommunicationTemplate" add column if not exists "lockedHeader" text;
alter table "CommunicationTemplate" add column if not exists "lockedFooter" text;
alter table "CommunicationTemplate" add column if not exists "approvedBy" text references "User"(id);
alter table "CommunicationTemplate" add column if not exists "approvedAt" timestamptz;
alter table "CommunicationTemplate" add constraint "CommunicationTemplate_tenant_channel_name_locale_version_key"
  unique ("tenantId", channel, name, locale, version);

create table if not exists "MarketingSnippet" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  key text not null,
  body text not null,
  "createdBy" text references "User"(id),
  "updatedBy" text references "User"(id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", key)
);

-- ---------------------------------------------------------------------------------------------
-- Campaign cost and ROI model (item 15) -- genuinely new ground: confirmed (Module 7's own
-- research, re-verified here) that AiUsageLog was the only $-denominated table in this schema
-- before this; no partial cost/budget/spend infrastructure exists anywhere in Marketing to
-- extend instead.
-- ---------------------------------------------------------------------------------------------
create table if not exists "MarketingCostEntry" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "scopeType" text not null check ("scopeType" in ('JOURNEY', 'CAMPAIGN', 'CHANNEL')),
  "scopeId" text,   -- journeyId or campaignId; null when scopeType='CHANNEL' (a channel-wide rate)
  channel text check (channel in ('EMAIL', 'WHATSAPP', 'SMS')),
  "costType" text not null check ("costType" in ('PLANNED_BUDGET', 'ACTUAL_SPEND', 'PER_SEND_RATE')),
  amount numeric not null,
  currency text not null default 'USD',
  "periodStart" date,
  "periodEnd" date,
  notes text,
  "createdBy" text references "User"(id),
  "createdAt" timestamptz not null default now()
);
create index if not exists "MarketingCostEntry_tenant_scope_idx" on "MarketingCostEntry" ("tenantId", "scopeType", "scopeId");
