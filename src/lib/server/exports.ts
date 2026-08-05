import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { writePrivateFile, readPrivateFile } from "@/lib/storage/file-storage";
import { enqueueExportJob } from "@/lib/server/job-queue";
import { getCurrentUserById } from "@/lib/repositories/auth-admin-postgres";
import { exportCustomReportForTenant, exportFormSubmissionsForTenant } from "@/lib/server/crm";
import { generateCycleFinanceCsv } from "@/lib/server/partner-invoices";
import * as inbuiltReports from "@/lib/server/inbuilt-reports";
import { formatExportDateValue, formatTenantDate, getTenantTimeZone } from "@/lib/server/date-format";

type TenantUser = {
  id: string;
  tenantId: string | null;
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
  | "FORMS";

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

async function inbuiltReportCsv(user: TenantUser, reportKey: string, timeZone: string) {
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
  return toCsv(reportResultRows(report), timeZone);
}

function tenantClause(user: TenantUser, values: unknown[], alias = "") {
  if (!user.tenantId) return "false";
  values.push(String(user.tenantId));
  return `${alias ? `${alias}.` : ""}"tenantId"::text = $${values.length}`;
}

function filterConditions(filters: Record<string, unknown> | null | undefined): ExportFilterCondition[] {
  const parsed = filters?.urlFilters && typeof filters.urlFilters === "string" ? (() => {
    try {
      return JSON.parse(filters.urlFilters);
    } catch {
      return null;
    }
  })() : null;
  const source: any = Array.isArray(parsed) ? parsed : filters;
  if (Array.isArray(source)) {
    return source.flatMap((group) => Array.isArray(group?.conditions) ? group.conditions : []);
  }
  return Array.isArray(source?.conditions) ? source.conditions : [];
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

function applyMappedConditions(
  clauses: string[],
  values: unknown[],
  filters: Record<string, unknown> | null | undefined,
  columnMap: Map<string, string>,
) {
  for (const condition of filterConditions(filters)) {
    addMappedCondition(clauses, values, condition, columnMap);
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
    if (own) {
      values.push(user.id);
      clauses.push(`l."ownerId" = $${values.length}`);
    }
    values.push(limit);
    return query<Record<string, unknown>>(
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
  }

  if (moduleName === "OPPORTUNITIES") {
    const clauses = [tenantClause(user, values, "o")];
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
    if (own) {
      values.push(user.id);
      clauses.push(`o."ownerId" = $${values.length}`);
    }
    values.push(limit);
    return query<Record<string, unknown>>(
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
       left join "PartnerProfile" pp on pp.id = p."partnerId"
       left join "User" u on u.id = pp."userId"
       left join "PartnerOrganization" po on po.id = p."partnerOrganizationId"
       where ${clauses.join(" and ")}
       order by p."createdAt" desc
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
    const csv = await inbuiltReportCsv(user, filters.reportKey, timeZone);
    return { csv, recordCount: csvRowCount(csv), filenamePrefix: filters.reportKey.replace(/[^a-z0-9_-]/gi, "-").toLowerCase() };
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

export async function createExportRequestForUser(user: TenantUser, input: Record<string, unknown>) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const moduleName = String(input.moduleName || "").toUpperCase() as ExportModuleName;
  if (!EXPORT_MODULES.has(moduleName)) throw new Error("INVALID_EXPORT_MODULE");
  const id = randomUUID();
  const now = new Date().toISOString();

  await execute(
    `insert into "ExportRequest"
       (id, "tenantId", "userId", "moduleName", "exportType", status, filters, columns, metadata, "queuedAt", "updatedAt")
     values ($1, $2, $3, $4, 'CSV', 'QUEUED', $5, $6, $7, $8, $8)`,
    [
      id,
      user.tenantId,
      user.id,
      moduleName,
      JSON.stringify(input.filters && typeof input.filters === "object" ? input.filters : {}),
      JSON.stringify(Array.isArray(input.columns) ? input.columns : []),
      JSON.stringify(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      now,
    ],
  );

  try {
    await enqueueExportJob(id);
  } catch (error) {
    await execute(`update "ExportRequest" set status = 'FAILED', error = $1, "updatedAt" = $2 where id = $3`, [
      error instanceof Error ? error.message : "Export queue unavailable",
      new Date().toISOString(),
      id,
    ]);
    throw error;
  }
  return queryOne<ExportRequestRow>(`select * from "ExportRequest" where id = $1`, [id]);
}

export async function processExportRequest(exportRequestId: string) {
  let request = await queryOne<ExportRequestRow>(`select * from "ExportRequest" where id = $1 limit 1`, [exportRequestId]);
  if (!request) throw new Error("EXPORT_REQUEST_NOT_FOUND");
  if (request.status === "COMPLETED" || request.status === "RUNNING") return request;

  const requester = await getCurrentUserById(request.userId);
  if (!requester) throw new Error("EXPORT_REQUEST_USER_NOT_FOUND");
  const user = requester as TenantUser;
  const startedAt = new Date().toISOString();

  const claimedRequest = await queryOne<ExportRequestRow>(
    `update "ExportRequest"
     set status = 'RUNNING', "startedAt" = $1, "updatedAt" = $1, error = null
     where id = $2 and status not in ('COMPLETED', 'RUNNING')
     returning *`,
    [startedAt, exportRequestId],
  );
  if (!claimedRequest) {
    const latest = await queryOne<ExportRequestRow>(`select * from "ExportRequest" where id = $1 limit 1`, [exportRequestId]);
    if (!latest) throw new Error("EXPORT_REQUEST_NOT_FOUND");
    return latest;
  }
  request = claimedRequest;

  try {
    const content = await fetchExportContent(user, request.moduleName, request.filters ?? {}, request.metadata ?? {});
    const timeZone = await getTenantTimeZone(user.tenantId);
    const filename = `${content.filenamePrefix}-${formatTenantDate(new Date(), timeZone).replace(/\//g, "-")}-${request.id}.csv`;
    const storageKey = `exports/${request.tenantId}/${request.userId}/${filename}`;
    const stored = await writePrivateFile(storageKey, Buffer.from(content.csv, "utf8"), {
      bucket: "exports",
      contentType: "text/csv; charset=utf-8",
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
      await tx.query(
        `update "ExportRequest"
         set status = 'COMPLETED', "recordCount" = $1, "fileObjectId" = $2, "completedAt" = $3, "updatedAt" = $3
         where id = $4`,
        [content.recordCount, fileObjectId, completedAt, request.id],
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
  const row = await queryOne<{
    id: string;
    status: string;
    fileObjectId: string | null;
    storageKey: string | null;
    originalFilename: string | null;
    contentType: string | null;
  }>(
    `select er.id, er.status, er."fileObjectId", fo."storageKey", fo."originalFilename", fo."contentType"
     from "ExportRequest" er
     left join "FileObject" fo on fo.id = er."fileObjectId"
     where er.id = $1 and er."tenantId" = $2 and er."userId" = $3
     limit 1`,
    [exportRequestId, user.tenantId, user.id],
  );
  if (!row) throw new Error("EXPORT_REQUEST_NOT_FOUND");
  if (row.status !== "COMPLETED" || !row.storageKey) throw new Error("EXPORT_NOT_READY");
  return {
    filename: row.originalFilename || `${exportRequestId}.csv`,
    contentType: row.contentType || "text/csv; charset=utf-8",
    buffer: await readPrivateFile(row.storageKey),
  };
}
