import { randomUUID } from "crypto";
import { query, queryOne, execute, jsonbParam, queryAsSystem, queryOneAsSystem, executeAsSystem } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { writePrivateFile, readPrivateFile, deletePrivateFile } from "@/lib/storage/file-storage";
import { enqueueExportJob } from "@/lib/server/job-queue";
import { getCurrentUserById } from "@/lib/repositories/auth-admin-postgres";
import { createAuditLog, exportCustomReportForTenant, exportFormSubmissionsForTenant } from "@/lib/server/crm";
import { generateCycleFinanceCsv } from "@/lib/server/partner-invoices";
import * as inbuiltReports from "@/lib/server/inbuilt-reports";
import { formatExportDateValue, formatTenantDate, getTenantTimeZone } from "@/lib/server/date-format";
import { DatabaseError } from "@/lib/db/errors";
import { checkRateLimitWithAlert, RateLimitExceededError } from "@/lib/server/rate-limit";
import { assertAccountActiveForDownload } from "@/lib/server/file-download-guards";
import { generateSignedDownloadToken, verifySignedDownloadToken } from "@/lib/server/signed-urls";
import { applyRecordScopeClause } from "@/lib/server/record-scope";
import { fieldPermissionMap } from "@/lib/server/field-permissions";

// F03 fix (WP04): the export query results use friendly column headers ("Email", "Phone")
// rather than the raw field keys field-permissions.ts's fieldPermissionMap is keyed by (per the
// Permission Templates settings UI's BASE_FIELDS) -- this maps header back to key so a field a
// user's role/template marks "hidden" can be nulled out in the exported row, same as it already
// is in every other read surface fixed in this work package. Only fields BASE_FIELDS.lead/
// .opportunity actually name are included; predictive-score/audit/join columns were never
// individually configurable and are left untouched.
const LEAD_EXPORT_FIELD_ALIASES: Record<string, string> = {
  "Lead Name": "name", Email: "email", Phone: "phone", Company: "company",
  Status: "status", Source: "source", Score: "score",
};
const OPPORTUNITY_EXPORT_FIELD_ALIASES: Record<string, string> = {
  Opportunity: "title", Amount: "amount", Priority: "priority", "Expected Close Date": "expectedCloseDate",
};

export function maskExportRows(user: TenantUser, module: "leads" | "opportunities", rows: Record<string, unknown>[]) {
  const permissions = fieldPermissionMap(user, module);
  if (!Object.keys(permissions).length) return rows;
  const aliasMap = module === "leads" ? LEAD_EXPORT_FIELD_ALIASES : OPPORTUNITY_EXPORT_FIELD_ALIASES;
  return rows.map((row) => {
    const masked = { ...row };
    for (const [alias, fieldKey] of Object.entries(aliasMap)) {
      if (permissions[fieldKey] === "hidden" && alias in masked) masked[alias] = null;
    }
    return masked;
  });
}

type TenantUser = {
  id: string;
  tenantId: string | null;
  teamId?: string | null;
  role?: { permissions?: any } | string | null;
};

export type ExportModuleName =
  | "LEADS"
  | "OPPORTUNITIES"
  | "ACTIVITIES"
  | "TASKS"
  | "PARTNERS"
  | "PAYOUTS"
  | "REPORTS"
  | "FORMS"
  | "AUDIT_LOGS";

type ExportRequestRow = {
  id: string;
  tenantId: string;
  userId: string;
  moduleName: ExportModuleName;
  exportType: string;
  status: string;
  filters: Record<string, unknown>;
  columns: string[];
  recordCount: number;
  fileObjectId: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

type ExportFilterCondition = {
  field?: string;
  operator?: string;
  value?: unknown;
};

const EXPORT_MODULES = new Set<ExportModuleName>([
  "LEADS",
  "OPPORTUNITIES",
  "ACTIVITIES",
  "TASKS",
  "PARTNERS",
  "PAYOUTS",
  "REPORTS",
  "FORMS",
  "AUDIT_LOGS",
]);

function ownerScoped(user: TenantUser) {
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  return !!permissions?.isPartnerRole || permissions?.recordAccess === "OWN";
}

function csvValue(value: unknown, timeZone: string) {
  if (value === null || value === undefined) return "";
  const formattedValue = formatExportDateValue(value, timeZone);
  const text = typeof formattedValue === "object" ? JSON.stringify(formattedValue) : String(formattedValue);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[], timeZone: string) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(row[header], timeZone)).join(","))].join("\n");
}

function csvRowCount(csv: string) {
  const trimmed = csv.trim();
  if (!trimmed) return 0;
  return Math.max(0, trimmed.split(/\r?\n/).length - 1);
}

function flattenObjectToRows(source: Record<string, unknown>, prefix = ""): Array<Record<string, unknown>> {
  return Object.entries(source).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) return flattenObjectToRows(value as Record<string, unknown>, nextKey);
    if (Array.isArray(value)) return [{ metric: nextKey, value: JSON.stringify(value) }];
    return [{ metric: nextKey, value }];
  });
}

function reportResultRows(report: Record<string, unknown>) {
  if (Array.isArray(report.rows)) return report.rows as Array<Record<string, unknown>>;
  if (Array.isArray(report.issues)) return report.issues as Array<Record<string, unknown>>;
  return flattenObjectToRows(report);
}

async function inbuiltReportRows(user: TenantUser, reportKey: string): Promise<Record<string, unknown>[]> {
  let report: Record<string, unknown>;
  if (reportKey === "funnel_conversion_by_stage") report = await inbuiltReports.getFunnelByStageReportForTenant(user as any);
  else if (reportKey === "funnel_conversion_by_source_campaign") report = await inbuiltReports.getFunnelBySourceCampaignReportForTenant(user as any);
  else if (reportKey === "rep_performance") report = await inbuiltReports.getRepPerformanceReportForTenant(user as any);
  else if (reportKey === "sla_response_breaches") report = await inbuiltReports.getSlaResponseBreachReportForTenant(user as any, 24);
  else if (reportKey === "lead_source_roi") report = await inbuiltReports.getLeadSourceRoiReportForTenant(user as any);
  else if (reportKey === "reassignment_impact") report = await inbuiltReports.getReassignmentImpactReportForTenant(user as any, 24);
  else if (reportKey === "activity_call_volume_trends") report = await inbuiltReports.getActivityCallVolumeTrendReportForTenant(user as any, "day", null, null);
  else if (reportKey === "commission_payout_summary") report = await inbuiltReports.getCommissionPayoutSummaryReportForTenant(user as any);
  else if (reportKey === "cohort_funnel_progression") report = await inbuiltReports.getCohortReportForTenant(user as any, "month");
  else if (reportKey === "data_quality") report = await inbuiltReports.getDataQualityReportForTenant(user as any, 30);
  else throw new Error("INVALID_INBUILT_REPORT");
  return reportResultRows(report);
}

