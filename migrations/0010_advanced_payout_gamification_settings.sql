-- Advanced payout and gamification configuration.
--
-- Run manually in the Supabase SQL Editor, then re-export SCHEMA.md.

alter table "PartnerPayoutSettings"
  add column if not exists "minimumPayoutAmount" numeric not null default 0,
  add column if not exists "approvalMode" text not null default 'MANUAL'
    check ("approvalMode" in ('MANUAL', 'AUTO_BELOW_THRESHOLD')),
  add column if not exists "autoApproveBelowAmount" numeric,
  add column if not exists "requireInvoiceBeforePayment" boolean not null default true,
  add column if not exists "allowPartnerSelfInvoice" boolean not null default true,
  add column if not exists "adjustmentReasons" jsonb not null default '[]'::jsonb,
  add column if not exists "holdReasons" jsonb not null default '[]'::jsonb;

alter table "Payout"
  add column if not exists "isHeld" boolean not null default false,
  add column if not exists "holdReason" text,
  add column if not exists "heldAt" timestamp without time zone,
  add column if not exists "heldBy" text references "User"("id"),
  add column if not exists "releasedAt" timestamp without time zone,
  add column if not exists "releasedBy" text references "User"("id");

create index if not exists "Payout_hold_idx" on "Payout" ("tenantId", "isHeld", "status");

create table if not exists "GamificationSettings" (
  "id" text primary key,
  "tenantId" text not null unique references "Tenant"("id"),
  "levels" jsonb not null default '[]'::jsonb,
  "leaderboardConfig" jsonb not null default '{}'::jsonb,
  "redemptionCatalog" jsonb not null default '[]'::jsonb,
  "antiGamingRules" jsonb not null default '{}'::jsonb,
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

alter table "GamificationSettings" enable row level security;

create policy "tenant_isolation_gamification_settings" on "GamificationSettings"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
