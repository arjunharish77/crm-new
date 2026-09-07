-- Task SLA integration: due SLA, first-action SLA, a real per-tenant/per-priority policy
-- (Activity.defaultSLA exists but is never actually consumed anywhere in the app -- this
-- pass makes sure Task's equivalent is genuinely wired up, not another dormant column),
-- a dedicated breach audit log (no existing "breach history" table to reuse -- AuditLog
-- only records field diffs on explicit edits, not a periodic breach scan), and reuses the
-- existing per-task escalateAfterMinutes/escalateToUserId columns for SLA escalation rather
-- than inventing a second escalation mechanism alongside the one reminders already use.
--
-- Run manually against the database, then re-export SCHEMA.md.

alter table "Task" add column if not exists "slaTarget" timestamp with time zone;
alter table "Task" add column if not exists "firstActionAt" timestamp with time zone;
alter table "Task" add column if not exists "firstActionSlaTarget" timestamp with time zone;
alter table "Task" add column if not exists "slaStatus" text check ("slaStatus" in ('PENDING', 'MET', 'BREACHED'));

create table if not exists "TaskSlaPolicy" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "priority" text not null check ("priority" in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  "firstActionMinutes" integer,
  "completionMinutes" integer,
  "isActive" boolean not null default true,
  "createdBy" text references "User"("id"),
  "updatedBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "priority")
);

create table if not exists "TaskSlaBreach" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "taskId" text not null references "Task"("id") on delete cascade,
  "breachType" text not null check ("breachType" in ('FIRST_ACTION', 'COMPLETION')),
  "ownerId" text references "User"("id"),
  "breachedAt" timestamp with time zone not null default current_timestamp,
  "createdAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "taskId", "breachType")
);

create index if not exists "Task_tenant_sla_status_idx" on "Task" ("tenantId", "slaStatus");
create index if not exists "TaskSlaBreach_tenant_owner_idx" on "TaskSlaBreach" ("tenantId", "ownerId", "createdAt" desc);
create index if not exists "TaskSlaBreach_tenant_type_idx" on "TaskSlaBreach" ("tenantId", "breachType", "createdAt" desc);

alter table "TaskSlaPolicy" enable row level security;
alter table "TaskSlaBreach" enable row level security;

create policy "tenant_isolation_task_sla_policy" on "TaskSlaPolicy"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_task_sla_breach" on "TaskSlaBreach"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
