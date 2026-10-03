-- Who created a form or an automation (decided 2026-10-03: only its creator or an admin may
-- archive, restore or delete it). Neither table recorded this before. Backfilled where something
-- tells us: an automation's CREATE audit entry; a form's first published version. Items with no
-- known creator can be archived only by admins.
alter table "AutomationV2" add column if not exists "createdBy" text;
alter table "Form" add column if not exists "createdBy" text;

update "AutomationV2" a set "createdBy" = first."userId"
from (
  select distinct on (l."entityId") l."entityId", l."userId"
  from "AuditLog" l
  where l."entityType" = 'AUTOMATION' and l.action = 'CREATE' and l."userId" is not null and l."userId" <> 'system'
  order by l."entityId", l."createdAt" asc
) first
where a.id = first."entityId" and a."createdBy" is null
  and exists (select 1 from "User" u where u.id = first."userId");

update "Form" f set "createdBy" = v."publishedBy"
from "FormVersion" v
where v."formId" = f.id and v.version = 1 and v."publishedBy" is not null and f."createdBy" is null
  and exists (select 1 from "User" u where u.id = v."publishedBy");
