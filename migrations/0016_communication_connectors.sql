-- Communication connectors, templates, consent, outbox, and delivery events.
--
-- Provider secrets are stored server-side in secretConfig and must never be
-- returned by list/detail APIs without redaction.

create table if not exists "CommunicationProviderConfig" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "providerType" text not null check ("providerType" in ('SMTP', 'GENERIC_HTTP')),
  "name" text not null,
  "config" jsonb not null default '{}'::jsonb,
  "secretConfig" jsonb not null default '{}'::jsonb,
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "channel", "name")
);

create table if not exists "SenderIdentity" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "name" text not null,
  "address" text not null,
  "providerConfigId" text references "CommunicationProviderConfig"("id"),
  "isDefault" boolean not null default false,
  "isVerified" boolean not null default false,
  "metadata" jsonb not null default '{}'::jsonb,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
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

create table if not exists "CommunicationSuppression" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "address" text not null,
  "reason" text,
  "createdAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "channel", "address")
);

create table if not exists "CommunicationTemplate" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "name" text not null,
  "subject" text,
  "body" text not null,
  "tokens" text[] not null default '{}',
  "metadata" jsonb not null default '{}'::jsonb,
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp,
  unique ("tenantId", "channel", "name")
);

create table if not exists "CommunicationOutbox" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "providerConfigId" text references "CommunicationProviderConfig"("id"),
  "senderIdentityId" text references "SenderIdentity"("id"),
  "templateId" text references "CommunicationTemplate"("id"),
  "recipient" text not null,
  "subject" text,
  "body" text not null,
  "payload" jsonb not null default '{}'::jsonb,
  "status" text not null default 'QUEUED' check ("status" in ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED')),
  "attempts" integer not null default 0,
  "nextAttemptAt" timestamp without time zone not null default current_timestamp,
  "lastAttemptAt" timestamp without time zone,
  "sentAt" timestamp without time zone,
  "error" text,
  "sourceType" text,
  "sourceId" text,
  "entityType" text,
  "entityId" text,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create table if not exists "CommunicationDeliveryEvent" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "outboxId" text references "CommunicationOutbox"("id"),
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "eventType" text not null,
  "providerMessageId" text,
  "providerPayload" jsonb not null default '{}'::jsonb,
  "entityType" text,
  "entityId" text,
  "occurredAt" timestamp without time zone not null default current_timestamp,
  "createdAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "CommunicationProvider_tenant_channel_idx"
  on "CommunicationProviderConfig" ("tenantId", "channel", "isActive");
create index if not exists "SenderIdentity_tenant_channel_idx"
  on "SenderIdentity" ("tenantId", "channel", "isDefault");
create index if not exists "CommunicationOutbox_due_idx"
  on "CommunicationOutbox" ("tenantId", "status", "nextAttemptAt");
create index if not exists "CommunicationOutbox_entity_idx"
  on "CommunicationOutbox" ("tenantId", "entityType", "entityId", "createdAt" desc);
create index if not exists "CommunicationDeliveryEvent_entity_idx"
  on "CommunicationDeliveryEvent" ("tenantId", "entityType", "entityId", "occurredAt" desc);

alter table "CommunicationProviderConfig" enable row level security;
alter table "SenderIdentity" enable row level security;
alter table "CommunicationConsent" enable row level security;
alter table "CommunicationSuppression" enable row level security;
alter table "CommunicationTemplate" enable row level security;
alter table "CommunicationOutbox" enable row level security;
alter table "CommunicationDeliveryEvent" enable row level security;

create policy "tenant_isolation_communication_provider" on "CommunicationProviderConfig"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_sender_identity" on "SenderIdentity"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_communication_consent" on "CommunicationConsent"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_communication_suppression" on "CommunicationSuppression"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_communication_template" on "CommunicationTemplate"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_communication_outbox" on "CommunicationOutbox"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_communication_delivery_event" on "CommunicationDeliveryEvent"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
