-- Voice bot plan wave B (approved 2026-10-27): the Voice bots module, bots and their settings,
-- the numbers bots answer, holidays, and AI/voice provider keys with usage.

insert into "PlatformModule" ("key", "name", "description", "category", "isCore") values
  ('VOICE_BOT', 'Voice bots', 'AI voice agents that call leads who enquired and answer calls, in Hindi and English.', 'AI', false)
on conflict ("key") do nothing;

-- One row per bot. `config` holds everything the builder edits (languages, voices, AI, persona,
-- rules, lines, fixed steps, field questions, mapping, caller details, calling hours, retries,
-- limits); it is checked by the app (voice-bots.ts) on every save. Each bot logs its calls as
-- its own system activity type ("Voice bot: <name>", systemKey VOICE_BOT).
create table if not exists "VoiceBot" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "name" text not null,
  "status" text not null default 'DRAFT' check ("status" in ('DRAFT', 'LIVE', 'PAUSED')),
  "activityTypeId" text references "ActivityType"("id") on delete set null,
  "config" jsonb not null default '{}'::jsonb,
  "createdBy" text,
  "updatedBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "archivedAt" timestamptz
);
create unique index if not exists "VoiceBot_tenant_name_key" on "VoiceBot" ("tenantId", lower("name")) where "archivedAt" is null;
create index if not exists "VoiceBot_tenant_idx" on "VoiceBot" ("tenantId", "archivedAt");

-- Which Plivo numbers a bot answers (decisions 4 and 23): BOT, OWNER (people, as today) or
-- OWNER_THEN_BOT (people first; the bot takes calls nobody answers and calls after hours).
create table if not exists "VoiceBotNumber" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "number" text not null,
  "mode" text not null default 'OWNER' check ("mode" in ('BOT', 'OWNER', 'OWNER_THEN_BOT')),
  "botId" text references "VoiceBot"("id") on delete set null,
  "updatedBy" text,
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "number")
);

-- Days bots don't call (decision 15; the CRM had no holiday calendar).
create table if not exists "VoiceBotHoliday" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "date" date not null,
  "label" text,
  "createdAt" timestamptz not null default now(),
  unique ("tenantId", "date")
);

-- Provider keys (Groq, Claude, Google, Azure) encrypted by the app, the Claude monthly cap and
-- alert levels (decision 29).
create table if not exists "VoiceProviderSettings" (
  "tenantId" text primary key references "Tenant"("id") on delete cascade,
  "config" jsonb not null default '{}'::jsonb,
  "updatedBy" text,
  "updatedAt" timestamptz not null default now()
);

-- Spend and use per provider per calendar month (UTC): the Claude cap is checked against it and
-- its alerts are sent once each.
create table if not exists "VoiceProviderUsage" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "provider" text not null,
  "month" text not null,
  "botId" text,
  "costMicroUsd" bigint not null default 0,
  "inputTokens" bigint not null default 0,
  "outputTokens" bigint not null default 0,
  "requests" integer not null default 0,
  "updatedAt" timestamptz not null default now()
);
create unique index if not exists "VoiceProviderUsage_key" on "VoiceProviderUsage" ("tenantId", "provider", "month", coalesce("botId", ''));

create table if not exists "VoiceProviderAlert" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "provider" text not null,
  "month" text not null,
  "level" integer not null,
  "sentAt" timestamptz not null default now(),
  unique ("tenantId", "provider", "month", "level")
);

alter table "VoiceBot" enable row level security;
alter table "VoiceBotNumber" enable row level security;
alter table "VoiceBotHoliday" enable row level security;
alter table "VoiceProviderSettings" enable row level security;
alter table "VoiceProviderUsage" enable row level security;
alter table "VoiceProviderAlert" enable row level security;
drop policy if exists tenant_scope on "VoiceBot";
create policy tenant_scope on "VoiceBot" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
drop policy if exists tenant_scope on "VoiceBotNumber";
create policy tenant_scope on "VoiceBotNumber" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
drop policy if exists tenant_scope on "VoiceBotHoliday";
create policy tenant_scope on "VoiceBotHoliday" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
drop policy if exists tenant_scope on "VoiceProviderSettings";
create policy tenant_scope on "VoiceProviderSettings" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
drop policy if exists tenant_scope on "VoiceProviderUsage";
create policy tenant_scope on "VoiceProviderUsage" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
drop policy if exists tenant_scope on "VoiceProviderAlert";
create policy tenant_scope on "VoiceProviderAlert" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
