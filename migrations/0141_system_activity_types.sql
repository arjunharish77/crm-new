-- Voice bot plan wave A (decisions 9, 10 and 24, 2026-10-26/27): activity types the CRM creates
-- itself are "system" types that nobody can pick by hand. Today that is Call (telephony) and Page
-- Visit; Email, WhatsApp and SMS become system types for the messages the CRM sends (created by
-- the app on first use); each voice bot gets its own (VOICE_BOT, one per bot, wave B).
alter table "ActivityType" add column if not exists "systemKey" text;
alter table "ActivityType" add column if not exists "isSystem" boolean not null default false;
create unique index if not exists "ActivityType_tenant_systemKey_key" on "ActivityType" ("tenantId", "systemKey")
  where "systemKey" in ('CALL', 'EMAIL', 'WHATSAPP', 'SMS', 'PAGE_VISIT');

-- Sent messages point at the activity that records them, so delivery updates reach it.
alter table "CommunicationOutbox" add column if not exists "activityId" text;

update "ActivityType" set "systemKey" = 'CALL', "isSystem" = true where lower(name) = 'call' and "systemKey" is null;
update "ActivityType" set "systemKey" = 'PAGE_VISIT', "isSystem" = true where lower(name) = 'page visit' and "systemKey" is null;

-- Calls logged by hand get their own type. A Call activity that no call log points at was
-- logged by a person, so it moves there; dialled calls stay under Call. "updatedAt" is left as
-- it was: nobody edited these activities.
insert into "ActivityType" (id, "tenantId", "objectId", name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "createdAt", "updatedAt")
select gen_random_uuid()::text, t."tenantId", t."objectId", 'Call (logged manually)', 'PhoneOutgoing', t.color, t."defaultOutcome", t."defaultSLA", t."order", true, now(), now()
  from "ActivityType" t
 where t."systemKey" = 'CALL'
on conflict ("tenantId", name) do nothing;

update "Activity" a
   set "typeId" = manual.id
  from "ActivityType" call_type
  join "ActivityType" manual on manual."tenantId" = call_type."tenantId" and manual.name = 'Call (logged manually)'
 where call_type."systemKey" = 'CALL'
   and a."typeId" = call_type.id
   and a."tenantId" = call_type."tenantId"
   and not exists (select 1 from "TelephonyCallLog" l where l."activityId"::text = a.id and l."tenantId"::text = a."tenantId");

-- Email, WhatsApp and SMS activities so far were all logged by hand (the CRM didn't log sent
-- messages), so those types become the "logged manually" ones, keeping their activities. Where
-- the new name is already taken the type is left as it is.
update "ActivityType" t
   set name = t.name || ' (logged manually)', "updatedAt" = now()
 where lower(t.name) in ('email', 'whatsapp', 'sms')
   and t."systemKey" is null
   and not exists (select 1 from "ActivityType" o where o."tenantId" = t."tenantId" and o.name = t.name || ' (logged manually)');
