-- Priority Module 16 -- Marketplace and App Ecosystem: multi-tenant install scoping.
-- Confirmed decision: this CRM will support a real public app catalog (a published app owned
-- by one tenant, installable by other tenants), not just the private/custom-app model this
-- module was originally scoped for. That single-owner-installer assumption was baked into 4
-- tables via a unique constraint on "appId" alone -- TenantAppSecret, TenantAppHealth,
-- TenantAppUsage, TenantAppEventSubscription -- even though all 4 already carry a "tenantId"
-- column (it was always populated with the owning tenant's id, just never used to allow a
-- SECOND tenant's row to coexist). TenantAppInstall and TenantAppPermissionGrant were already
-- correctly scoped (unique on tenantId+appId, and keyed by installId respectively) -- only
-- these 4 needed the same treatment. Without this, a second tenant installing someone else's
-- published app would either fail outright (unique violation) or -- worse, for the tables
-- fixed at the query layer rather than the constraint layer -- silently share the owning
-- tenant's credential, health status, and usage counters. This migration and its paired code
-- changes (marketplace-inbound.ts, marketplace-postgres.ts, marketplace-events.ts) close that
-- gap before any catalog-browsing/install-from-catalog UI is built on top of it.

alter table "TenantAppSecret" drop constraint if exists "TenantAppSecret_appId_key";
alter table "TenantAppSecret" add constraint "TenantAppSecret_tenantId_appId_key" unique ("tenantId", "appId");

alter table "TenantAppHealth" drop constraint if exists "TenantAppHealth_appId_key";
alter table "TenantAppHealth" add constraint "TenantAppHealth_tenantId_appId_key" unique ("tenantId", "appId");

alter table "TenantAppUsage" drop constraint if exists "TenantAppUsage_appId_date_key";
alter table "TenantAppUsage" add constraint "TenantAppUsage_tenantId_appId_date_key" unique ("tenantId", "appId", date);

alter table "TenantAppEventSubscription" drop constraint if exists "TenantAppEventSubscription_appId_eventType_key";
alter table "TenantAppEventSubscription" add constraint "TenantAppEventSubscription_tenantId_appId_eventType_key" unique ("tenantId", "appId", "eventType");

alter table "TenantAppDelivery" drop constraint if exists "TenantAppDelivery_appId_idempotencyKey_key";
alter table "TenantAppDelivery" add constraint "TenantAppDelivery_tenantId_appId_idempotencyKey_key" unique ("tenantId", "appId", "idempotencyKey");
