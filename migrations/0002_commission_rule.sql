-- Gamification + Partner Payouts, Step 3b: Commission rule engine.
--
-- Run manually in the Supabase SQL Editor (no migration tool in this repo — see
-- 01_SCHEMA_EXPORT_INSTRUCTIONS.md), then re-export SCHEMA.md.

create table if not exists "CommissionRule" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "partnerId" text references "User"("id"),
  "opportunityTypeId" text references "OpportunityType"("id"),
  "conditions" jsonb not null default '{}'::jsonb,
  "ruleType" text not null check ("ruleType" in ('FLAT', 'PERCENTAGE')),
  "value" numeric not null,
  "priority" integer not null default 0,
  "isActive" boolean not null default true,
  "effectiveFrom" timestamp without time zone,
  "effectiveTo" timestamp without time zone,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "CommissionRule_tenantId_idx" on "CommissionRule" ("tenantId");
create index if not exists "CommissionRule_tenantId_priority_idx" on "CommissionRule" ("tenantId", "priority" desc);

alter table "CommissionRule" enable row level security;

create policy "tenant_isolation_commission_rule" on "CommissionRule"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