async function inbuiltReportCsv(user: TenantUser, reportKey: string, timeZone: string) {
  return toCsv(await inbuiltReportRows(user, reportKey), timeZone);
}

// Gap checklist Module 17, item 19 (scheduled extracts): XLSX export. exceljs is a genuinely
// new dependency (no spreadsheet-writing library existed anywhere in this codebase before this)
// -- added specifically for this, since hand-rolling a correct OOXML/SpreadsheetML writer would
// be a much larger, more error-prone undertaking than using an established library for what is,
// at its core, a flat-table export.
export async function toXlsxBuffer(rows: Record<string, unknown>[], timeZone: string): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");
  if (rows.length) {
    const headers = Object.keys(rows[0]);
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return "";
        const formatted = formatExportDateValue(value, timeZone);
        return typeof formatted === "object" ? JSON.stringify(formatted) : formatted;
      }));
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function tenantClause(user: TenantUser, values: unknown[], alias = "") {
  if (!user.tenantId) return "false";
  values.push(String(user.tenantId));
  return `${alias ? `${alias}.` : ""}"tenantId"::text = $${values.length}`;
}

type ExportFilterGroup = { logic: "AND" | "OR"; conditions: ExportFilterCondition[] };

// WP09 (F12): returns GROUPS, each with its own AND/OR logic intact -- previously this flattened
// every group's conditions into one flat array and the caller ANDed all of them together
// unconditionally, silently discarding any group the user configured as "Match ANY (OR)". A
// nested export filter now compiles with the exact same group structure the list/view surface
// already respects (see buildGroupedFilterClause in query-filters.ts), so "exporting a view
// exports the actual view" holds for group logic too, not just which fields/values are present.
export function filterGroups(filters: Record<string, unknown> | unknown[] | null | undefined): ExportFilterGroup[] {
  const urlFilters = !Array.isArray(filters) ? filters?.urlFilters : undefined;
  const parsed = urlFilters && typeof urlFilters === "string" ? (() => {
    try {
      return JSON.parse(urlFilters);
    } catch {
      return null;
    }
  })() : null;
  const source: any = Array.isArray(parsed) ? parsed : filters;
  const rawGroups: any[] = Array.isArray(source) ? source : Array.isArray(source?.conditions) ? [source] : [];
  return rawGroups
    .map((group) => ({
      logic: group?.logic === "OR" ? ("OR" as const) : ("AND" as const),
      conditions: Array.isArray(group?.conditions) ? (group.conditions as ExportFilterCondition[]) : [],
    }))
    .filter((group) => group.conditions.length > 0);
}

function addMappedCondition(
  clauses: string[],
  values: unknown[],
  condition: ExportFilterCondition,
  columnMap: Map<string, string>,
) {
  if (!condition.field) return;
  const column = columnMap.get(condition.field);
  if (!column) return;
  const operator = condition.operator || "equals";
  if (operator === "equals") {
    if (Array.isArray(condition.value)) {
      values.push(condition.value.map(String));
      clauses.push(`${column}::text = any($${values.length}::text[])`);
      return;
    }
    values.push(condition.value);
    clauses.push(`${column} = $${values.length}`);
  } else if (operator === "not_equals") {
    if (Array.isArray(condition.value)) {
      values.push(condition.value.map(String));
      clauses.push(`${column}::text <> all($${values.length}::text[])`);
      return;
    }
    values.push(condition.value);
    clauses.push(`${column} <> $${values.length}`);
  } else if (operator === "in" && Array.isArray(condition.value)) {
    values.push(condition.value.map(String));
    clauses.push(`${column}::text = any($${values.length}::text[])`);
  } else if (operator === "not_in" && Array.isArray(condition.value)) {
    values.push(condition.value.map(String));
    clauses.push(`${column}::text <> all($${values.length}::text[])`);
  } else if (operator === "contains" && typeof condition.value === "string") {
    values.push(`%${condition.value}%`);
    clauses.push(`${column} ilike $${values.length}`);
  } else if (operator === "greater_than") {
    values.push(condition.value);
    clauses.push(`${column} > $${values.length}`);
  } else if (operator === "less_than") {
    values.push(condition.value);
    clauses.push(`${column} < $${values.length}`);
  } else if (operator === "gte") {
    values.push(condition.value);
    clauses.push(`${column} >= $${values.length}`);
  } else if (operator === "lte") {
    values.push(condition.value);
    clauses.push(`${column} <= $${values.length}`);
  }
}

export function applyMappedConditions(
  clauses: string[],
  values: unknown[],
  filters: Record<string, unknown> | unknown[] | null | undefined,
  columnMap: Map<string, string>,
) {
  for (const group of filterGroups(filters)) {
    const groupClauses: string[] = [];
    for (const condition of group.conditions) {
      addMappedCondition(groupClauses, values, condition, columnMap);
    }
    if (!groupClauses.length) continue;
    clauses.push(groupClauses.length === 1 ? groupClauses[0] : `(${groupClauses.join(` ${group.logic} `)})`);
  }
}

function normalizeExportObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function selectedExportIds(filters: Record<string, unknown> | null | undefined) {
  const normalized = normalizeExportObject(filters);
  if (!Array.isArray(normalized.selectedIds)) return [];
  return Array.from(new Set(normalized.selectedIds.map((id) => String(id)).filter(Boolean))).slice(0, 25_000);
}

function applySelectedExportIds(
  clauses: string[],
  values: unknown[],
  filters: Record<string, unknown> | null | undefined,
  alias: string,
) {
  const ids = selectedExportIds(filters);
  if (!ids.length) return;
  values.push(ids);
  clauses.push(`${alias}.id::text = any($${values.length}::text[])`);
}

