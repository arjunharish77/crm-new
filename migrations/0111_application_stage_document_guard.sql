-- Explicit opt-in guard for entering an application stage.
alter table "ApplicationStage" add column "requiresVerifiedDocuments" boolean not null default false;
create index "ApplicationDocument_checklist_lookup_idx" on "ApplicationDocument" ("tenantId", "applicationId", "checklistItemId", "updatedAt" desc, id);
