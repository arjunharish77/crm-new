-- Gamification + Partner Payouts, Step 3a: Partner role + portal routing.
--
-- This repo has no migration tool (see 01_SCHEMA_EXPORT_INSTRUCTIONS.md) — run this
-- manually in the Supabase SQL Editor, then re-export SCHEMA.md so it stays accurate.
--
-- Note: the app's real DB access always uses the service-role key (bypasses RLS),
-- so the RLS policy below is documentation/defense-in-depth, matching every other
-- table in this schema — actual tenant/owner scoping is enforced in application code
-- (src/lib/server/crm.ts's applyOwnerScope, src/lib/server/partners.ts).

create table if not exists "PartnerProfile" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "userId" text not null unique references "User"("id"),
  "legalBusinessName" text not null,
  "gstin" text,
  "panNumber" text,
  "registeredAddress" jsonb,
  "registeredState" text,
  "status" text not null default 'ACTIVE',
  "invoiceNumberPrefix" text not null default 'INV',
  "invoiceNumberCounter" integer not null default 0,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "PartnerProfile_tenantId_idx" on "PartnerProfile" ("tenantId");

alter table "PartnerProfile" enable row level security;

create policy "tenant_isolation_partner_profile" on "PartnerProfile"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
