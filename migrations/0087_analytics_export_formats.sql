-- Gap checklist Module 17, item 19 (scheduled extracts and subscriptions): widens
-- ReportSchedule/ReportEmailDelivery's format CHECK constraints to allow 'XLSX', alongside the
-- existing LINK/CSV/PDF. PDF itself was never actually unsupported at the library level --
-- @react-pdf/renderer already exists in this codebase (used for partner invoices) -- it was
-- only ever unwired for reports/dashboards; see report-pdf.tsx and exports.ts's XLSX/PDF
-- branches for the actual rendering, added alongside this migration.

alter table "ReportSchedule" drop constraint if exists "ReportSchedule_format_check";
alter table "ReportSchedule" add constraint "ReportSchedule_format_check" check (format in ('LINK', 'CSV', 'PDF', 'XLSX'));

alter table "ReportEmailDelivery" drop constraint if exists "ReportEmailDelivery_format_check";
alter table "ReportEmailDelivery" add constraint "ReportEmailDelivery_format_check" check (format in ('LINK', 'CSV', 'PDF', 'XLSX'));
