-- Voice bot plan wave C (2026-10-27): one row per bot conversation, a browser test call or (from
-- wave E) a phone call. The CRM creates the row with a single-use token; the bot service claims
-- it when the audio connects, and sends the transcript, turn timings, captured fields and events
-- when the conversation ends. Provider keys are never stored here.

create table if not exists "VoiceBotSession" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "botId" text not null references "VoiceBot"("id") on delete cascade,
  "kind" text not null check ("kind" in ('TEST', 'CALL')),
  "status" text not null default 'PENDING' check ("status" in ('PENDING', 'ACTIVE', 'ENDED', 'EXPIRED', 'FAILED')),
  "tokenHash" text not null,
  "expiresAt" timestamptz not null,
  "claimedAt" timestamptz,
  "endedAt" timestamptz,
  "startedBy" text,
  "leadId" text,
  "opportunityId" text,
  -- What the bot was given for this conversation: rendered lines, caller details, voices and AI.
  "snapshot" jsonb not null default '{}'::jsonb,
  "transcript" jsonb not null default '[]'::jsonb,
  "turns" jsonb not null default '[]'::jsonb,
  "events" jsonb not null default '[]'::jsonb,
  "fields" jsonb not null default '{}'::jsonb,
  "outcome" text,
  "durationSeconds" integer,
  "error" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create index if not exists "VoiceBotSession_tenant_bot_created" on "VoiceBotSession" ("tenantId", "botId", "createdAt" desc);
create index if not exists "VoiceBotSession_pending_expiry" on "VoiceBotSession" ("expiresAt") where "status" in ('PENDING', 'ACTIVE');

alter table "VoiceBotSession" enable row level security;
drop policy if exists tenant_scope on "VoiceBotSession";
create policy tenant_scope on "VoiceBotSession" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));

-- Voice and speech usage: characters spoken (Google/Azure free amounts, decision 33) and seconds
-- of caller audio transcribed (Groq Whisper).
alter table "VoiceProviderUsage" add column if not exists "characters" bigint not null default 0;
alter table "VoiceProviderUsage" add column if not exists "audioSeconds" numeric(12, 2) not null default 0;
