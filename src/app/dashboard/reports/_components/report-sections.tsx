// The Reports sections (UI/UX plan decision 30). They were tabs of one 3,300-line page; each now
// has its own route under /dashboard/reports, and this module holds their code unchanged apart
// from how a section is opened (by URL instead of a tab).
// Split into one file per section (UI/UX plan: large-file split, no behaviour change). This file
// re-exports them so existing imports keep working.
export { INBUILT_REPORT_OPTIONS } from "./report-shared";
export { InbuiltReportsSection } from "./inbuilt-reports-section";
export { CustomReportBuilder } from "./custom-report-builder";
export { ReportSchedulesSection } from "./report-schedules-section";
export { ReportAnnotationsSection } from "./report-annotations-section";
export { DataCatalogSection } from "./data-catalog-section";
export { MetricsSection } from "./metrics-section";
export { CalculatedMetricsSection } from "./calculated-metrics-section";
export { SegmentComparisonSection } from "./segment-comparison-section";
export { CustomReportsSection } from "./custom-reports-section";
