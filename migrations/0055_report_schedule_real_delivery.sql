-- Priority Module 17 -- Advanced Analytics and BI Layer: scheduled extracts and subscriptions.
-- Confirmed by audit before building: ReportSchedule / ReportEmailDelivery / the
-- processDueReportSchedules worker job already existed and correctly computed cadence and
-- recipients, but createDelivery's own inline comment admitted the real gap outright: "Mail
-- transport is not configured; this row is ready for a future email adapter." No email was
-- ever sent, no CSV/PDF file was ever rendered, and no download link was ever generated --
-- every delivery stayed "PENDING" forever. This migration adds the one column needed to link
-- a delivery to the real, already-existing CSV export pipeline (ExportRequest/FileObject),
-- reused unchanged rather than building a second file-rendering/storage system.

alter table "ReportEmailDelivery"
  add column if not exists "exportRequestId" text references "ExportRequest"(id) on delete set null;
