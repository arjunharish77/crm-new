-- Priority Module 16 -- Marketplace and App Ecosystem.
-- Confirmed by audit before building: zero marketplace-related code exists anywhere in this
-- codebase (the only prior trace is a single reserved catalog row -- 'MARKETPLACE' in
-- "PlatformModule", migrations/0037_module_entitlements.sql -- a module-entitlement key with
-- no schema or functionality behind it until now). This module's own scope decision names its
-- foundation explicitly: "connector, settings, API key, webhook, RBAC, audit, worker, and
-- tenant configuration" -- all of which are now real (API key management console and both
-- inbound/outbound webhook governance were built earlier this session), so this is genuinely
-- unblocked, not scaffolding on top of missing infrastructure.
--
-- Scope of this pass, stated plainly: this is a single-tenant-hosted CRM, not a multi-vendor
-- SaaS marketplace -- there is no real third-party app publisher ecosystem to seed a curated
-- public catalog from. "isPrivate" defaults true and this pass only builds the
-- custom/private-app registration + install-approval + scoped-permissions + secret-management
-- path (checklist sub-items 1, 3, 4, 5, 7) -- a tenant registers its own internal/private app,
-- requests install, an admin approves it, and it gets scoped module permissions and a rotatable
-- credential. A future public curated catalog (sub-item 2) would set isPrivate=false on rows
-- seeded by a platform-admin-curated publishing flow, not attempted here.

create table if not exists "MarketplaceApp" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  name text not null,
  description text,
  category text not null default 'CUSTOM' check (category in ('CUSTOM','PRODUCTIVITY','COMMUNICATION','ANALYTICS','FINANCE','OTHER')),
  "isPrivate" boolean not null default true,
  "redirectUrls" text[] not null default '{}',
  "webhookUrl" text,
  "eventSubscriptions" text[] not null default '{}',
  "requestedPermissions" jsonb not null default '{}',
  "ownerId" text not null references "User"(id),
  "isActive" boolean not null default true,
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);

-- Full-row version snapshots on every config change, mirroring CallScriptVersion's precedent
-- (migration 0053) -- lets an admin see exactly what a permission/webhook-URL change looked
-- like before, not just that a change happened.
create table if not exists "MarketplaceAppVersion" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  version integer not null,
  "changeNotes" text,
  snapshot jsonb not null,
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  unique ("appId", version)
);

create table if not exists "TenantAppInstall" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  status text not null default 'PENDING_APPROVAL' check (status in ('PENDING_APPROVAL','INSTALLED','REJECTED','SUSPENDED','UNINSTALLED')),
  "requestedBy" text not null references "User"(id),
  "approvedBy" text references "User"(id),
  "approvedAt" timestamptz,
  "rejectedReason" text,
  "suspendedAt" timestamptz,
  "suspendedReason" text,
  "uninstalledAt" timestamptz,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "appId")
);

create table if not exists "TenantAppPermissionGrant" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "installId" text not null references "TenantAppInstall"(id) on delete cascade,
  "moduleKey" text not null,
  scope text not null check (scope in ('read', 'write')),
  "grantedAt" timestamptz not null default now(),
  unique ("installId", "moduleKey")
);

-- Plaintext at rest, matching this codebase's existing, already-accepted precedent for every
-- other integration/API-key secret (ApiKey.secret, ExternalIntegration.secretConfig,
-- inbound-webhook's signing secret) -- no encryption-at-rest exists anywhere in this app today.
-- Rotation follows the exact same current/previousSecret + 24h grace window shape already
-- built twice this session (inbound webhooks, API keys), reused for a third time here.
create table if not exists "TenantAppSecret" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  secret text not null,
  "previousSecret" text,
  "previousSecretExpiresAt" timestamptz,
  "signingSecret" text not null,
  "lastRotatedAt" timestamptz,
  "rotatedBy" text,
  "createdAt" timestamptz not null default now(),
  unique ("appId")
);

create table if not exists "TenantAppEventSubscription" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  "eventType" text not null,
  "isActive" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  unique ("appId", "eventType")
);

-- Real schema for the two named tables this pass's scope does not populate (usage/limits and
-- health monitoring are their own, separately-named checklist sub-items, #10/#11) -- created
-- now since they're explicitly part of sub-item 1's own table list, left genuinely empty
-- rather than faked, and documented honestly as not wired in this pass.
create table if not exists "TenantAppUsage" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  date date not null,
  "requestCount" integer not null default 0,
  "webhookDeliveryCount" integer not null default 0,
  "errorCount" integer not null default 0,
  unique ("appId", date)
);

create table if not exists "TenantAppHealth" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  status text not null default 'UNKNOWN' check (status in ('OK', 'DEGRADED', 'ERROR', 'UNKNOWN')),
  "lastCheckedAt" timestamptz,
  "lastSuccessAt" timestamptz,
  "lastError" text,
  unique ("appId")
);

create index if not exists "TenantAppInstall_tenant_status_idx" on "TenantAppInstall" ("tenantId", status);
create index if not exists "MarketplaceApp_tenant_idx" on "MarketplaceApp" ("tenantId", "isActive");
