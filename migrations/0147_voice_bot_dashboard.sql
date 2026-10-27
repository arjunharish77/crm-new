-- Voice bot plan wave G (2026-10-27): usage per day against each free limit, and the call quality
-- review. Groq's free limits are per model per day (requests and tokens) and per day for Whisper
-- (requests and audio seconds); Google's and Azure's voices are per month (VoiceProviderUsage).
-- Admins are alerted at 80% of any of them (VoiceProviderAlert, with the day or month as period).

create table if not exists "VoiceProviderDailyUsage" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id") on delete cascade,
  "day" date not null,
  -- groq-chat:<model>, groq-whisper, google-tts, azure-tts, claude
  "meter" text not null,
  "requests" integer not null default 0,
  "tokens" bigint not null default 0,
  "audioSeconds" numeric(12, 2) not null default 0,
  "characters" bigint not null default 0,
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "day", "meter")
);

-- After the call, Claude scores how the bot did: {score 1-5, issues[], listen, reason}.
alter table "VoiceBotCall" add column if not exists "review" jsonb;
create index if not exists "VoiceBotCall_to_listen" on "VoiceBotCall" ("tenantId", "createdAt" desc) where ("review" ->> 'listen') = 'true';

alter table "VoiceProviderDailyUsage" enable row level security;
drop policy if exists tenant_scope on "VoiceProviderDailyUsage";
create policy tenant_scope on "VoiceProviderDailyUsage" using ("tenantId" = nullif(current_setting('app.tenant_id', true), '')) with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));
