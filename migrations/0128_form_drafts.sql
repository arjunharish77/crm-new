-- Builder save model for forms (UI/UX plan decision 29): the form editor saves a draft; the
-- public form only changes when the draft is published; every publish is kept as a version.
--
-- "Form".fields/config (and the columns derived from config) stay the published form that the
-- public link shows. "draft" holds unpublished content changes ({ fields, config }); placements
-- (where the form appears inside the CRM) and on/off are not drafted -- they apply at once, as
-- before. "publishedVersion" counts publishes.

alter table "Form"
  add column if not exists draft jsonb,
  add column if not exists "draftUpdatedAt" timestamptz,
  add column if not exists "draftUpdatedBy" text,
  add column if not exists "publishedVersion" integer not null default 0,
  add column if not exists "publishedAt" timestamptz;

create table if not exists "FormVersion" (
  id text primary key,
  "tenantId" text not null references "Tenant"(id) on delete cascade,
  "formId" text not null references "Form"(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null,
  fields jsonb not null,
  config jsonb not null,
  notes text,
  "publishedBy" text,
  "publishedAt" timestamptz not null default now(),
  unique ("formId", version)
);
create index if not exists "FormVersion_tenant_form_idx" on "FormVersion" ("tenantId", "formId", version desc);
alter table "FormVersion" enable row level security;
drop policy if exists tenant_scope on "FormVersion";
create policy tenant_scope on "FormVersion"
  using ("tenantId" = nullif(current_setting('app.tenant_id', true), ''))
  with check ("tenantId" = nullif(current_setting('app.tenant_id', true), ''));

-- Every existing form is published today: record it as version 1.
insert into "FormVersion" (id, "tenantId", "formId", version, name, fields, config, notes, "publishedAt")
select gen_random_uuid()::text, f."tenantId", f.id, 1, f.name, coalesce(f.fields, '[]'::jsonb), coalesce(f.config, '{}'::jsonb),
       'Existing form when versions were introduced', coalesce(f."updatedAt", now())
from "Form" f
where f."publishedVersion" = 0 and f."tenantId" is not null
on conflict ("formId", version) do nothing;

update "Form" set "publishedVersion" = 1, "publishedAt" = coalesce("updatedAt", now()) where "publishedVersion" = 0;
