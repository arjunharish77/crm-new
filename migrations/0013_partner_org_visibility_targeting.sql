-- Partner hierarchy, payout visibility targeting, and gamification participant targeting.
--
-- Run manually in the Supabase SQL Editor, then re-export SCHEMA.md.

create table if not exists "PartnerOrganization" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "status" text not null default 'ACTIVE' check ("status" in ('ACTIVE', 'SUSPENDED')),
  "parentOrganizationId" text references "PartnerOrganization"("id"),
  "primaryUserId" text references "User"("id"),
  "metadata" jsonb not null default '{}'::jsonb,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

alter table "PartnerProfile"
  add column if not exists "partnerOrganizationId" text references "PartnerOrganization"("id"),
  add column if not exists "parentPartnerProfileId" text references "PartnerProfile"("id"),
  add column if not exists "canAccessPayouts" boolean not null default true,
  add column if not exists "partnerLoginRole" text not null default 'PRIMARY'
    check ("partnerLoginRole" in ('PRIMARY', 'MANAGER', 'MEMBER', 'FINANCE'));

alter table "PartnerPayoutSettings"
  add column if not exists "payoutVisibilityConfig" jsonb not null default
    '{"mode":"ALL_PARTNERS","userIds":[],"teamIds":[],"salesGroupIds":[],"partnerOrganizationIds":[]}'::jsonb;

alter table "Payout"
  add column if not exists "partnerOrganizationId" text references "PartnerOrganization"("id");

alter table "GamificationSettings"
  add column if not exists "participantConfig" jsonb not null default
    '{"mode":"ALL","userIds":[],"teamIds":[],"salesGroupIds":[],"partnerOrganizationIds":[]}'::jsonb;

create index if not exists "PartnerOrganization_tenant_status_idx"
  on "PartnerOrganization" ("tenantId", "status");

create index if not exists "PartnerOrganization_parent_idx"
  on "PartnerOrganization" ("tenantId", "parentOrganizationId");

create index if not exists "PartnerProfile_org_idx"
  on "PartnerProfile" ("tenantId", "partnerOrganizationId");

create index if not exists "PartnerProfile_parent_idx"
  on "PartnerProfile" ("tenantId", "parentPartnerProfileId");

create index if not exists "Payout_partner_org_idx"
  on "Payout" ("tenantId", "partnerOrganizationId", "payoutCycleId");

alter table "PartnerOrganization" enable row level security;

create policy "tenant_isolation_partner_organization" on "PartnerOrganization"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
