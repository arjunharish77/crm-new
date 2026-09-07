-- Priority Module 12 -- Product Catalog and Enrollment/Application Management. Item 3 of 20:
-- "Replace generic opportunity pipeline dependency with opportunity types and application
-- workflows... ensuring University 1, University 2, University 3 style opportunity types can
-- each have their own stages, course values, fee plans, and required documents."
--
-- "Stages" are already real and independent per OpportunityType (StageDefinition has always been
-- scoped by "opportunityTypeId") -- nothing to change there. The actual gap this item closes is
-- the missing STRUCTURAL LINK from an OpportunityType (e.g. "University 1") to the catalog
-- schema built in 0100/0101 -- without this column, there was no way to say "this opportunity
-- type's course/fee-plan/document-checklist values come from THIS specific Program." Nullable
-- and ON DELETE SET NULL (not CASCADE): an admin deleting/unlinking a catalog Program should
-- degrade that opportunity type back to generic/unlinked, never silently delete the opportunity
-- type itself or the deals already using it.
alter table "OpportunityType" add column if not exists "programId" text references "Program"("id") on delete set null;

create index if not exists "OpportunityType_program_idx" on "OpportunityType" ("tenantId", "programId");