async function fetchExportRows(user: TenantUser, moduleName: ExportModuleName, filters: Record<string, unknown> = {}) {
  filters = normalizeExportObject(filters);
  const values: unknown[] = [];
  const own = ownerScoped(user);
  const limit = 25_000;

  if (moduleName === "LEADS") {
    const clauses = [tenantClause(user, values, "l")];
    // F03 fix (WP04): the export path had its own separate OWN-vs-everything-else check,
    // exactly like leads-postgres.ts did before that fix -- "TEAM Records" fell through to an
    // unrestricted tenant-wide export. Reuses the same shared record-scope.ts module (aliased
    // to "l" since this query joins User/RecordScore, which would make an unqualified
    // "ownerId"/"tenantId" reference ambiguous).
    const leadsTenantIdParam = user.tenantId ? values.length : null;
    applyRecordScopeClause(clauses, values, user, "LEAD", leadsTenantIdParam, "l");
    applySelectedExportIds(clauses, values, filters, "l");
    applyMappedConditions(clauses, values, filters, new Map([
      ["name", "l.name"],
      ["email", "l.email"],
      ["phone", "l.phone"],
      ["company", "l.company"],
      ["source", "l.source"],
      ["status", "l.status"],
      ["score", "l.score"],
      ["predictiveScoreBand", `rs."scoreBand"`],
      ["predictiveConversionProbability", `rs."conversionProbability"`],
      ["predictiveConfidence", "rs.confidence"],
      ["predictiveStallRisk", `rs."stallRisk"`],
      ["predictiveExpectedResponseLikelihood", `rs."expectedResponseLikelihood"`],
      ["predictiveDuplicateRisk", `rs."duplicateRisk"`],
      ["predictiveStaleRisk", `rs."staleRisk"`],
      ["ownerId", `l."ownerId"`],
      ["createdAt", `l."createdAt"`],
      ["updatedAt", `l."updatedAt"`],
    ]));
    values.push(limit);
    const leadRows = await query<Record<string, unknown>>(
      `select l.name as "Lead Name", l.email as "Email", l.phone as "Phone", l.company as "Company",
              l.status as "Status", l.source as "Source", owner.name as "Owner", l.score as "Score",
              rs."scoreBand" as "Predictive Score Band", rs."conversionProbability" as "Conversion Probability",
              rs.confidence as "Score Confidence", rs."stallRisk" as "Stall Risk",
              rs."expectedResponseLikelihood" as "Response Likelihood", rs."duplicateRisk" as "Duplicate Risk",
              rs."staleRisk" as "Stale Risk", rs."nextBestAction" as "Recommended Next Action",
              l."createdAt" as "Created At"
       from "Lead" l
       left join "User" owner on owner.id = l."ownerId"
       left join "RecordScore" rs on rs."tenantId" = l."tenantId" and rs."recordType" = 'LEAD' and rs."recordId" = l.id
       where ${clauses.join(" and ")}
       order by l."createdAt" desc
       limit $${values.length}`,
      values,
    );
    return maskExportRows(user, "leads", leadRows);
  }

  if (moduleName === "OPPORTUNITIES") {
    const clauses = [tenantClause(user, values, "o")];
    // F03 fix (WP04): same reasoning as the LEADS branch above.
    const oppsTenantIdParam = user.tenantId ? values.length : null;
    applyRecordScopeClause(clauses, values, user, "OPPORTUNITY", oppsTenantIdParam, "o");
    applySelectedExportIds(clauses, values, filters, "o");
    const opportunityTypeId = typeof filters.opportunityTypeId === "string" ? filters.opportunityTypeId : null;
    if (opportunityTypeId) {
      values.push(opportunityTypeId);
      clauses.push(`o."opportunityTypeId" = $${values.length}`);
    }
    applyMappedConditions(clauses, values, filters, new Map([
      ["title", "o.title"],
      ["amount", "o.amount"],
      ["priority", "o.priority"],
      ["stageId", `o."stageId"`],
      ["ownerId", `o."ownerId"`],
      ["leadId", `o."leadId"`],
      ["createdAt", `o."createdAt"`],
      ["updatedAt", `o."updatedAt"`],
      ["expectedCloseDate", `o."expectedCloseDate"`],
      ["predictiveScoreBand", `rs."scoreBand"`],
      ["predictiveWinProbability", `rs."winProbability"`],
      ["predictiveConfidence", "rs.confidence"],
      ["predictiveStallRisk", `rs."stallRisk"`],
      ["predictiveExpectedCloseRisk", `rs."expectedCloseRisk"`],
    ]));
    values.push(limit);
    const opportunityRows = await query<Record<string, unknown>>(
      `select o.title as "Opportunity", l.name as "Lead", ot.name as "Opportunity Type",
              sd.name as "Stage", o.amount as "Amount", o.priority as "Priority",
              owner.name as "Owner", o."expectedCloseDate" as "Expected Close Date",
              rs."scoreBand" as "Predictive Score Band", rs."winProbability" as "Win Probability",
              rs.confidence as "Score Confidence", rs."stallRisk" as "Stall Risk",
              rs."expectedCloseRisk" as "Expected Close Risk", rs."nextBestAction" as "Recommended Next Action",
              rs."suggestedCloseDate" as "Suggested Close Date", o."createdAt" as "Created At"
       from "Opportunity" o
       left join "Lead" l on l.id = o."leadId"
       left join "OpportunityType" ot on ot.id = o."opportunityTypeId"
       left join "StageDefinition" sd on sd.id = o."stageId"
       left join "User" owner on owner.id = o."ownerId"
       left join "RecordScore" rs on rs."tenantId" = o."tenantId" and rs."recordType" = 'OPPORTUNITY' and rs."recordId" = o.id
       where ${clauses.join(" and ")}
       order by o."createdAt" desc
       limit $${values.length}`,
      values,
    );
    return maskExportRows(user, "opportunities", opportunityRows);
  }

  if (moduleName === "ACTIVITIES") {
    const clauses = [tenantClause(user, values, "a")];
    applySelectedExportIds(clauses, values, filters, "a");
    const selectedActivityTypeId = typeof filters.selectedActivityTypeId === "string" ? filters.selectedActivityTypeId : null;
    if (selectedActivityTypeId) {
      values.push(selectedActivityTypeId);
      clauses.push(`a."typeId" = $${values.length}`);
    }
    applyMappedConditions(clauses, values, filters, new Map([
      ["typeId", `a."typeId"`],
      ["leadId", `a."leadId"`],
      ["opportunityId", `a."opportunityId"`],
      ["outcome", "a.outcome"],
      ["notes", "a.notes"],
      ["dueAt", `a."dueAt"`],
      ["completedAt", `a."completedAt"`],
      ["slaStatus", `a."slaStatus"`],
      ["createdBy", `a."createdBy"`],
      ["createdAt", `a."createdAt"`],
      ["updatedAt", `a."updatedAt"`],
    ]));
    if (own) {
      values.push(user.id);
      clauses.push(`a."createdBy" = $${values.length}`);
    }
    values.push(limit);
    return query<Record<string, unknown>>(
      `select at.name as "Activity Type", l.name as "Lead", o.title as "Opportunity",
              a.outcome as "Outcome", a.notes as "Notes", a."dueAt" as "Due At",
              a."completedAt" as "Completed At", a."slaStatus" as "SLA Status",
              creator.name as "Created By", a."createdAt" as "Created At"
       from "Activity" a
       left join "ActivityType" at on at.id = a."typeId"
       left join "Lead" l on l.id = a."leadId"
       left join "Opportunity" o on o.id = a."opportunityId"
       left join "User" creator on creator.id = a."createdBy"
       where ${clauses.join(" and ")}
       order by a."createdAt" desc
       limit $${values.length}`,
      values,
    );
  }

  if (moduleName === "TASKS") {
    const clauses = [tenantClause(user, values, "t")];
    applySelectedExportIds(clauses, values, filters, "t");
    for (const [field, column] of [
      ["status", "status"],
      ["priority", "priority"],
      ["ownerId", "ownerId"],
      ["leadId", "leadId"],
      ["opportunityId", "opportunityId"],
      ["activityId", "activityId"],
    ] as const) {
      const value = filters[field];
      if (typeof value === "string" && value) {
        values.push(value);
        clauses.push(`t."${column}" = $${values.length}`);
      }
    }
    const due = typeof filters.due === "string" ? filters.due : null;
    const now = new Date();
    if (due === "overdue") {
      values.push(now.toISOString());
      clauses.push(`t."dueAt" < $${values.length} and t.status not in ('COMPLETED', 'CANCELLED')`);
    } else if (due === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      values.push(start.toISOString(), end.toISOString());
      clauses.push(`t."dueAt" >= $${values.length - 1} and t."dueAt" < $${values.length}`);
    } else if (due === "upcoming") {
      values.push(now.toISOString());
      clauses.push(`t."dueAt" >= $${values.length} and t.status not in ('COMPLETED', 'CANCELLED')`);
    } else if (due === "completed") {
      clauses.push("t.status = 'COMPLETED'");
    }
    if (own) {
      values.push(user.id);
      clauses.push(`t."ownerId" = $${values.length}`);
    }
    values.push(limit);
    return query<Record<string, unknown>>(
      `select t.title as "Task", t.status as "Status", t.priority as "Priority",
              owner.name as "Owner", l.name as "Lead", o.title as "Opportunity",
              t."dueAt" as "Due At", t."completedAt" as "Completed At", t."createdAt" as "Created At"
       from "Task" t
       left join "User" owner on owner.id = t."ownerId"
       left join "Lead" l on l.id = t."leadId"
       left join "Opportunity" o on o.id = t."opportunityId"
       where ${clauses.join(" and ")}
       order by t."createdAt" desc
       limit $${values.length}`,
      values,
    );
  }

  if (moduleName === "PARTNERS") {
    const clauses = [tenantClause(user, values, "p")];
    applySelectedExportIds(clauses, values, filters, "p");
    values.push(limit);
    return query<Record<string, unknown>>(
      `select u.name as "Partner User", u.email as "Email", po.name as "Partner Organization",
              p.status as "Status", p."partnerLoginRole" as "Login Role",
              p."canAccessPayouts" as "Payout Access", p."createdAt" as "Created At"
       from "PartnerProfile" p
       left join "User" u on u.id = p."userId"
       left join "PartnerOrganization" po on po.id = p."partnerOrganizationId"
       where ${clauses.join(" and ")}
       order by p."createdAt" desc
       limit $${values.length}`,
      values,
    );
  }

  if (moduleName === "PAYOUTS") {
    const clauses = [tenantClause(user, values, "p")];
    applySelectedExportIds(clauses, values, filters, "p");
    if (own) {
      values.push(user.id);
      clauses.push(`(
        pp."userId" = $${values.length}
        or pp."partnerOrganizationId" in (
          select "partnerOrganizationId"
          from "PartnerProfile"
          where "userId" = $${values.length}
            and "partnerOrganizationId" is not null
        )
      )`);
    }
    values.push(limit);
    return query<Record<string, unknown>>(
      `select po.name as "Partner Organization", u.name as "Partner User", p.status as "Status",
              p."totalCommissionAmount" as "Amount", p."isHeld" as "Held",
              p."holdReason" as "Hold Reason", p."createdAt" as "Created At"
       from "Payout" p
       left join "PartnerProfile" pp on pp."userId" = p."partnerId"
       left join "User" u on u.id = pp."userId"
       left join "PartnerOrganization" po on po.id = p."partnerOrganizationId"
       where ${clauses.join(" and ")}
       order by p."createdAt" desc
       limit $${values.length}`,
      values,
    );
  }

  if (moduleName === "AUDIT_LOGS") {
    // "Evidence export" (gap checklist: "audit review workflows") -- routes through the same
    // ExportRequest/QUEUED/CSV pipeline as every other module, so an audit-log export is
    // itself tracked (who exported what, when) exactly as rigorously as a lead/opportunity
    // export -- compliance evidence shouldn't be less accountable than ordinary record data.
    const clauses = [tenantClause(user, values, "a")];
    applySelectedExportIds(clauses, values, filters, "a");
    applyMappedConditions(clauses, values, filters, new Map([
      ["action", "a.action"],
      ["entityType", `a."entityType"`],
      ["reviewStatus", `a."reviewStatus"`],
      ["createdAt", `a."createdAt"`],
    ]));
    if (filters.flagged === true) clauses.push("a.flagged = true");
    if (filters.legalHold === true) clauses.push(`a."legalHold" = true`);
    values.push(limit);
    return query<Record<string, unknown>>(
      `select a."createdAt" as "Timestamp", u.name as "User", u.email as "User Email",
              a.action as "Action", a."entityType" as "Entity Type", a."entityId" as "Entity ID",
              a."reviewStatus" as "Review Status", a.flagged as "Flagged", a."flagReason" as "Flag Reason",
              a."legalHold" as "Legal Hold"
       from "AuditLog" a
       left join "User" u on u.id = a."userId"
       where ${clauses.join(" and ")}
       order by a."createdAt" desc
       limit $${values.length}`,
      values,
    );
  }

  if (moduleName === "REPORTS") {
    const clauses = [tenantClause(user, values, "r")];
    applySelectedExportIds(clauses, values, filters, "r");
    values.push(limit);
    return query<Record<string, unknown>>(
      `select r.name as "Report", r.description as "Description", r."reportType" as "Type",
              r."chartType" as "Chart", r."isShared" as "Shared", r."createdAt" as "Created At"
       from "CustomReport" r
       where ${clauses.join(" and ")}
       order by r."createdAt" desc
       limit $${values.length}`,
      values,
    );
  }

  const clauses = [tenantClause(user, values, "f")];
  applySelectedExportIds(clauses, values, filters, "f");
  const search = typeof filters.search === "string" ? filters.search.trim() : "";
  if (search) {
    values.push(`%${search}%`);
    clauses.push(`f.name ilike $${values.length}`);
  }
  values.push(limit);
  return query<Record<string, unknown>>(
    `select f.name as "Form", f.slug as "Slug", f.status as "Status",
            f.placement as "Placement", f."createdAt" as "Created At"
     from "Form" f
     where ${clauses.join(" and ")}
     order by f."createdAt" desc
     limit $${values.length}`,
    values,
  );
}

