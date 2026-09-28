-- Notes can belong to Leads, Opportunities or Activities. The imported schema
-- incorrectly points every entityId at Lead. Preserve database referential
-- integrity using a generated reference for each supported record type.
-- Record IDs are immutable; parent deletion remains restricted while notes exist.
ALTER TABLE "Note"
  ADD COLUMN "leadReferenceId" text GENERATED ALWAYS AS (CASE WHEN "entityType" = 'LEAD' THEN "entityId" END) STORED,
  ADD COLUMN "opportunityReferenceId" text GENERATED ALWAYS AS (CASE WHEN "entityType" = 'OPPORTUNITY' THEN "entityId" END) STORED,
  ADD COLUMN "activityReferenceId" text GENERATED ALWAYS AS (CASE WHEN "entityType" = 'ACTIVITY' THEN "entityId" END) STORED,
  ADD CONSTRAINT "Note_entity_type_check" CHECK ("entityType" IN ('LEAD', 'OPPORTUNITY', 'ACTIVITY')),
  ADD CONSTRAINT "Note_lead_reference_fk" FOREIGN KEY ("leadReferenceId") REFERENCES "Lead"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT "Note_opportunity_reference_fk" FOREIGN KEY ("opportunityReferenceId") REFERENCES "Opportunity"(id) ON DELETE RESTRICT,
  ADD CONSTRAINT "Note_activity_reference_fk" FOREIGN KEY ("activityReferenceId") REFERENCES "Activity"(id) ON DELETE RESTRICT;
ALTER TABLE "Note" DROP CONSTRAINT "Note_lead_fk";
