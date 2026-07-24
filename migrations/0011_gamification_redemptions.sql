-- Gamification redemption workflow.
--
-- Run manually in the Supabase SQL Editor, then re-export SCHEMA.md.

alter table "GamificationRedemption"
  add column if not exists "catalogItemKey" text,
  add column if not exists "rewardName" text,
  add column if not exists "notes" text,
  add column if not exists "failureReason" text,
  add column if not exists "reviewedBy" text references "User"("id"),
  add column if not exists "reviewedAt" timestamp without time zone,
  add column if not exists "updatedAt" timestamp without time zone not null default current_timestamp;

alter table "GamificationRedemption"
  drop constraint if exists "GamificationRedemption_redemptionType_check";

alter table "GamificationRedemption"
  add constraint "GamificationRedemption_redemptionType_check"
  check ("redemptionType" in ('MONETARY', 'THIRD_PARTY_REWARD', 'INTERNAL_PERK'));

create index if not exists "GamificationRedemption_tenant_status_idx"
  on "GamificationRedemption" ("tenantId", "status", "createdAt" desc);

create index if not exists "GamificationRedemption_user_idx"
  on "GamificationRedemption" ("tenantId", "userId", "createdAt" desc);