async function fetchExportContent(
  user: TenantUser,
  moduleName: ExportModuleName,
  rawFilters: Record<string, unknown> = {},
  rawMetadata: Record<string, unknown> = {},
) {
  const filters = normalizeExportObject(rawFilters);
  const metadata = normalizeExportObject(rawMetadata);
  const exportScope = typeof metadata.exportScope === "string" ? metadata.exportScope : "FULL_VIEW";
  if ((exportScope === "SELECTED" || exportScope === "CURRENT_PAGE") && selectedExportIds(filters).length === 0) {
    throw new Error("EXPORT_SCOPE_SELECTION_EMPTY");
  }
  const timeZone = await getTenantTimeZone(user.tenantId);
  if (moduleName === "REPORTS" && filters.reportKind === "CUSTOM" && typeof filters.customReportId === "string") {
    const csv = await exportCustomReportForTenant(user as any, filters.customReportId);
    return { csv, recordCount: csvRowCount(csv), filenamePrefix: "custom-report" };
  }
  if (moduleName === "REPORTS" && filters.reportKind === "INBUILT" && typeof filters.reportKey === "string") {
    const filenamePrefix = filters.reportKey.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    // XLSX/PDF (gap checklist Module 17, item 19) are only wired up for inbuilt reports --
    // every other export path below stays CSV-only, unchanged from before this.
    const exportType = String(metadata.exportType ?? "CSV").toUpperCase();
    if (exportType === "XLSX" || exportType === "PDF") {
      const rows = await inbuiltReportRows(user, filters.reportKey);
      if (exportType === "XLSX") {
        const buffer = await toXlsxBuffer(rows, timeZone);
        return {
          buffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          extension: "xlsx",
          recordCount: rows.length,
          filenamePrefix,
        };
      }
      const { renderReportTablePdf } = await import("@/lib/server/report-pdf");
      const buffer = await renderReportTablePdf({ title: filters.reportKey, generatedAt: new Date().toISOString(), rows });
      return { buffer, contentType: "application/pdf", extension: "pdf", recordCount: rows.length, filenamePrefix };
    }
    const csv = await inbuiltReportCsv(user, filters.reportKey, timeZone);
    return { csv, recordCount: csvRowCount(csv), filenamePrefix };
  }
  if (moduleName === "FORMS" && filters.exportScope === "SUBMISSIONS" && typeof filters.formId === "string") {
    const csv = await exportFormSubmissionsForTenant(user as any, filters.formId);
    return { csv, recordCount: csvRowCount(csv), filenamePrefix: "form-submissions" };
  }
  if (moduleName === "PAYOUTS" && filters.exportScope === "CYCLE_FINANCE" && typeof filters.payoutCycleId === "string") {
    const csv = await generateCycleFinanceCsv(user as any, filters.payoutCycleId);
    return { csv, recordCount: csvRowCount(csv), filenamePrefix: "payout-cycle" };
  }

  const rows = await fetchExportRows(user, moduleName, filters);
  return { csv: toCsv(rows, timeZone), recordCount: rows.length, filenamePrefix: moduleName.toLowerCase() };
}

