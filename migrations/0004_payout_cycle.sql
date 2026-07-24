-- Gamification + Partner Payouts, Step 3d: Payout cycle management.
--
-- Run manually in the Supabase SQL Editor (no migration tool in this repo — see
-- 01_SCHEMA_EXPORT_INSTRUCTIONS.md), then re-export SCHEMA.md.
--
-- Note: cycle membership for commission is computed by date-range query against
-- CommissionLedger.createdAt (see src/lib/server/payouts.ts) rather than a stored
-- foreign key on the ledger — that column was deliberately removed in
-- 0003_commission_ledger.sql because it would have required mutating ledger rows
-- after insert, which the append-only trigger on that table forbids.

create table if not exists "PartnerPayoutSettings" (
  "id" text primary key,
  "tenantId" text not null unique references "Tenant"("id"),
  "cycleFrequency" text not null default 'MONTHLY' check ("cycleFrequency" in ('MONTHLY', 'BIWEEKLY', 'CUSTOM_DAYS')),
  "customIntervalDays" integer,
  "cycleAnchorDay" integer not null default 1,
  "defaultHsnSacCode" text,
  "companyLegalName" text,
  "companyGstin" text,
  "companyAddress" jsonb,
  "companyState" text,
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "PayoutCycle" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "cycleLabel" text not null,
  "startDate" timestamp without time zone not null,
  "endDate" timestamp without time zone not null,
  "status" text not null default 'OPEN' check ("status" in ('OPEN', 'CLOSED')),
  "generatedAt" timestamp without time zone,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "PayoutCycle_tenantId_idx" on "PayoutCycle" ("tenantId", "startDate" desc);

create table if not exists "Payout" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "payoutCycleId" text not null references "PayoutCycle"("id"),
  "partnerId" text not null references "User"("id"),
  "totalCommissionAmount" numeric not null default 0,
  "status" text not null default 'DRAFT' check ("status" in ('DRAFT', 'APPROVED', 'INVOICED', 'PAID')),
  -- FK to PartnerInvoice added in a later migration once that table exists (step 3e).
  "invoiceId" text,
  "approvedAt" timestamp without time zone,
  "approvedBy" text references "User"("id"),
  "paidAt" timestamp without time zone,
  "paidBy" text references "User"("id"),
  "paymentReference" text,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  unique ("payoutCycleId", "partnerId")
);

create index if not exists "Payout_tenantId_idx" on "Payout" ("tenantId");
create index if not exists "Payout_partnerId_idx" on "Payout" ("tenantId", "partnerId");

alter table "PartnerPayoutSettings" enable row level security;
alter table "PayoutCycle" enable row level security;
alter table "Payout" enable row level security;

create policy "tenant_isolation_partner_payout_settings" on "PartnerPayoutSettings"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_payout_cycle" on "PayoutCycle"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_payout" on "Payout"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));
