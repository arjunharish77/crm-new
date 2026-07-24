-- Gamification + Partner Payouts, Step 3g: Badges + leaderboard.
--
-- Run manually in the Supabase SQL Editor (no migration tool in this repo — see
-- 01_SCHEMA_EXPORT_INSTRUCTIONS.md), then re-export SCHEMA.md.
--
-- Badges count GamificationPointsLedger EARNED entries by triggerEvent (not raw
-- domain events) — reuses the ledger the points engine already writes rather than a
-- second counting mechanism. A badge's criteriaRules.eventType only accumulates once
-- an active GamificationRule is awarding points for that same trigger + audience.

create table if not exists "Badge" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "description" text,
  "iconEmoji" text not null default '🏆',
  "audienceScope" text not null default 'ALL' check ("audienceScope" in ('INTERNAL', 'PARTNER', 'ALL')),
  "criteriaRules" jsonb not null,
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "UserBadge" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "userId" text not null references "User"("id"),
  "badgeId" text not null references "Badge"("id"),
  "earnedAt" timestamp without time zone not null default current_timestamp,
  -- Epoch (1970-01-01) sentinel for all-time (unwindowed) badges rather than NULL,
  -- since Postgres unique constraints treat NULL as distinct on every row — an
  -- all-time badge would re-award every time otherwise.
  "sourcePeriodStart" timestamp without time zone not null,
  "sourcePeriodEnd" timestamp without time zone,
  unique ("tenantId", "userId", "badgeId", "sourcePeriodStart")
);

create index if not exists "Badge_tenantId_idx" on "Badge" ("tenantId");
create index if not exists "UserBadge_userId_idx" on "UserBadge" ("tenantId", "userId");

alter table "Badge" enable row level security;
alter table "UserBadge" enable row level security;

create policy "tenant_isolation_badge" on "Badge"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_user_badge" on "UserBadge"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
