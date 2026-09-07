-- Gap checklist Module 17, item 4 (advanced dashboard builder: dashboard tabs + saved dashboard
-- states). Tabs are scoped per-owner, not per-viewer: a widget shared to you (TEAM/TENANT
-- visibility) always shows up in an implicit "Shared with you" pseudo-tab on the client rather
-- than trying to reconcile your tab structure against the owner's -- two different users' tabs
-- have no natural correspondence, so this sidesteps that problem entirely rather than guessing.
-- No RLS policy added, matching the precedent set by every migration since 0080: tenant
-- scoping is enforced at the application query layer.

create table if not exists "DashboardTab" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "userId" text not null references "User"(id) on delete cascade,
  name text not null,
  "order" integer not null default 0,
  "isDefault" boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  unique ("tenantId", "userId", name)
);
create index if not exists "DashboardTab_tenant_user_idx" on "DashboardTab" ("tenantId", "userId");

alter table "DashboardWidget" add column if not exists "tabId" text references "DashboardTab"(id) on delete set null;

-- Saved dashboard states: a named snapshot of {widgetId, tabId, x, y, w, h} for every widget the
-- saving user currently owns. Deliberately narrow -- restoring re-applies tab assignment and
-- grid position only, never a widget's data-source config, and skips any widgetId the snapshot
-- references that no longer exists (deleted since the snapshot was taken) rather than failing
-- the whole restore.
create table if not exists "DashboardLayoutSnapshot" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "userId" text not null references "User"(id) on delete cascade,
  name text not null,
  snapshot jsonb not null default '[]'::jsonb,
  "createdAt" timestamptz not null default now(),
  unique ("tenantId", "userId", name)
);
create index if not exists "DashboardLayoutSnapshot_tenant_user_idx" on "DashboardLayoutSnapshot" ("tenantId", "userId");

-- Backfill: every (tenantId, userId) that already owns at least one widget gets a default
-- "Main" tab, and all their existing widgets are assigned to it -- otherwise every pre-existing
-- dashboard would render with zero visible tabs after this ships.
-- md5(random()::text || clock_timestamp()::text || <natural key>) for generated ids -- no
-- uuid/pgcrypto extension is enabled anywhere in this schema (confirmed by grep, same
-- constraint noted in migration 0082) to rely on gen_random_uuid().
insert into "DashboardTab" (id, "tenantId", "userId", name, "order", "isDefault", "createdAt", "updatedAt")
select md5(random()::text || clock_timestamp()::text || "tenantId" || "userId"), "tenantId", "userId", 'Main', 0, true, now(), now()
from (select distinct "tenantId", "userId" from "DashboardWidget" where "userId" is not null) owners
on conflict ("tenantId", "userId", name) do nothing;

update "DashboardWidget" w
set "tabId" = t.id
from "DashboardTab" t
where w."tabId" is null and w."userId" = t."userId" and w."tenantId" = t."tenantId" and t."isDefault" = true;

-- True 2D grid backfill: w/h previously meant "1 or 2 columns of a fixed 12-col CSS grid with a
-- fixed pixel height per card" (rendered entirely in CSS, never a real grid library) -- under
-- react-grid-layout's true grid, those same small integers would render as a sliver. Widen
-- existing rows to sane real-grid defaults; anything already bigger than the old scheme
-- (shouldn't exist, but defensive) is left alone.
update "DashboardWidget" set w = 4 where w <= 1;
update "DashboardWidget" set w = 8 where w = 2;
update "DashboardWidget" set h = 3 where h <= 1;
