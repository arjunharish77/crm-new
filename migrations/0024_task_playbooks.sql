-- Task Playbooks: reusable, named sets of follow-up tasks that get created together
-- for a Lead or Opportunity -- either applied manually from the record's detail page,
-- or applied by a normal Automation workflow via the "apply_task_playbook" action node
-- (reuses the existing Automation trigger/condition engine rather than building a
-- second, parallel trigger system).
--
-- Run manually against the database, then re-export SCHEMA.md.

create table if not exists "TaskPlaybook" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "name" text not null,
  "description" text,
  "targetModule" text not null default 'BOTH'
    check ("targetModule" in ('LEAD', 'OPPORTUNITY', 'BOTH')),
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "name")
);

create table if not exists "TaskPlaybookItem" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "playbookId" text not null references "TaskPlaybook"("id") on delete cascade,
  "itemOrder" integer not null default 1,
  "title" text not null,
  "description" text,
  "priority" text not null default 'MEDIUM'
    check ("priority" in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  "dueInDays" integer not null default 1,
  "assignToRecordOwner" boolean not null default true,
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "playbookId", "itemOrder")
);

-- One row per "apply" action -- lets the UI show "which playbooks have already been
-- applied to this record" and which real Task rows a given application created.
create table if not exists "TaskPlaybookApplication" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "playbookId" text references "TaskPlaybook"("id") on delete set null,
  "leadId" text references "Lead"("id") on delete set null,
  "opportunityId" text references "Opportunity"("id") on delete set null,
  "taskIds" jsonb not null default '[]'::jsonb,
  "appliedBy" text references "User"("id"),
  "source" text not null default 'MANUAL' check ("source" in ('MANUAL', 'AUTOMATION')),
  "createdAt" timestamp with time zone not null default current_timestamp
);

create index if not exists "TaskPlaybook_tenant_active_idx"
  on "TaskPlaybook" ("tenantId", "targetModule", "isActive");
create index if not exists "TaskPlaybookItem_playbook_idx"
  on "TaskPlaybookItem" ("tenantId", "playbookId", "itemOrder");
create index if not exists "TaskPlaybookApplication_lead_idx"
  on "TaskPlaybookApplication" ("tenantId", "leadId", "createdAt" desc);
create index if not exists "TaskPlaybookApplication_opportunity_idx"
  on "TaskPlaybookApplication" ("tenantId", "opportunityId", "createdAt" desc);
create index if not exists "TaskPlaybookApplication_playbook_idx"
  on "TaskPlaybookApplication" ("tenantId", "playbookId", "createdAt" desc);

alter table "TaskPlaybook" enable row level security;
alter table "TaskPlaybookItem" enable row level security;
alter table "TaskPlaybookApplication" enable row level security;

create policy "tenant_isolation_task_playbook" on "TaskPlaybook"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_task_playbook_item" on "TaskPlaybookItem"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_task_playbook_application" on "TaskPlaybookApplication"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
