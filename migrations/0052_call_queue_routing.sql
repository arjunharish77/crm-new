-- Priority Module 15 -- Telephony: call queues and routing.
-- Confirmed by audit before building: TelephonyCallLog had no queue-related columns at all.
-- Task.queueId already reuses "Team" directly as the queue entity (migration
-- 0028_task_queues.sql) rather than a separate TaskQueue table -- this migration follows that
-- exact precedent for calls instead of inventing a parallel queue concept.

alter table "TelephonyCallLog"
  add column if not exists "queueId" uuid references "Team"(id),
  add column if not exists "queueType" text check ("queueType" in ('INBOUND', 'MISSED_CALLBACK', 'CAMPAIGN', 'PARTNER')),
  add column if not exists "priority" text not null default 'MEDIUM' check ("priority" in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  add column if not exists "queuedAt" timestamptz,
  add column if not exists "claimedBy" text references "User"(id),
  add column if not exists "claimedAt" timestamptz;

create index if not exists "TelephonyCallLog_queue_idx" on "TelephonyCallLog" ("tenantId", "queueId") where "queueId" is not null;
