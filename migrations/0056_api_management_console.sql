-- Priority Module 9 -- Data Platform, Integrations, and Governance: API management console.
-- Confirmed by audit before building: no generic "API key" concept exists anywhere in this
-- codebase for authenticating INBOUND calls to the CRM's own API. `IntegrationSetting` (used by
-- telephony/inbound-webhook config) is UNIQUE(tenantId, type) -- one row per tenant per type --
-- and structurally cannot hold multiple, independently creatable/revocable keys per tenant.
-- This follows the same multi-row-per-tenant shape ExternalIntegration/CommunicationProviderConfig
-- already use instead (config/secretConfig-style split, isActive, audit columns).
--
-- The secret is stored in plaintext, matching this codebase's existing, explicitly-documented
-- precedent for every other integration secret (ExternalIntegration.secretConfig,
-- CommunicationProviderConfig.secretConfig, the inbound-webhook signing secret) -- no
-- encryption-at-rest exists anywhere in this app today. This is a deliberate requirement here,
-- not just convention-following: the "request signing" sub-item needs the raw secret bytes to
-- compute an HMAC the same way the caller did: a one-way hash (e.g. bcrypt) would make
-- signature verification impossible, not just less convenient.
create table if not exists "ApiKey" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  name text not null,
  secret text not null,
  "previousSecret" text,
  "previousSecretExpiresAt" timestamptz,
  permissions jsonb not null default '{}',
  "ipAllowlist" text[],
  "rateLimitPerMinute" integer not null default 60,
  "expiresAt" timestamptz,
  "lastUsedAt" timestamptz,
  "lastUsedIp" text,
  "isActive" boolean not null default true,
  "revokedAt" timestamptz,
  "createdBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", name)
);

create index if not exists "ApiKey_tenant_idx" on "ApiKey" ("tenantId", "isActive");
