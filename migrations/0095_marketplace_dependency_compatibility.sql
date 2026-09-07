-- Gap checklist Module 16's app dependency and compatibility checks -- 3 more named sub-items
-- built per explicit user decisions: required CRM modules, deprecated-app warning, and a real
-- per-install version history/rollback mechanism (app-to-app dependencies and contract-version
-- compatibility were already real from an earlier pass).

-- Required CRM modules: an app can declare which platform modules a tenant must have enabled
-- before installing/approving it (e.g. "requires Service Desk"), checked the same way the
-- already-real app-to-app dependency check is (at approval time, not registration time).
alter table "MarketplaceApp" add column if not exists "requiredModuleKeys" text[] not null default '{}';

-- Deprecated-app warning: an owner-set signal (this app is deprecated in favor of something
-- else), shown wherever an app is discoverable -- not an install-blocking gate, matching
-- "trustLevel"'s own precedent of being informational rather than an enforcement rule.
alter table "MarketplaceApp" add column if not exists "isDeprecated" boolean not null default false;
alter table "MarketplaceApp" add column if not exists "deprecationMessage" text;

-- Real per-install version tracking: which MarketplaceAppVersion this specific tenant's install
-- last had its permission grants materialized against -- set at initial approval and again at
-- every subsequent permission-change approval (tenant-admin or platform-admin). Nullable so
-- every pre-existing install (approved before this column existed) is left honestly unknown
-- rather than backfilled with a guess.
alter table "TenantAppInstall" add column if not exists "installedVersion" integer;
