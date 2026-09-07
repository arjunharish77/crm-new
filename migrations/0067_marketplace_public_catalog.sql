-- Priority Module 16 -- Marketplace and App Ecosystem: public catalog and vendor publishing.
-- Confirmed decision: a real public catalog is in scope (a tenant can publish an app other
-- tenants discover and install), not just the private/custom-app model the schema pass
-- originally scoped for. Builds on migration 0066's multi-tenant install scoping -- that
-- migration made it SAFE for a second tenant to install someone else's app; this migration
-- adds the actual publish lifecycle and version-approval gate that makes it POSSIBLE.

alter table "MarketplaceApp" add column if not exists "vendorName" text;
alter table "MarketplaceApp" add column if not exists screenshots text[] not null default '{}';
alter table "MarketplaceApp" add column if not exists "docsUrl" text;
alter table "MarketplaceApp" add column if not exists "pricingNotes" text;
alter table "MarketplaceApp" add column if not exists "publishStatus" text not null default 'DRAFT'
  check ("publishStatus" in ('DRAFT','PENDING_REVIEW','PUBLISHED','UNPUBLISHED','REJECTED'));
alter table "MarketplaceApp" add column if not exists "publishRejectedReason" text;
alter table "MarketplaceApp" add column if not exists "publishedAt" timestamptz;
alter table "MarketplaceApp" add column if not exists "publishedBy" text;
alter table "MarketplaceApp" add column if not exists "unpublishedAt" timestamptz;
alter table "MarketplaceApp" add column if not exists "unpublishedBy" text;

-- "Approve vendor/app versions": a platform admin approves the specific version snapshot being
-- published (or a subsequent edit to an already-published app), not just a one-time app-level
-- toggle. Defaults to APPROVED so every pre-existing private-app version (created before this
-- concept existed, and every future private app's own versions) is never retroactively blocked
-- -- only a version tied to a PENDING_REVIEW or already-PUBLISHED app's edit starts PENDING.
alter table "MarketplaceAppVersion" add column if not exists "approvalStatus" text not null default 'APPROVED'
  check ("approvalStatus" in ('PENDING','APPROVED','REJECTED'));
alter table "MarketplaceAppVersion" add column if not exists "approvedBy" text;
alter table "MarketplaceAppVersion" add column if not exists "approvedAt" timestamptz;
alter table "MarketplaceAppVersion" add column if not exists "rejectedReason" text;

create index if not exists "MarketplaceApp_publishStatus_idx" on "MarketplaceApp" ("publishStatus") where "publishStatus" in ('PENDING_REVIEW', 'PUBLISHED');
