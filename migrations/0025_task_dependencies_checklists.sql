-- Task dependency/checklist model: subtasks (via a self-referencing parentTaskId),
-- blocking dependencies (a Task can require other Tasks to complete first), checklist
-- items within a Task, and a "require a completion note" guard enforced at the moment
-- a Task is marked COMPLETED.
--
-- "Blocked/waiting" is deliberately NOT a new stored status value -- it is derived at
-- read time from whether any TaskDependency blocker is still incomplete, so it can never
-- drift out of sync with the dependency graph.
--
-- Run manually against the database, then re-export SCHEMA.md.

alter table "Task" add column if not exists "parentTaskId" text references "Task"("id") on delete set null;
alter table "Task" add column if not exists "requireCompletionNote" boolean not null default false;
alter table "Task" add column if not exists "completionNote" text;

create index if not exists "Task_tenant_parent_idx" on "Task" ("tenantId", "parentTaskId");

create table if not exists "TaskDependency" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "taskId" text not null references "Task"("id") on delete cascade,
  "blockedByTaskId" text not null references "Task"("id") on delete cascade,
  "createdBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp,
  check ("taskId" <> "blockedByTaskId"),
  unique ("tenantId", "taskId", "blockedByTaskId")
);

create table if not exists "TaskChecklistItem" (
  "id" text primary key,
  "tenantId" text not null references "Tenant"("id"),
  "taskId" text not null references "Task"("id") on delete cascade,
  "itemOrder" integer not null default 1,
  "title" text not null,
  "isDone" boolean not null default false,
  "completedAt" timestamp with time zone,
  "completedBy" text references "User"("id"),
  "createdAt" timestamp with time zone not null default current_timestamp,
  "updatedAt" timestamp with time zone not null default current_timestamp,
  unique ("tenantId", "taskId", "itemOrder")
);

create index if not exists "TaskDependency_task_idx" on "TaskDependency" ("tenantId", "taskId");
create index if not exists "TaskDependency_blocked_by_idx" on "TaskDependency" ("tenantId", "blockedByTaskId");
create index if not exists "TaskChecklistItem_task_idx" on "TaskChecklistItem" ("tenantId", "taskId", "itemOrder");

alter table "TaskDependency" enable row level security;
alter table "TaskChecklistItem" enable row level security;

create policy "tenant_isolation_task_dependency" on "TaskDependency"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
create policy "tenant_isolation_task_checklist_item" on "TaskChecklistItem"
  for all using ("tenantId" = current_setting('app.tenant_id', true))
  with check ("tenantId" = current_setting('app.tenant_id', true));
