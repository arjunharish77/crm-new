-- Recurring tasks and smart reminders.
--
-- Recurrence is deliberately NOT a cron-polled "nextRunAt" schedule -- completing (or
-- explicitly skipping) a Task that carries a recurrenceRule synchronously spawns the next
-- occurrence, the same way everyday task apps (Todoist, Things, etc.) handle "repeat".
-- This needs no new worker job: the existing complete/skip code path does it inline.
--
-- Reminders gain a direct Notification to the task owner (previously reminders only fired
-- an automation event with no default notification -- see project notes) plus an optional
-- escalation: if nobody acts within escalateAfterMinutes of the reminder firing, a second
-- Notification goes to escalateToUserId.
--
-- Run manually against the database, then re-export SCHEMA.md.

alter table "Task" add column if not exists "recurrenceRule" jsonb;
alter table "Task" add column if not exists "seriesId" text;
alter table "Task" add column if not exists "escalateAfterMinutes" integer;
alter table "Task" add column if not exists "escalateToUserId" text references "User"("id");

create index if not exists "Task_tenant_series_idx" on "Task" ("tenantId", "seriesId");
