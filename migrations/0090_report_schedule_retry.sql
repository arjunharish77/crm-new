-- Gap checklist Module 17, item 19 ("scheduled extracts and subscriptions" -- automatic retry
-- of a failed report *generation*, not just failed delivery email -- the existing outbox retry
-- already covers the email leg). Retry state lives on ReportSchedule itself, separate from
-- lastRunAt/nextRunAt (which keep advancing on the schedule's normal cadence regardless) --
-- retry is a sooner-than-cadence extra attempt, not a replacement for the normal run.
alter table "ReportSchedule" add column if not exists "retryCount" integer not null default 0;
alter table "ReportSchedule" add column if not exists "nextRetryAt" timestamptz;
create index if not exists "ReportSchedule_retry_idx" on "ReportSchedule" ("isActive", "retryCount", "nextRetryAt");
