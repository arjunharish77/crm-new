import { buildLeadWhere, listLeadsForTenant } from "@/lib/repositories/leads-postgres";
import { buildWhere as buildOpportunityWhere, listOpportunitiesForTenantByType } from "@/lib/repositories/opportunities-postgres";
import { buildWhere as buildActivityWhere, listActivitiesForTenant } from "@/lib/repositories/activities-postgres";
import { buildWhere as buildTaskWhere } from "@/lib/repositories/tasks-postgres";
import { getTenantTimeZone } from "@/lib/server/date-format";

// Round-2 plan wave 3 (B1, B19, C9; decisions 2026-10-26). One place that says which records a
// report may count: the same tenant, record-access (own / team / all, RecordShare) and merge rules
// as the record lists -- by reusing their where-builders -- plus the report filter bar's date range,
// owner and team. Reports select from these scoped rows and count in SQL, so there is no row cap.
//
// Dates are calendar days in the workspace's time zone. Won and lost deals count by the day they
// closed ("closedAt", migration 0138), open deals by the day they were created. Activities have
// no owner of their own, so the owner filter matches whoever logged them ("createdBy"). Cases
// have no record-level access (the case list shows the whole workspace), so only the filters
// narrow them.

type ReportUser = { id: string; tenantId: string | null; teamId?: string | null; role?: any; permissionTemplates?: any[] | null };

export type ReportFilters = {
  from: string | null; // YYYY-MM-DD, inclusive, workspace time zone
  to: string | null; // YYYY-MM-DD, inclusive
  ownerIds: string[] | null;
  teamId: string | null;
};

export const NO_REPORT_FILTERS: ReportFilters = { from: null, to: null, ownerIds: null, teamId: null };

export type ReportRecordKind = "lead" | "opportunity" | "activity" | "task" | "case";

