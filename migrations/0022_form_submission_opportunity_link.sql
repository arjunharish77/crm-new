-- Adds a real relational link from a form submission to the Opportunity it created,
-- alongside the existing lead-only FK. Previously this was only recoverable by unpacking
-- the submission's `data` jsonb blob.

alter table "FormSubmission"
  add column if not exists "opportunityId" text references "Opportunity"("id") on delete set null;

create index if not exists "FormSubmission_opportunityId_idx" on "FormSubmission" ("opportunityId");
