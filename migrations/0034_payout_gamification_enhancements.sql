-- Gamification & Payouts checklist follow-ups:
--   1. Credit-note / invoice-correction support: PartnerInvoice gets a status +
--      self-referential supersedesInvoiceId so a mistaken invoice can be cancelled and
--      reissued without losing the audit trail. The old "payoutId" unique constraint
--      blocked a payout from ever having more than one invoice, ever -- replaced with a
--      partial unique index so at most one ISSUED invoice can exist per payout at a time,
--      while CANCELLED ones stay in history.
--   2. Payout/Gamification entitlement flags on TenantFeature, alongside the 6 existing
--      plan flags. Both default true so no existing tenant's access changes on deploy --
--      these two modules already exist and work today; the flags only matter once an
--      admin deliberately turns one off.
--   3. PayoutDispute: partner-facing "raise a dispute" CTA needs somewhere to land.
--
-- Run manually against the database, then re-export SCHEMA.md.

alter table "PartnerInvoice" add column if not exists "status" text not null default 'ISSUED' check ("status" in ('ISSUED', 'CANCELLED'));
alter table "PartnerInvoice" add column if not exists "supersedesInvoiceId" text references "PartnerInvoice"("id");
alter table "PartnerInvoice" add column if not exists "cancelledAt" timestamp without time zone;
alter table "PartnerInvoice" add column if not exists "cancelledBy" text references "User"("id");
alter table "PartnerInvoice" add column if not exists "cancellationReason" text;

alter table "PartnerInvoice" drop constraint if exists "PartnerInvoice_payoutId_key";
create unique index if not exists "PartnerInvoice_payoutId_active_key" on "PartnerInvoice" ("payoutId") where "status" = 'ISSUED';

alter table "TenantFeature" add column if not exists "payoutsEnabled" boolean not null default true;
alter table "TenantFeature" add column if not exists "gamificationEnabled" boolean not null default true;

create table if not exists "PayoutDispute" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "payoutId" text not null references "Payout"("id"),
  "partnerId" text not null references "User"("id"),
  "reason" text not null,
  "status" text not null default 'OPEN' check ("status" in ('OPEN', 'RESOLVED', 'DISMISSED')),
  "resolutionNotes" text,
  "resolvedBy" text references "User"("id"),
  "resolvedAt" timestamp without time zone,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "PayoutDispute_tenant_payout_idx" on "PayoutDispute" ("tenantId", "payoutId");
create index if not exists "PayoutDispute_tenant_status_idx" on "PayoutDispute" ("tenantId", "status");

alter table "PayoutDispute" enable row level security;
create policy "tenant_isolation_payout_dispute" on "PayoutDispute"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