export async function listExportRequestsForUser(user: TenantUser) {
  if (!user.tenantId) return [];
  const timeZone = await getTenantTimeZone(user.tenantId);
  const rows = await query<ExportRequestRow & { originalFilename?: string | null; byteSize?: number | null }>(
    `select er.*, fo."originalFilename", fo."byteSize"
     from "ExportRequest" er
     left join "FileObject" fo on fo.id = er."fileObjectId"
     where er."tenantId" = $1 and er."userId" = $2
     order by er."queuedAt" desc
     limit 100`,
    [user.tenantId, user.id],
  );
  return rows.map((row) => ({
    ...row,
    metadata: normalizeExportObject(row.metadata),
    queuedAtDisplay: formatExportDateValue(row.queuedAt, timeZone),
    completedAtDisplay: row.completedAt ? formatExportDateValue(row.completedAt, timeZone) : null,
  }));
}

async function sensitiveColumnsForExport(tenantId: string, moduleName: string, columns: unknown) {
  if (!Array.isArray(columns) || !columns.length) return [];
  const rules = await query<{ fieldKey: string }>(
    `select "fieldKey" from "ExportSensitiveFieldRule" where "tenantId" = $1 and "moduleName" = $2`,
    [tenantId, moduleName],
  );
  if (!rules.length) return [];
  const flagged = new Set(rules.map((rule) => rule.fieldKey));
  return columns.filter((column) => typeof column === "string" && flagged.has(column));
}

