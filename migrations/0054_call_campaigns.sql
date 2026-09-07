-- Priority Module 15 -- Telephony: call campaigns.
-- Last open item in this module. Confirmed by audit before building: no "Campaign" table for
-- telephony exists anywhere; the closest precedent is MarketingCampaign (email/SMS-shaped,
-- not a fit for disposition/retry/callback/agent-assignment semantics). Audience resolution
-- reuses resolveJourneyAudienceRecordIds (marketing-journeys.ts) unchanged rather than
-- reimplementing MANUAL/LEAD_LIST/SAVED_VIEW resolution a second time -- confirmed that
-- function already does exactly what this needs. "Audience from reports" is NOT built: every
-- inbuilt report returns aggregates, with the one exception (data-quality report's 10-sample
-- ids) explicitly too thin to serve as a real campaign audience -- documented honestly rather
-- than wiring a fake "reports" audience type with no real population behind it.

create table if not exists "CallCampaign" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  name text not null,
  description text,
  module text not null check (module in ('LEAD', 'OPPORTUNITY')),
  "audienceType" text not null check ("audienceType" in ('MANUAL', 'LEAD_LIST', 'SAVED_VIEW')),
  "audienceConfig" jsonb not null default '{}',
  "callScriptId" text references "CallScript"(id) on delete set null,
  "dispositionGroupId" text references "DispositionGroup"(id) on delete set null,
  "assignedTeamId" uuid references "Team"(id),
  "retryPolicy" jsonb not null default '{"maxAttempts": 3, "retryDelayMinutes": 60}',
  "callbackPolicy" jsonb not null default '{"pauseUntilCallback": true}',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

-- "nextEligibleAt" is the retry safety net: set on every claim to now + retryDelayMinutes, so a
-- claimed call that never gets a disposition logged against it automatically recycles back into
-- the pool after the delay, without needing a separate worker sweep -- getNextCampaignCallFor
-- Agent's own candidate query treats a stale QUEUED row past its nextEligibleAt as claimable
-- again.
create table if not exists "CallCampaignMember" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "campaignId" text not null references "CallCampaign"(id) on delete cascade,
  "leadId" text references "Lead"(id) on delete cascade,
  "opportunityId" text references "Opportunity"(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'QUEUED', 'CALLBACK_SCHEDULED', 'COMPLETED', 'EXHAUSTED', 'DO_NOT_CALL')),
  attempts integer not null default 0,
  "lastAttemptAt" timestamptz,
  "nextEligibleAt" timestamptz,
  "assignedTo" text references "User"(id),
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index if not exists "CallCampaignMember_campaign_idx" on "CallCampaignMember" ("tenantId", "campaignId", status);
create unique index if not exists "CallCampaignMember_lead_unique" on "CallCampaignMember" ("campaignId", "leadId") where "leadId" is not null;
create unique index if not exists "CallCampaignMember_opportunity_unique" on "CallCampaignMember" ("campaignId", "opportunityId") where "opportunityId" is not null;
