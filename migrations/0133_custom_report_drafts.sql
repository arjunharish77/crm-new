-- Builder save model for custom reports (decision 29, extended 2026-10-03): the report builder
-- saves a draft as you work; what runs (the report page, exports, schedules, dashboards) only
-- changes on Publish, and every publish is a numbered version (CustomReportVersion). The name and
-- "Who can see it" aren't drafted -- they apply at once.
--
-- "CustomReport".config stays the published report; "draft" holds unpublished definition changes.
-- "currentVersion" counts publishes; 0 means a new report that hasn't been published yet.
alter table "CustomReport"
  add column if not exists draft jsonb,
  add column if not exists "draftUpdatedAt" timestamptz,
  add column if not exists "draftUpdatedBy" text;

-- Every existing report is in use as it is today: record it as version 1 where it has no version.
insert into "CustomReportVersion" (id, "tenantId", "reportId", version, snapshot, "publishNotes", "publishedAt")
select gen_random_uuid()::text, r."tenantId", r.id, 1,
       jsonb_build_object('name', r.name, 'description', r.description, 'module', r.module, 'config', r.config, 'chartType', r."chartType"),
       'Existing report when drafts were introduced', coalesce(r."updatedAt", now())
from "CustomReport" r
where r."chartType" is distinct from 'SAVED_VIEW' and r."currentVersion" = 0
  and not exists (select 1 from "CustomReportVersion" v where v."reportId" = r.id);

update "CustomReport" set "currentVersion" = 1
where "chartType" is distinct from 'SAVED_VIEW' and "currentVersion" = 0;
