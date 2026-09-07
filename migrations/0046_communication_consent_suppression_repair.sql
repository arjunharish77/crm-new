-- Repair migration, found while building Module 15's telephony compliance controls.
-- Migration 0016_communication_connectors.sql is recorded as APPLIED (checksum matches the
-- current file exactly, confirmed against SchemaMigration) yet this environment's actual
-- schema is missing two of the tables it declares: "CommunicationSuppression" and
-- "CommunicationConsent" (the other 4 tables from that same file -- CommunicationProviderConfig,
-- CommunicationTemplate, CommunicationOutbox, CommunicationDeliveryEvent -- all exist
-- correctly). The likely cause is `baselineMigrations` in scripts/db-migrate-local.js, which
-- marks every migration file as APPLIED without executing it when a base-schema dump is
-- restored that's assumed to already contain everything -- if that dump predated these two
-- tables specifically, this exact gap results. This migration re-declares both tables (and
-- their policies) using the identical definitions from 0016, entirely with
-- `if not exists`/`drop ... if exists` guards, so it is a genuine no-op anywhere those tables
-- already exist correctly and only repairs environments with this specific gap.

create table if not exists "CommunicationSuppression" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "address" text not null,
  "reason" text,
  "createdAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "channel", "address")
);

create table if not exists "CommunicationConsent" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "entityType" text not null,
  "entityId" text not null,
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "status" text not null default 'OPTED_IN' check ("status" in ('OPTED_IN', 'OPTED_OUT')),
  "source" text,
  "capturedAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "entityType", "entityId", "channel")
);

alter table "CommunicationSuppression" enable row level security;
alter table "CommunicationConsent" enable row level security;

drop policy if exists "tenant_isolation_communication_suppression" on "CommunicationSuppression";
create policy "tenant_isolation_communication_suppression" on "CommunicationSuppression"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));

drop policy if exists "tenant_isolation_communication_consent" on "CommunicationConsent";
create policy "tenant_isolation_communication_consent" on "CommunicationConsent"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
