-- Campaign and journey audiences reach everyone (UI/UX plan §8 #24). They were cut off at 500
-- (smart list), 1,000 (saved view) or 5,000 (any) leads without saying so.
--
-- A campaign launch now queues its audience in batches: what fits in the launch request, then the
-- worker continues from where it stopped. "launchState" holds that progress:
--   { "startedBy", "startedAt", "total", "queued", "afterId", "done", "leaseUntil", "completedAt" }
-- (afterId: the last lead id handled, as the audience is read in id order; leaseUntil: only one
-- run at a time).
alter table "MarketingCampaign" add column if not exists "launchState" jsonb;

-- "Enroll audience now" on a journey enrols in batches the same way; when one call runs out of
-- time, the worker finishes it as the same person: { "by", "since" }.
alter table "MarketingJourney" add column if not exists "enrollmentPending" jsonb;

create index if not exists "MarketingCampaign_launch_pending_idx"
  on "MarketingCampaign" ("updatedAt") where status = 'RUNNING' and ("launchState"->>'done') = 'false';
