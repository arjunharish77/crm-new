-- Builder save model for automations (UI/UX plan decision 29): the builder saves a draft as you
-- work; nothing changes what runs until the draft is published; every publish is kept as a
-- numbered version that can be restored as a draft.
--
-- "AutomationV2".name/description/trigger/workflow stay the published (live) definition the
-- engine reads, so runtime behaviour doesn't change. "draft" holds unpublished changes
-- ({ name, description, trigger, workflow }), or null when there are none.
-- "publishedVersion" 0 means never published: such an automation can't be turned on.

alter table "AutomationV2"
  add column if not exists draft jsonb,
  add column if not exists "draftUpdatedAt" timestamptz,
  add column if not exists "draftUpdatedBy" text,
  add column if not exists "publishedVersion" integer not null default 0,
  add column if not exists "publishedAt" timestamptz;

create table if not exists "AutomationVersion" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "automationId" text not null references "AutomationV2"(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null,
  description text,
  trigger jsonb not null,
  workflow jsonb not null,
  notes text,
  "publishedBy" text,
  "publishedAt" timestamptz not null default now(),
  unique ("automationId", version)
);
create index if not exists "AutomationVersion_tenant_automation_idx" on "AutomationVersion" ("tenantId", "automationId", version desc);
alter table "AutomationVersion" enable row level security;
drop policy if exists tenant_scope on "AutomationVersion";
create policy tenant_scope on "AutomationVersion"
  using ("tenantId" = nullif(current_setting('app.tenant_id', true), ''))
  with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));

-- Every existing automation is live today: record what's running as its version 1.
insert into "AutomationVersion" (id, "tenantId", "automationId", version, name, description, trigger, workflow, notes, "publishedAt")
select gen_random_uuid()::text, a."tenantId", a.id, 1, a.name, a.description, a.trigger, coalesce(a.workflow, '{"nodes":[],"edges":[]}'::jsonb),
       'Existing definition when versions were introduced', coalesce(a."updatedAt", now())
from "AutomationV2" a
where a."publishedVersion" = 0 and a."tenantId" is not null
on conflict ("automationId", version) do nothing;

update "AutomationV2" set "publishedVersion" = 1, "publishedAt" = coalesce("updatedAt", now())
where "publishedVersion" = 0;
