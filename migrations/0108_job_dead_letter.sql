-- WP10 follow-up (F18 item 4/6): dead-letter tooling.
--
-- Today, a job that exhausts all retry attempts (defaultJobOptions across every queue:
-- `attempts: 3` with exponential backoff -- see job-queue.ts) just sits in BullMQ's own Redis
-- "failed" set, bounded by `removeOnFail: { age: 30d, count: 2000 }`. That is real, but it is not
-- a durable, queryable record: once the retention window passes (or Redis itself is ever flushed/
-- migrated), the fact that a job permanently failed is gone with no trace, and there is no
-- structured way for a platform operator to see, filter, or reason about permanently-failed jobs
-- without reading raw Redis keys.
--
-- This table is the durable counterpart -- one row per job that reached its FINAL failed attempt
-- (not every intermediate retry), written by scripts/worker.ts's `wireWorkerLifecycle`'s existing
-- `worker.on("failed", ...)` handler right before/alongside that existing console.error call.
create table if not exists "JobDeadLetter" (
  id text primary key,
  "queueName" text not null,
  "jobName" text not null,
  "jobId" text not null,
  -- Not every job is tenant-scoped (see job-registry.ts's `isTenantScoped` field) -- e.g. the
  -- recurring cross-tenant scan ticks (automation.processDue, reports.processSchedules, etc.)
  -- have no single tenant to attribute a failure to, so this is nullable by design, not an
  -- oversight.
  "tenantId" text,
  -- The job's own data payload at failure time, for operator triage/replay -- jsonbParam wraps
  -- this at the call site since a job's data can itself contain array values (see query.ts's
  -- jsonbParam doc for why a raw JS array must never be passed directly to a jsonb column).
  payload jsonb,
  "errorMessage" text,
  "attemptsMade" integer not null,
  "failedAt" timestamp with time zone not null default now()
);

create index if not exists "JobDeadLetter_failedAt_idx" on "JobDeadLetter" ("failedAt" desc);
create index if not exists "JobDeadLetter_tenantId_idx" on "JobDeadLetter" ("tenantId");
create index if not exists "JobDeadLetter_jobName_idx" on "JobDeadLetter" ("jobName");
