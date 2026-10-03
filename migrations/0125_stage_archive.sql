-- Pipeline stage editor (UI/UX plan decision 34, §12.4 G6). Stages had no way to be managed:
-- they came only from seed data. Removing a stage moves its opportunities to another stage first
-- (recorded in the stage history) and then archives it: OpportunityStageHistory points at stages
-- with ON DELETE RESTRICT, so a stage that was ever used can't be deleted, and its name must keep
-- showing in old history.
alter table "StageDefinition" add column if not exists "archivedAt" timestamptz;

-- Names are unique among a type's active stages only, so a removed name can be used again.
-- Case-insensitive, matching the editor's check.
drop index if exists "StageDefinition_opportunityTypeId_name_key";
create unique index if not exists "StageDefinition_type_active_name_key"
  on "StageDefinition" ("opportunityTypeId", lower(name))
  where "archivedAt" is null;