// duplicateMode=UPDATE was the destructive shape for imports; here it's including an
// admin-flagged sensitive field (e.g. SSN, bank details, DOB) in the export columns -- an
// admin builds the flagged-field list per module (ExportSensitiveFieldRule), and any export
// that would include one starts life gated behind approval instead of running immediately.
const EXPORT_USER_LIMIT_PER_HOUR = 10;

export async function createExportRequestForUser(user: TenantUser, input: Record<string, unknown>) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const moduleName = String(input.moduleName || "").toUpperCase() as ExportModuleName;
  if (!EXPORT_MODULES.has(moduleName)) throw new Error("INVALID_EXPORT_MODULE");

  // "Export throttling" -- per-user rather than per-tenant, since bulk-data exfiltration abuse
  // is an individual-actor concern (one compromised or malicious account spamming exports),
  // not a shared-team-usage one. 10/hour is generous for a real workflow (running a report a
  // few times while refining filters) but catches a scripted loop.
  const throttle = await checkRateLimitWithAlert({
    key: `export:user:${user.id}`,
    limit: EXPORT_USER_LIMIT_PER_HOUR,
    windowSeconds: 60 * 60,
    tenantId: user.tenantId,
    category: "EXPORT",
    detail: `user ${user.id}`,
  });
  if (!throttle.allowed) throw new RateLimitExceededError(throttle.resetSeconds);
  const id = randomUUID();
  const now = new Date().toISOString();
  const sensitiveColumns = await sensitiveColumnsForExport(user.tenantId, moduleName, input.columns);
  const initialStatus = sensitiveColumns.length > 0 ? "PENDING_APPROVAL" : "QUEUED";

  // XLSX/PDF (gap checklist Module 17, item 19) are only rendered for inbuilt-report exports
  // (see fetchExportContent) -- requesting either for any other module/scope silently falls
  // back to CSV rather than producing a request whose processing step has no renderer for it.
  const filters = input.filters && typeof input.filters === "object" ? (input.filters as Record<string, unknown>) : {};
  const requestedExportType = String(input.exportType ?? "CSV").toUpperCase();
  const supportsAlternateFormat = moduleName === "REPORTS" && filters.reportKind === "INBUILT";
  const exportType = ["XLSX", "PDF"].includes(requestedExportType) && supportsAlternateFormat ? requestedExportType : "CSV";

  await execute(
    `insert into "ExportRequest"
       (id, "tenantId", "userId", "moduleName", "exportType", status, filters, columns, metadata, "queuedAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      id,
      user.tenantId,
      user.id,
      moduleName,
      exportType,
      initialStatus,
      JSON.stringify(filters),
      JSON.stringify(Array.isArray(input.columns) ? input.columns : []),
      JSON.stringify({
        ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
        exportType,
        ...(sensitiveColumns.length ? { sensitiveColumns } : {}),
      }),
      now,
    ],
  );

  if (initialStatus === "QUEUED") {
    try {
      await enqueueExportJob(id, user.tenantId);
    } catch (error) {
      await execute(`update "ExportRequest" set status = 'FAILED', error = $1, "updatedAt" = $2 where id = $3`, [
        error instanceof Error ? error.message : "Export queue unavailable",
        new Date().toISOString(),
        id,
      ]);
      throw error;
    }
  }
  const created = await queryOne<ExportRequestRow>(`select * from "ExportRequest" where id = $1`, [id]);
  await createAuditLog(user, "CREATE", "EXPORT_REQUEST", id, null, { moduleName, filters: input.filters ?? {}, status: initialStatus }, null).catch(() => undefined);
  return created;
}

export async function approveExportRequest(user: TenantUser, exportRequestId: string) {
  const request = await queryOne<ExportRequestRow>(
    `update "ExportRequest" set status = 'QUEUED', "updatedAt" = $1 where id = $2 and "tenantId" = $3 and status = 'PENDING_APPROVAL' returning *`,
    [new Date().toISOString(), exportRequestId, user.tenantId],
  );
  if (!request) throw new Error("EXPORT_REQUEST_NOT_PENDING_APPROVAL");
  await createAuditLog(user, "UPDATE", "EXPORT_REQUEST", exportRequestId, null, null, { status: { before: "PENDING_APPROVAL", after: "QUEUED" } });
  await enqueueExportJob(exportRequestId, user.tenantId).catch(() => undefined);
  return request;
}

export async function rejectExportRequest(user: TenantUser, exportRequestId: string) {
  const request = await queryOne<ExportRequestRow>(
    `update "ExportRequest" set status = 'REJECTED', "updatedAt" = $1 where id = $2 and "tenantId" = $3 and status = 'PENDING_APPROVAL' returning *`,
    [new Date().toISOString(), exportRequestId, user.tenantId],
  );
  if (!request) throw new Error("EXPORT_REQUEST_NOT_PENDING_APPROVAL");
  await createAuditLog(user, "UPDATE", "EXPORT_REQUEST", exportRequestId, null, null, { status: { before: "PENDING_APPROVAL", after: "REJECTED" } });
  return request;
}

export async function listExportSensitiveFieldRulesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "moduleName", "fieldKey", "createdAt" from "ExportSensitiveFieldRule" where "tenantId" = $1 order by "moduleName" asc, "fieldKey" asc`,
    [user.tenantId],
  );
}

export async function createExportSensitiveFieldRuleForTenant(user: TenantUser, input: { moduleName?: string; fieldKey?: string }) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const moduleName = String(input.moduleName || "").toUpperCase();
  const fieldKey = String(input.fieldKey || "").trim();
  if (!EXPORT_MODULES.has(moduleName as ExportModuleName)) throw new Error("INVALID_EXPORT_MODULE");
  if (!fieldKey) throw new Error("FIELD_KEY_REQUIRED");
  try {
    const rule = await queryOne<any>(
      `insert into "ExportSensitiveFieldRule" (id, "tenantId", "moduleName", "fieldKey", "createdBy", "createdAt")
       values ($1, $2, $3, $4, $5, $6)
       returning id, "moduleName", "fieldKey", "createdAt"`,
      [randomUUID(), user.tenantId, moduleName, fieldKey, user.id, new Date().toISOString()],
    );
    if (!rule) throw new Error("SENSITIVE_FIELD_RULE_INSERT_FAILED");
    return rule;
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") throw new Error("DUPLICATE_SENSITIVE_FIELD_RULE");
    throw error;
  }
}

