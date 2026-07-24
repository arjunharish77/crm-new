-- Gamification + Partner Payouts, Step 3e: GST-compliant invoice generation.
--
-- Run manually in the Supabase SQL Editor (no migration tool in this repo — see
-- 01_SCHEMA_EXPORT_INSTRUCTIONS.md), then re-export SCHEMA.md.

-- Tenant-wide invoice defaults: GST rate and numbering pattern are configurable
-- rather than hardcoded, since neither is safe to assume for every tenant/service.
alter table "PartnerPayoutSettings" add column if not exists "gstRatePercent" numeric not null default 18;
alter table "PartnerPayoutSettings" add column if not exists "invoiceNumberPattern" text not null default '{prefix}-{counter}';

-- Per-partner numbering: the flat counter (already added in 0001) covers patterns
-- without {fy}; countersByFy covers patterns that reset each Indian financial year
-- (Apr 1 - Mar 31). Both are maintained by formatInvoiceNumber() in
-- src/lib/server/partner-invoices.ts depending on which placeholder the active
-- pattern uses.
alter table "PartnerProfile" add column if not exists "invoiceNumberPattern" text;
alter table "PartnerProfile" add column if not exists "invoiceNumberCountersByFy" jsonb not null default '{}'::jsonb;

create table if not exists "PartnerInvoiceTemplate" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "partnerId" text not null unique references "User"("id"),
  "logoUrl" text,
  "footerNotes" text,
  "signatoryName" text,
  "isActive" boolean not null default true,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "PartnerInvoice" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "partnerId" text not null references "User"("id"),
  "payoutId" text not null unique references "Payout"("id"),
  "invoiceNumber" text not null,
  "invoiceDate" timestamp without time zone not null,
  "supplierSnapshot" jsonb not null,
  "recipientSnapshot" jsonb not null,
  "lineItems" jsonb not null,
  "taxableValue" numeric not null,
  "cgstAmount" numeric not null default 0,
  "sgstAmount" numeric not null default 0,
  "igstAmount" numeric not null default 0,
  "totalAmount" numeric not null,
  "isGstInvoice" boolean not null default true,
  "pdfStoragePath" text,
  "generatedAt" timestamp without time zone not null default current_timestamp,
  "generatedBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "partnerId", "invoiceNumber")
);

create index if not exists "PartnerInvoice_tenantId_idx" on "PartnerInvoice" ("tenantId");
create index if not exists "PartnerInvoice_partnerId_idx" on "PartnerInvoice" ("tenantId", "partnerId");

-- Now that PartnerInvoice exists, wire up the FK left dangling in 0004.
alter table "Payout" add constraint "Payout_invoiceId_fkey" foreign key ("invoiceId") references "PartnerInvoice"("id");

alter table "PartnerInvoiceTemplate" enable row level security;
alter table "PartnerInvoice" enable row level security;

create policy "tenant_isolation_partner_invoice_template" on "PartnerInvoiceTemplate"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

create policy "tenant_isolation_partner_invoice" on "PartnerInvoice"
  for all using ("tenantId" = current_setting('app.tenant_id', true)) with check ("tenantId" = current_setting('app.tenant_id', true));

-- Storage bucket for generated invoice PDFs. Private (public = false) — every
-- download goes through a signed URL issued by the app after an ownership check
-- (src/lib/server/partner-invoices.ts), since the app's real enforcement happens at
-- the application layer, same as every table above.
insert into storage.buckets (id, name, public)
values ('partner-invoices', 'partner-invoices', false)
on conflict (id) do nothing;
