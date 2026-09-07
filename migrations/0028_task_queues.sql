-- Task queue operations: team-level queues any team member can claim from, workload
-- balancing across queue members, supervisor reassignment, and queue-aging visibility.
--
-- Reuses the existing Team table as the queue itself (Team.leadId already acts as the
-- team's manager for permission purposes -- confirmed in admin-modules-postgres.ts) rather
-- than introducing a new parallel "TaskQueue" entity. Task.ownerId stays NOT NULL and
-- unchanged (~260 existing call sites assume it's always set): a claimed queue task's
-- ownerId is the claimer, so it gets full existing owner-scoped visibility/automation/
-- reporting for free; an unclaimed queue task's ownerId falls back to the queue's
-- Team.leadId (or stays whatever it already was, if the team has no lead) as a
-- placeholder "responsible party" rather than loosening the NOT NULL constraint.
--
-- Run manually against the database, then re-export SCHEMA.md.

-- Team.id is a native uuid column (unlike Task's text id) -- confirmed via admin-modules-postgres.ts's id::text casts.
alter table "Task" add column if not exists "queueId" uuid references "Team"("id") on delete set null;
alter table "Task" add column if not exists "queuedAt" timestamp with time zone;
alter table "Task" add column if not exists "claimedBy" text references "User"("id") on delete set null;
alter table "Task" add column if not exists "claimedAt" timestamp with time zone;

create index if not exists "Task_tenant_queue_idx" on "Task" ("tenantId", "queueId", "claimedBy");
