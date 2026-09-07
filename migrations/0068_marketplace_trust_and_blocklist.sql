-- Priority Module 16 -- Marketplace and App Ecosystem: vendor trust level + tenant allow/block
-- list (the last 2 sub-items of "marketplace security controls"). Both were previously marked
-- not-applicable on the grounds that they presuppose a public vendor catalog -- now that one is
-- real (see migration 0067), they're buildable rather than permanently out of scope.

alter table "MarketplaceApp" add column if not exists "trustLevel" text not null default 'UNVERIFIED'
  check ("trustLevel" in ('UNVERIFIED','VERIFIED','TRUSTED'));
alter table "MarketplaceApp" add column if not exists "trustLevelSetBy" text;
alter table "MarketplaceApp" add column if not exists "trustLevelSetAt" timestamptz;

-- A platform admin blocking a specific tenant from a specific app -- e.g. a contractual
-- restriction or a support dispute -- prevents only NEW install requests (requestInstallOf
-- PublishedApp), matching how unpublishApp also never touches installs that already exist.
create table if not exists "MarketplaceAppTenantBlock" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id),
  "appId" text not null references "MarketplaceApp"(id) on delete cascade,
  reason text,
  "blockedBy" text,
  "createdAt" timestamptz not null default now(),
  unique ("tenantId", "appId")
);
