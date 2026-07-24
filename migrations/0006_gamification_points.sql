-- Gamification + Partner Payouts, Step 3f: Gamification points engine.
--
-- Run manually in the Supabase SQL Editor (no migration tool in this repo — see
-- 01_SCHEMA_EXPORT_INSTRUCTIONS.md), then re-export SCHEMA.md.

create table if not exists "GamificationRule" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "triggerEventType" text not null,
  "audienceScope" text not null default 'ALL' check ("audienceScope" in ('INTERNAL', 'PARTNER', 'ALL')),
  "conditions" jsonb not null default '{}'::jsonb,
  "pointsAwarded" integer not null,
  "priority" integer not null default 0,
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "GamificationRule_tenantId_idx" on "GamificationRule" ("tenantId", "triggerEventType");

-- Schema-ready for a future points-to-money/3rd-party redemption feature — no
-- redemption engine or UI ships in this phase, per the decision to keep gamification
-- points-based only for now with an extension point for later.
create table if not exists "GamificationRedemption" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "userId" text not null references "User"("id"),
  "redemptionType" text not null check ("redemptionType" in ('MONETARY', 'THIRD_PARTY_REWARD')),
  "pointsRedeemed" integer not null,
  "monetaryAmount" numeric,
  "thirdPartyProvider" text,
  "thirdPartyReference" text,
  "status" text not null default 'REQUESTED' check ("status" in ('REQUESTED', 'FULFILLED', 'FAILED')),
  "createdAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "GamificationPointsLedger" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "userId" text not null references "User"("id"),
  "gamificationRuleId" text references "GamificationRule"("id"),
  "points" integer not null,
  "entryType" text not null check ("entryType" in ('EARNED', 'MANUAL_ADJUSTMENT', 'REDEEMED')),
  "sourceEntityType" text,
  "sourceEntityId" text,
  "triggerEvent" text,
  "redemptionId" text references "GamificationRedemption"("id"),
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "GamificationPointsLedger_tenantId_idx" on "GamificationPointsLedger" ("tenantId");
create index if not exists "GamificationPointsLedger_userId_idx" on "GamificationPointsLedger" ("tenantId", "userId");

alter table "GamificationRule" enable row level security;
alter table "GamificationRedemption" enable row level security;
alter table "GamificationPointsLedger" enable row level security;

create policy "tenant_isolation_gamification_rule" on "GamificationRule"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_gamification_redemption" on "GamificationRedemption"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_gamification_points_ledger" on "GamificationPointsLedger"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

-- Append-only, same as CommissionLedger — corrections are new MANUAL_ADJUSTMENT rows.
create or replace function prevent_gamification_ledger_mutation()
returns trigger as $$
begin
  raise exception 'GamificationPointsLedger rows are append-only — insert a MANUAL_ADJUSTMENT row instead of updating or deleting % on %', TG_OP, OLD.id;
end;
$$ language plpgsql;

drop trigger if exists gamification_points_ledger_no_update on "GamificationPointsLedger";
create trigger gamification_points_ledger_no_update
  before update or delete on "GamificationPointsLedger"
  for each row execute function prevent_gamification_ledger_mutation();
