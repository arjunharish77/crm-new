-- Voice bot plan wave F (2026-10-27): what starts bot calls. A call from an automation step can
-- hold the automation until the call's final outcome (the waiting AutomationQueue row); a call
-- campaign can be dialled by a bot instead of people (its members then become bot calls).
-- Retries point at the first attempt, which holds these links.

alter table "VoiceBotCall" add column if not exists "automationQueueId" text;
alter table "VoiceBotCall" add column if not exists "campaignMemberId" text;
create index if not exists "VoiceBotCall_campaign_member" on "VoiceBotCall" ("campaignMemberId") where "campaignMemberId" is not null;

alter table "CallCampaign" add column if not exists "dialledBy" text not null default 'PEOPLE';
alter table "CallCampaign" add column if not exists "voiceBotId" text references "VoiceBot"("id") on delete set null;
do $$ begin
  alter table "CallCampaign" add constraint "CallCampaign_dialledBy_check" check ("dialledBy" in ('PEOPLE', 'BOT'));
exception when duplicate_object then null; end $$;
