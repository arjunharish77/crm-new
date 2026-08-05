-- Marketing communications campaigns, audiences, approvals, and analytics.
--
-- Run manually in the PostgreSQL database, then re-export SCHEMA.md.

create table if not exists "MarketingCampaign" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "description" text,
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "campaignType" text not null default 'BROADCAST'
    check ("campaignType" in ('BROADCAST', 'DRIP')),
  "status" text not null default 'DRAFT'
    check ("status" in ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'PAUSED', 'CANCELLED')),
  "audienceType" text not null default 'LEAD_LIST'
    check ("audienceType" in ('LEAD_LIST', 'SAVED_VIEW', 'MANUAL')),
  "audienceConfig" jsonb not null default '{}'::jsonb,
  "templateId" text references "CommunicationTemplate"("id"),
  "providerConfigId" text references "CommunicationProviderConfig"("id"),
  "senderIdentityId" text references "SenderIdentity"("id"),
  "subject" text,
  "body" text not null default '',
  "tokens" jsonb not null default '{}'::jsonb,
  "utmDefaults" jsonb not null default '{}'::jsonb,
  "fallbackConfig" jsonb not null default '{}'::jsonb,
  "throttlePerMinute" integer not null default 60,
  "quietHours" jsonb not null default '{"enabled":true,"start":"21:00","end":"09:00"}'::jsonb,
  "scheduledAt" timestamp with time zone,
  "approvedBy" text references "User"("id"),
  "approvedAt" timestamp with time zone,
  "createdBy" text references "User"("id"),
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp
);

create table if not exists "MarketingCampaignStep" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "campaignId" text not null references "MarketingCampaign"("id") on delete cascade,
  "stepOrder" integer not null default 1,
  "delayMinutes" integer not null default 0,
  "channel" text not null check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "templateId" text references "CommunicationTemplate"("id"),
  "subject" text,
  "body" text not null default '',
  "fallbackChannel" text check ("fallbackChannel" in ('EMAIL', 'WHATSAPP', 'SMS')),
  "metadata" jsonb not null default '{}'::jsonb,
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "campaignId", "stepOrder")
);

create table if not exists "MarketingCampaignRecipient" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "campaignId" text not null references "MarketingCampaign"("id") on delete cascade,
  "entityType" text not null,
  "entityId" text not null,
  "recipient" text not null,
  "status" text not null default 'PENDING'
    check ("status" in ('PENDING', 'QUEUED', 'SENT', 'FAILED', 'SUPPRESSED')),
  "outboxId" text references "CommunicationOutbox"("id"),
  "metadata" jsonb not null default '{}'::jsonb,
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp
);

create index if not exists "MarketingCampaign_tenant_status_idx"
  on "MarketingCampaign" ("tenantId", "status", "updatedAt" desc);
create index if not exists "MarketingCampaign_created_by_idx"
  on "MarketingCampaign" ("tenantId", "createdBy", "updatedAt" desc);
create index if not exists "MarketingCampaignStep_campaign_idx"
  on "MarketingCampaignStep" ("tenantId", "campaignId", "stepOrder");
create index if not exists "MarketingCampaignRecipient_campaign_idx"
  on "MarketingCampaignRecipient" ("tenantId", "campaignId", "status");
create index if not exists "MarketingCampaignRecipient_entity_idx"
  on "MarketingCampaignRecipient" ("tenantId", "entityType", "entityId");

alter table "MarketingCampaign" enable row level security;
alter table "MarketingCampaignStep" enable row level security;
alter table "MarketingCampaignRecipient" enable row level security;

create policy "tenant_isolation_marketing_campaign" on "MarketingCampaign"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_marketing_campaign_step" on "MarketingCampaignStep"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_marketing_campaign_recipient" on "MarketingCampaignRecipient"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