const TABLE: Record<ReportRecordKind, string> = { lead: "Lead", opportunity: "Opportunity", activity: "Activity", task: "Task", case: "Case" };
const OWNER_COLUMN: Record<ReportRecordKind, string> = { lead: '"ownerId"', opportunity: '"ownerId"', activity: '"createdBy"', task: '"ownerId"', case: '"ownerId"' };
const DATE_EXPRESSION: Record<ReportRecordKind, string> = {
  lead: '"createdAt"',
  opportunity: 'coalesce("closedAt", "createdAt")',
  activity: '"createdAt"',
  task: '"createdAt"',
  case: '"createdAt"',
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

function validDay(value: string | null): string | null {
  if (!value || !DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

// Reads the filter bar's parameters (from, to, owner, team). "owner=me" is the signed-in user;
// otherwise a comma list of user ids. Anything malformed is ignored rather than rejected, so an
// old bookmarked link still opens the report.
export function parseReportFilters(params: URLSearchParams, userId: string): ReportFilters {
  let from = validDay(params.get("from"));
  let to = validDay(params.get("to"));
  if (from && to && from > to) [from, to] = [to, from];
  const owner = params.get("owner")?.trim();
  const ownerIds = owner
    ? [...new Set(owner.split(",").map((id) => (id.trim() === "me" ? userId : id.trim())).filter((id) => ID.test(id)))].slice(0, 50)
    : [];
  const team = params.get("team")?.trim() ?? "";
  return { from, to, ownerIds: ownerIds.length ? ownerIds : null, teamId: ID.test(team) ? team : null };
}

export function hasReportFilters(filters: ReportFilters) {
  return Boolean(filters.from || filters.to || filters.ownerIds || filters.teamId);
}

function baseWhere(user: ReportUser, kind: ReportRecordKind): { sql: string; values: unknown[] } {
  if (kind === "lead") return buildLeadWhere(user as any, null);
  if (kind === "opportunity") return buildOpportunityWhere(user as any, null, null);
  if (kind === "activity") return buildActivityWhere(user as any, null);
  if (kind === "task") return buildTaskWhere(user as any, {});
  return user.tenantId ? { sql: 'where "tenantId" = $1', values: [user.tenantId] } : { sql: "where false", values: [] };
}

// Just the filter bar's conditions for one record type (no scope), placeholders from $1. Null when
// nothing is filtered.
export async function reportFilterWhere(
  user: ReportUser,
  kind: ReportRecordKind,
  filters: ReportFilters,
  options: { dateExpression?: string; timeZone?: string } = {},
): Promise<{ sql: string; values: unknown[] } | null> {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const date = options.dateExpression ?? DATE_EXPRESSION[kind];
  if (filters.from || filters.to) {
    values.push(options.timeZone ?? (await getTenantTimeZone(user.tenantId)));
    const tz = values.length;
    if (filters.from) {
      values.push(filters.from);
      clauses.push(`${date} >= ($${values.length}::date::timestamp at time zone $${tz})`);
    }
    if (filters.to) {
      values.push(filters.to);
      clauses.push(`${date} < (($${values.length}::date + 1)::timestamp at time zone $${tz})`);
    }
  }
  if (filters.ownerIds) {
    values.push(filters.ownerIds);
    clauses.push(`${OWNER_COLUMN[kind]} = any($${values.length}::text[])`);
  }
  if (filters.teamId) {
    values.push(filters.teamId);
    const team = values.length;
    values.push(user.tenantId);
    clauses.push(`${OWNER_COLUMN[kind]} in (select id from "User" where "tenantId" = $${values.length} and "teamId"::text = $${team})`);
  }
  return clauses.length ? { sql: clauses.join(" and "), values } : null;
}

// The filter bar's date range on any timestamp column (automation runs, form events, calls), for
// tables that aren't records with an owner. Placeholders from $1; null without dates.
export async function dateRangeWhere(user: ReportUser, filters: ReportFilters, column: string): Promise<{ sql: string; values: unknown[] } | null> {
  if (!filters.from && !filters.to) return null;
  const values: unknown[] = [await getTenantTimeZone(user.tenantId)];
  const clauses: string[] = [];
  if (filters.from) {
    values.push(filters.from);
    clauses.push(`${column} >= ($${values.length}::date::timestamp at time zone $1)`);
  }
  if (filters.to) {
    values.push(filters.to);
    clauses.push(`${column} < (($${values.length}::date + 1)::timestamp at time zone $1)`);
  }
  return { sql: clauses.join(" and "), values };
}

// Appends an optional condition (placeholders from $1) to a query that already binds `values`.
export function andWhere(values: unknown[], extra: { sql: string; values: unknown[] } | null) {
  if (!extra) return "";
  const offset = values.length;
  values.push(...extra.values);
  return ` and ${extra.sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + offset}`)}`;
}

// `select <columns> from "<Table>" where <scope and filters>`, to use as a CTE. Column names are
// unqualified in the generated where clause, so callers alias the CTE, not the table inside it.
// `startIndex` shifts the placeholders when the caller already has bound values ($1..$n).
export async function scopedRecordsSql(
  user: ReportUser,
  kind: ReportRecordKind,
  filters: ReportFilters,
  columns: string,
  options: { startIndex?: number; dateExpression?: string; timeZone?: string } = {},
): Promise<{ sql: string; values: unknown[] }> {
  const where = baseWhere(user, kind);
  const extra = await reportFilterWhere(user, kind, filters, options);
  const values = [...where.values];
  let condition = where.sql.replace(/^where\s+/i, "");
  if (extra) {
    condition += ` and ${extra.sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + values.length}`)}`;
    values.push(...extra.values);
  }
  let sql = `select ${columns} from "${TABLE[kind]}" where ${condition}`;
  const offset = options.startIndex ?? 0;
  if (offset) sql = sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + offset}`);
  return { sql, values };
}

// Every matching lead, opportunity or activity, in the same shape (and with the same field
// masking) as the record lists, read 1,000 at a time. For reports whose calculation needs the
// individual records (stage ageing, cohorts, duplicate detection); before wave 3 these read a
// single capped page (1,000 leads/opportunities, 500 activities), so bigger workspaces got totals
// from a sample.
async function readAllPages<T>(readPage: (page: number) => Promise<{ data: T[]; meta: { total: number; limit: number } }>) {
  const first = await readPage(1);
  const rows = [...first.data];
  const pages = Math.ceil(first.meta.total / Math.max(1, first.meta.limit));
  for (let page = 2; page <= pages; page++) rows.push(...(await readPage(page)).data);
  return rows;
}

export async function listAllLeadsForReport(user: ReportUser, filters: ReportFilters = NO_REPORT_FILTERS): Promise<any[]> {
  const extraWhere = await reportFilterWhere(user, "lead", filters);
  return readAllPages((page) => listLeadsForTenant(user as any, page, 1000, null, { extraWhere }));
}

export async function listAllOpportunitiesForReport(user: ReportUser, filters: ReportFilters = NO_REPORT_FILTERS): Promise<any[]> {
  const extraWhere = await reportFilterWhere(user, "opportunity", filters);
  return readAllPages((page) => listOpportunitiesForTenantByType(user as any, 1000, null, null, page, { extraWhere }));
}

export async function listAllActivitiesForReport(user: ReportUser, filters: ReportFilters = NO_REPORT_FILTERS): Promise<any[]> {
  const extraWhere = await reportFilterWhere(user, "activity", filters);
  return readAllPages((page) => listActivitiesForTenant(user as any, 500, null, page, { extraWhere }));
}

// Day/week/month bucket of a timestamp column in the workspace's time zone, as 'YYYY-MM-DD'
// (the bucket's first day). `tzParam` is the placeholder holding the zone name.
export function timeZoneBucketSql(column: string, grain: "day" | "week" | "month", tzParam: string) {
  return `to_char(date_trunc('${grain}', ${column} at time zone ${tzParam}), 'YYYY-MM-DD')`;
}
