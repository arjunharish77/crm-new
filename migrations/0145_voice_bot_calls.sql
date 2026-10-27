-- Voice bot plan wave E (2026-10-27): bot phone calls. One row per attempt: queued, placed through
-- Plivo, answered by the bot service, then summarised into the bot's activity. Retries are new
-- rows pointing at the first attempt (decision 12). Priority: inbound 0, new enquiry 1, retry 2,
-- bulk 3 (decision 14); "call my phone" tests use 0.

create table if not exists "VoiceBotCall" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "botId" text not null references "VoiceBot"("id") on delete cascade,
  "firstAttemptId" text,
  "attempt" integer not null default 1,
  "trigger" text not null check ("trigger" in ('MANUAL', 'BULK', 'ENQUIRY', 'AUTOMATION', 'CAMPAIGN', 'INBOUND', 'TEST_PHONE')),
  "priority" integer not null default 3,
  "status" text not null default 'QUEUED' check ("status" in ('QUEUED', 'DIALING', 'IN_PROGRESS', 'COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'MACHINE', 'BLOCKED', 'CANCELLED')),
  "blockedReason" text,
  "notBefore" timestamptz not null default now(),
  "leadId" text,
  "opportunityId" text,
  "phone" text not null,
  "fromNumber" text,
  "startedBy" text,
  "sessionId" text,
  "callLogId" text,
  "plivoRequestUuid" text,
  "plivoCallUuid" text,
  "dialedAt" timestamptz,
  "answeredAt" timestamptz,
  "endedAt" timestamptz,
  "durationSeconds" integer,
  -- Live transfer (decision 3): the people to ring in order, and what happened.
  "transfer" jsonb,
  -- After the call: outcome, the AI summary, the fields, and what was done with them.
  "outcome" text,
  "summary" text,
  "fields" jsonb not null default '{}'::jsonb,
  "results" jsonb not null default '{}'::jsonb,
  "activityId" text,
  "processedAt" timestamptz,
  "error" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "VoiceBotCall_due" on "VoiceBotCall" ("tenantId", "priority", "notBefore", "createdAt") where "status" = 'QUEUED';
create index if not exists "VoiceBotCall_active" on "VoiceBotCall" ("tenantId", "status") where "status" in ('DIALING', 'IN_PROGRESS');
create index if not exists "VoiceBotCall_bot" on "VoiceBotCall" ("tenantId", "botId", "createdAt" desc);
create index if not exists "VoiceBotCall_lead" on "VoiceBotCall" ("tenantId", "leadId", "createdAt" desc);
create unique index if not exists "VoiceBotCall_session" on "VoiceBotCall" ("sessionId") where "sessionId" is not null;

-- "Don't call me" (decision 21): that number gets no more bot calls in this workspace. People can
-- still call it. Kept by the last 10 digits, the way calls match leads.
create table if not exists "VoiceBotStopList" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "phoneDigits" text not null,
  "phone" text not null,
  "botId" text,
  "voiceBotCallId" text,
  "createdAt" timestamptz not null default now(),
  unique ("tenantId", "phoneDigits")
);

alter table "VoiceBotSession" add column if not exists "voiceBotCallId" text;

alter table "VoiceBotCall" enable row level security;
alter table "VoiceBotStopList" enable row level security;
drop policy if exists tenant_scope on "VoiceBotCall";
create policy tenant_scope on "VoiceBotCall" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
drop policy if exists tenant_scope on "VoiceBotStopList";
create policy tenant_scope on "VoiceBotStopList" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
