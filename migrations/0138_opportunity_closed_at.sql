-- Round-2 plan wave 3 (decision 3, 2026-10-26): won and lost deals count in date-filtered reports
-- by the day they actually closed. Opportunities only had "expectedCloseDate" (what the rep
-- enters), so this stores the real close time.
--
-- A trigger keeps it right for every writer (the API, bulk updates, imports, automations, stage
-- clean-up): moving into a closed stage sets it to now, moving back to an open stage clears it.
alter table "Opportunity" add column if not exists "closedAt" timestamp with time zone;

create or replace function crm_opportunity_closed_at() returns trigger language plpgsql as $$
declare
  stage_closed boolean;
begin
  if tg_op = 'UPDATE' and new."stageId" is not distinct from old."stageId" then
    return new;
  end if;
  select "isClosed" into stage_closed from "StageDefinition" where id = new."stageId";
  if coalesce(stage_closed, false) then
    new."closedAt" := now();
  else
    new."closedAt" := null;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_closed_at on "Opportunity";
create trigger opportunity_closed_at before insert or update of "stageId" on "Opportunity"
  for each row execute function crm_opportunity_closed_at();

-- Past deals: the latest move into the stage they're in now, from the stage history. Deals with
-- no such history entry (created straight into a closed stage before history was kept) fall back
-- to their last update.
update "Opportunity" o
   set "closedAt" = coalesce(
     (select max(h."changedAt")
        from "OpportunityStageHistory" h
       where h."tenantId" = o."tenantId" and h."opportunityId" = o.id and h."toStageId" = o."stageId"),
     o."updatedAt")
 where o."closedAt" is null
   and o."stageId" in (select id from "StageDefinition" where "isClosed");

create index if not exists "Opportunity_tenant_closed_idx" on "Opportunity" ("tenantId", "closedAt") where "closedAt" is not null;