export async function deleteExportSensitiveFieldRuleForTenant(user: TenantUser, ruleId: string) {
  await execute(`delete from "ExportSensitiveFieldRule" where id = $1 and "tenantId" = $2`, [ruleId, user.tenantId]);
}

export async function listExportTemplatesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, name, "moduleName", filters, columns, "createdAt" from "ExportTemplate" where "tenantId" = $1 order by name asc`,
    [user.tenantId],
  );
}

export async function createExportTemplateForTenant(
  user: TenantUser,
  input: { name?: string; moduleName?: string; filters?: Record<string, unknown>; columns?: string[] }
) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const name = String(input.name || "").trim();
  const moduleName = String(input.moduleName || "").toUpperCase();
  if (!name) throw new Error("EXPORT_TEMPLATE_NAME_REQUIRED");
  if (!EXPORT_MODULES.has(moduleName as ExportModuleName)) throw new Error("INVALID_EXPORT_MODULE");
  try {
    const template = await queryOne<any>(
      `insert into "ExportTemplate" (id, "tenantId", name, "moduleName", filters, columns, "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       returning id, name, "moduleName", filters, columns, "createdAt"`,
      [randomUUID(), user.tenantId, name, moduleName, input.filters ?? {}, jsonbParam(input.columns ?? []), user.id, new Date().toISOString()],
    );
    if (!template) throw new Error("EXPORT_TEMPLATE_INSERT_FAILED");
    return template;
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") throw new Error("DUPLICATE_EXPORT_TEMPLATE_NAME");
    throw error;
  }
}

export async function deleteExportTemplateForTenant(user: TenantUser, templateId: string) {
  await execute(`delete from "ExportTemplate" where id = $1 and "tenantId" = $2`, [templateId, user.tenantId]);
}

const DEFAULT_EXPORT_RETENTION_DAYS = 7;

function exportRetentionDays() {
  const value = Number(process.env.EXPORT_FILE_RETENTION_DAYS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_EXPORT_RETENTION_DAYS;
}

// Scheduled cleanup: an export file kept forever is a real, quiet data-exposure liability
// (a link/file that stays downloadable indefinitely long after anyone remembers it exists).
// Deletes the underlying stored file and marks the request EXPIRED; the ExportRequest row
// itself (and its audit trail) survives so "someone exported X on date Y" stays answerable.
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers expired
// export files across every tenant at once.
export async function processExpiredExportFiles(limit = 50) {
  const due = await queryAsSystem<{ id: string; fileObjectId: string | null; storageKey: string | null }>(
    `select er.id, er."fileObjectId", fo."storageKey"
     from "ExportRequest" er
     join "FileObject" fo on fo.id = er."fileObjectId"
     where er.status = 'COMPLETED' and er."expiresAt" is not null and er."expiresAt" <= $1
     limit $2`,
    [new Date().toISOString(), limit],
  );
  let processed = 0;
  for (const row of due) {
    if (row.storageKey) await deletePrivateFile(row.storageKey).catch(() => undefined);
    await executeAsSystem(`update "ExportRequest" set status = 'EXPIRED', "fileObjectId" = null, "updatedAt" = $1 where id = $2`, [
      new Date().toISOString(),
      row.id,
    ]);
    processed += 1;
  }
  return { processed };
}

// WP07 (F04): BACKGROUND_JOB, disposition B -- both callers of this function (the worker's own
// "exports.process" dynamic job, and processDueReportSchedules/retryFailedReportSchedules'
// createDelivery, themselves already-converted background jobs) run with no ambient tenant
// context; the exportRequestId is looked up by id alone, tenant unknown until the row resolves it.
export async function processExportRequest(exportRequestId: string) {
  let request = await queryOneAsSystem<ExportRequestRow>(`select * from "ExportRequest" where id = $1 limit 1`, [exportRequestId]);
  if (!request) throw new Error("EXPORT_REQUEST_NOT_FOUND");
  if (request.status === "COMPLETED" || request.status === "RUNNING") return request;

  const requester = await getCurrentUserById(request.userId);
  if (!requester) throw new Error("EXPORT_REQUEST_USER_NOT_FOUND");
  const user = requester as TenantUser;
  const startedAt = new Date().toISOString();

  const claimedRequest = await queryOneAsSystem<ExportRequestRow>(
    `update "ExportRequest"
     set status = 'RUNNING', "startedAt" = $1, "updatedAt" = $1, error = null
     where id = $2 and status not in ('COMPLETED', 'RUNNING')
     returning *`,
    [startedAt, exportRequestId],
  );
  if (!claimedRequest) {
    const latest = await queryOneAsSystem<ExportRequestRow>(`select * from "ExportRequest" where id = $1 limit 1`, [exportRequestId]);
    if (!latest) throw new Error("EXPORT_REQUEST_NOT_FOUND");
    return latest;
  }
  request = claimedRequest;

  try {
    const content = await fetchExportContent(user, request.moduleName, request.filters ?? {}, request.metadata ?? {});
    const timeZone = await getTenantTimeZone(user.tenantId);
    const contentAny = content as any;
    const isBufferContent = "buffer" in contentAny;
    const extension: string = isBufferContent ? contentAny.extension : "csv";
    const contentType: string = isBufferContent ? contentAny.contentType : "text/csv; charset=utf-8";
    const bodyBuffer: Buffer = isBufferContent ? contentAny.buffer : Buffer.from(contentAny.csv, "utf8");
    const filename = `${content.filenamePrefix}-${formatTenantDate(new Date(), timeZone).replace(/\//g, "-")}-${request.id}.${extension}`;
    const storageKey = `exports/${request.tenantId}/${request.userId}/${filename}`;
    const stored = await writePrivateFile(storageKey, bodyBuffer, {
      bucket: "exports",
      contentType,
    });
    const completedAt = new Date().toISOString();

    await withTransaction({ id: user.id, tenantId: user.tenantId }, async (tx) => {
      const fileObjectId = randomUUID();
      await tx.query(
        `insert into "FileObject"
          (id, "tenantId", "storageDriver", bucket, "storageKey", "originalFilename", "contentType", "byteSize", checksum, "entityType", "entityId", visibility, metadata, "createdBy", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'EXPORT_REQUEST', $10, 'PRIVATE', $11, $12, $13, $13)`,
        [
          fileObjectId,
          request.tenantId,
          stored.driver,
          stored.bucket,
          stored.storageKey,
          filename,
          stored.contentType,
          stored.byteSize,
          stored.checksum,
          request.id,
          { moduleName: request.moduleName, exportType: request.exportType },
          request.userId,
          completedAt,
        ],
      );
      const expiresAt = new Date(new Date(completedAt).getTime() + exportRetentionDays() * 24 * 60 * 60 * 1000).toISOString();
      await tx.query(
        `update "ExportRequest"
         set status = 'COMPLETED', "recordCount" = $1, "fileObjectId" = $2, "completedAt" = $3, "updatedAt" = $3, "expiresAt" = $5
         where id = $4`,
        [content.recordCount, fileObjectId, completedAt, request.id, expiresAt],
      );
      await tx.query(
        `insert into "Notification" (id, "tenantId", "userId", title, message, data, "isRead", "createdAt", "readAt")
         values ($1, $2, $3, $4, $5, $6, false, $7, null)`,
        [
          randomUUID(),
          request.tenantId,
          request.userId,
          "Export ready",
          `${request.moduleName.toLowerCase()} export is ready to download.`,
          { type: "EXPORT_READY", exportRequestId: request.id, moduleName: request.moduleName },
          completedAt,
        ],
      );
    });

    return queryOne<ExportRequestRow>(`select * from "ExportRequest" where id = $1`, [request.id]);
  } catch (error) {
    const failedAt = new Date().toISOString();
    await execute(`update "ExportRequest" set status = 'FAILED', error = $1, "updatedAt" = $2 where id = $3`, [
      error instanceof Error ? error.message : "Export failed",
      failedAt,
      request.id,
    ]);
    throw error;
  }
}

export async function getExportDownloadForUser(user: TenantUser, exportRequestId: string) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertAccountActiveForDownload(user as any);
  const row = await queryOne<{
    id: string;
    status: string;
    fileObjectId: string | null;
    storageKey: string | null;
    originalFilename: string | null;
    contentType: string | null;
    expiresAt: string | null;
  }>(
    `select er.id, er.status, er."fileObjectId", er."expiresAt", fo."storageKey", fo."originalFilename", fo."contentType"
     from "ExportRequest" er
     left join "FileObject" fo on fo.id = er."fileObjectId"
     where er.id = $1 and er."tenantId" = $2 and er."userId" = $3
     limit 1`,
    [exportRequestId, user.tenantId, user.id],
  );
  if (!row) throw new Error("EXPORT_REQUEST_NOT_FOUND");
  if (row.status === "EXPIRED" || (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now())) throw new Error("EXPORT_EXPIRED");
  if (row.status !== "COMPLETED" || !row.storageKey) throw new Error("EXPORT_NOT_READY");
  const buffer = await readPrivateFile(row.storageKey);
  await createAuditLog(user, "DOWNLOAD", "EXPORT_REQUEST", exportRequestId, null, { filename: row.originalFilename }, null).catch(() => undefined);
  return {
    filename: row.originalFilename || `${exportRequestId}.csv`,
    contentType: row.contentType || "text/csv; charset=utf-8",
    buffer,
  };
}

