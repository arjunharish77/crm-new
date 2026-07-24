-- Gamification + Partner Payouts, Step 3c: Commission ledger writing.
--
-- Run manually in the Supabase SQL Editor (no migration tool in this repo — see
-- 01_SCHEMA_EXPORT_INSTRUCTIONS.md), then re-export SCHEMA.md.
--
-- Append-only by convention: application code (src/lib/server/commission.ts) never
-- exposes an update/delete path for this table — corrections are new offsetting
-- CORRECTION_CREDIT/CORRECTION_DEBIT rows, never edits. The trigger below enforces
-- that at the database layer too, since this table handles money.

create table if not exists "CommissionLedger" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "partnerId" text not null references "User"("id"),
  "opportunityId" text references "Opportunity"("id"),
  "commissionRuleId" text references "CommissionRule"("id"),
  "entryType" text not null check ("entryType" in ('EARNED', 'CORRECTION_CREDIT', 'CORRECTION_DEBIT')),
  "baseAmount" numeric,
  "commissionAmount" numeric not null,
  "calculationSnapshot" jsonb,
  "triggerEvent" text,
  "correctsEntryId" text references "CommissionLedger"("id"),
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "CommissionLedger_tenantId_idx" on "CommissionLedger" ("tenantId");
create index if not exists "CommissionLedger_partnerId_idx" on "CommissionLedger" ("tenantId", "partnerId");
create index if not exists "CommissionLedger_opportunityId_idx" on "CommissionLedger" ("opportunityId");
create index if not exists "CommissionLedger_partner_createdAt_idx" on "CommissionLedger" ("tenantId", "partnerId", "createdAt");

alter table "CommissionLedger" enable row level security;

create policy "tenant_isolation_commission_ledger" on "CommissionLedger"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

create or replace function prevent_commission_ledger_mutation()
returns trigger as $$
begin
  raise exception 'CommissionLedger rows are append-only — insert a CORRECTION_CREDIT/CORRECTION_DEBIT row instead of updating or deleting % on %', TG_OP, OLD.id;
end;
$$ language plpgsql;

drop trigger if exists commission_ledger_no_update on "CommissionLedger";
create trigger commission_ledger_no_update
  before update or delete on "CommissionLedger"
  for each row execute function prevent_commission_ledger_mutation();
