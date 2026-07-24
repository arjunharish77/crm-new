-- Tasks module foundation.
--
-- Run manually in the Supabase SQL Editor, then re-export SCHEMA.md.

create table if not exists "Task" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "title" text not null,
  "description" text,
  "status" text not null default 'OPEN' check ("status" in ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  "priority" text not null default 'MEDIUM' check ("priority" in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  "ownerId" text not null references "User"("id"),
  "createdBy" text references "User"("id"),
  "leadId" text references "Lead"("id"),
  "opportunityId" text references "Opportunity"("id"),
  "activityId" text references "Activity"("id"),
  "dueAt" timestamp without time zone,
  "reminderAt" timestamp without time zone,
  "completedAt" timestamp without time zone,
  "completedBy" text references "User"("id"),
  "metadata" jsonb not null default '{}'::jsonb,
  "createdAt" timestamp without time zone not null default current_timestamp,
  "updatedAt" timestamp without time zone not null default current_timestamp
);

create index if not exists "Task_tenant_status_due_idx" on "Task" ("tenantId", "status", "dueAt");
create index if not exists "Task_owner_due_idx" on "Task" ("tenantId", "ownerId", "dueAt");
create index if not exists "Task_lead_idx" on "Task" ("tenantId", "leadId", "createdAt" desc);
create index if not exists "Task_opportunity_idx" on "Task" ("tenantId", "opportunityId", "createdAt" desc);
create index if not exists "Task_activity_idx" on "Task" ("tenantId", "activityId", "createdAt" desc);
create index if not exists "Task_reminder_idx" on "Task" ("tenantId", "status", "reminderAt");

alter table "Task" enable row level security;

create policy "tenant_isolation_task" on "Task"
  for all
  using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