// Same additive "shareable expiring link" pattern as mintPartnerInvoiceDownloadToken -- the
// existing authenticated route above is unchanged; this is a new capability for a user who
// wants to hand someone else (or a script, or a different device without re-logging in) a
// link that itself works for a limited time, without sharing their session.
export async function mintExportDownloadToken(user: TenantUser, exportRequestId: string, expiresInSeconds = 3600) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertAccountActiveForDownload(user as any);
  const row = await queryOne<{ id: string; status: string }>(
    `select id, status from "ExportRequest" where id = $1 and "tenantId" = $2 and "userId" = $3 limit 1`,
    [exportRequestId, user.tenantId, user.id],
  );
  if (!row) throw new Error("EXPORT_REQUEST_NOT_FOUND");
  if (row.status !== "COMPLETED") throw new Error("EXPORT_NOT_READY");
  return generateSignedDownloadToken("export-request", exportRequestId, expiresInSeconds);
}

export async function getExportDownloadByToken(exportRequestId: string, token: string | null) {
  const verification = verifySignedDownloadToken("export-request", exportRequestId, token);
  if (!verification.valid) throw new Error(`INVALID_TOKEN:${verification.reason}`);

  const row = await queryOne<{
    id: string;
    tenantId: string;
    userId: string;
    status: string;
    storageKey: string | null;
    originalFilename: string | null;
    contentType: string | null;
    expiresAt: string | null;
  }>(
    `select er.id, er."tenantId", er."userId", er.status, er."expiresAt", fo."storageKey", fo."originalFilename", fo."contentType"
     from "ExportRequest" er
     left join "FileObject" fo on fo.id = er."fileObjectId"
     where er.id = $1
     limit 1`,
    [exportRequestId],
  );
  if (!row) throw new Error("EXPORT_REQUEST_NOT_FOUND");
  if (row.status === "EXPIRED" || (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now())) throw new Error("EXPORT_EXPIRED");
  if (row.status !== "COMPLETED" || !row.storageKey) throw new Error("EXPORT_NOT_READY");
  const buffer = await readPrivateFile(row.storageKey);
  await createAuditLog({ id: row.userId, tenantId: row.tenantId }, "DOWNLOAD", "EXPORT_REQUEST", exportRequestId, null, { filename: row.originalFilename, viaSignedUrl: true }, null).catch(() => undefined);
  return {
    filename: row.originalFilename || `${exportRequestId}.csv`,
    contentType: row.contentType || "text/csv; charset=utf-8",
    buffer,
  };
}
