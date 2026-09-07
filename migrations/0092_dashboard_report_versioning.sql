-- Gap checklist Module 17 ("dashboard/report versioning": draft/publish, change history, clone,
-- rollback, owner transfer, usage metrics, deprecation workflow). Mirrors MarketingJourneyVersion's
-- shape -- this codebase's only existing draft/publish/rollback precedent: a version is an
-- immutable snapshot inserted at publish time, and rollback re-applies an old snapshot then
-- republishes it as a brand new version at the tip (like a git revert, not a git reset) rather
-- than rewinding version numbers, since old versions must stay addressable forever.
--
-- "Dashboard" in this codebase is a DashboardTab (a named, ordered, per-owner collection of
-- DashboardWidget rows) -- there is no separate "Dashboard" entity to version. Per explicit user
-- direction ("include tab structure in each version"), a dashboard version snapshots the tab's
-- own metadata AND the full definition (title/type/config/layout/visibility) of every widget
-- currently assigned to it, not layout-only like the pre-existing DashboardLayoutSnapshot.
--
-- No RLS policy added, matching the precedent set by every migration since 0080: tenant scoping
-- is enforced at the application query layer.

alter table "DashboardTab" add column if not exists "currentVersion" integer not null default 0;
alter table "DashboardTab" add column if not exists "deprecationStatus" text not null default 'ACTIVE' check ("deprecationStatus" in ('ACTIVE', 'DEPRECATED'));
alter table "DashboardTab" add column if not exists "deprecatedReason" text;
alter table "DashboardTab" add column if not exists "deprecatedAt" timestamptz;
alter table "DashboardTab" add column if not exists "viewCount" integer not null default 0;
alter table "DashboardTab" add column if not exists "lastOpenedAt" timestamptz;

create table if not exists "DashboardTabVersion" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "tabId" text not null references "DashboardTab"(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  "publishNotes" text,
  "publishedBy" text references "User"(id) on delete set null,
  "publishedAt" timestamptz not null default now(),
  unique ("tabId", version)
);
create index if not exists "DashboardTabVersion_tab_idx" on "DashboardTabVersion" ("tenantId", "tabId");

-- CustomReport already has viewCount/lastOpenedAt (migration 0029), but only ever wired for
-- chartType='SAVED_VIEW' rows (recordSavedViewOpened) -- real reports (chartType <> 'SAVED_VIEW')
-- get their own equivalent tracking function this pass, reusing the same columns.
alter table "CustomReport" add column if not exists "currentVersion" integer not null default 0;
alter table "CustomReport" add column if not exists "deprecationStatus" text not null default 'ACTIVE' check ("deprecationStatus" in ('ACTIVE', 'DEPRECATED'));
alter table "CustomReport" add column if not exists "deprecatedReason" text;
alter table "CustomReport" add column if not exists "deprecatedAt" timestamptz;

create table if not exists "CustomReportVersion" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "reportId" text not null references "CustomReport"(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  "publishNotes" text,
  "publishedBy" text references "User"(id) on delete set null,
  "publishedAt" timestamptz not null default now(),
  unique ("reportId", version)
);
create index if not exists "CustomReportVersion_report_idx" on "CustomReportVersion" ("tenantId", "reportId");
