import type { CreateUnitOfWork } from "./create-unit-of-work";
import { randomUUID, createHash } from "crypto";
import { execute, query, queryOne, type Queryable } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { distributeRecord } from "@/lib/server/distribution-engine";
import { refreshNextBestActionsForRecord } from "@/lib/server/next-best-action";
import { enqueueWebhookEvent } from "@/lib/server/webhook-outbox";
import { enqueueAppEvent } from "@/lib/server/marketplace-events";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { invalidateReportRollupsForTenant } from "@/lib/server/report-rollups";
import { applyFilterCondition, assertFilterGroupsSupported, buildGroupedFilterClause, normalizeFilterGroups, type FilterColumnEntry, type FilterValueKind } from "@/lib/query-filters";
import { substituteUserTokens } from "@/lib/server/user-token-filters";
import { maskFieldsForUser, sanitizeWritePayload } from "@/lib/server/field-permissions";
import { applyRecordScopeClause, recordAccessLevel } from "@/lib/server/record-scope";
import { resolveLeadStatusForWrite } from "@/lib/repositories/lead-statuses-postgres";

type TenantUser = {
  apiKeyId?: string;
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  permissionTemplates?: any[] | null;
  teamId?: string | null;
  isImpersonating?: boolean;
  impersonatedBy?: string | null;
  // WP04 fix: see record-scope.ts's ScopedUser -- lets a marketplace-app actor's OWN/TEAM check
  // run against a designated internal user without changing what `id` itself means for audit
  // attribution.
  recordScopeActorId?: string | null;
};

type LeadFilterCondition = {
  field?: string;
  operator?: string;
  value?: unknown;
};

type LeadFilterInput =
  | LeadFilterCondition
  | {
      logic?: "AND" | "OR";
      conditions?: LeadFilterCondition[];
    };

const LEAD_COLUMNS = '"duplicateWarnings", id, name, email, phone, company, source, status, score, tags, "createdBy", "createdAt", "updatedAt", "ownerId"';

// WP09 (F12): predictive-score fields compile as an inline `id in (select ...)` subquery against
// "RecordScore" (see the `subquery` descriptor on FilterColumnEntry in query-filters.ts) so they
// participate in the same AND/OR group-logic tree as every other field, instead of being
// resolved into a record-id list beforehand and ANDed onto the whole where clause -- the fix for
// the audit's own example of a top-level OR (source = web OR predictiveScoreBand = HOT) silently
// becoming an AND.
const RECORD_SCORE_SUBQUERY = { table: '"RecordScore"', matchColumn: '"recordId"', recordType: "LEAD" };

const LEAD_FILTER_COLUMNS = new Map<string, FilterColumnEntry>([
  ["id", { column: "id", kind: "text" }],
  ["name", { column: "name", kind: "text" }],
  ["email", { column: "email", kind: "text" }],
  ["phone", { column: "phone", kind: "text" }],
  ["company", { column: "company", kind: "text" }],
  ["source", { column: "source", kind: "text" }],
  // Compared as the status key, so a stored "Hot" matches the key HOT.
  ["status", { column: "status", kind: "select", expression: "crm_lead_status_key(status)" }],
  // Open / Converted / Lost, from the tenant's statuses (UI/UX plan decision 6).
  ["statusCategory", { column: "statusCategory", kind: "select", expression: 'crm_lead_status_category("tenantId", status)' }],
  ["score", { column: "score", kind: "number" }],
  ["createdBy", { column: "createdBy", kind: "user" }],
  ["ownerId", { column: "ownerId", kind: "user" }],
  ["createdAt", { column: "createdAt", kind: "date" }],
  ["updatedAt", { column: "updatedAt", kind: "date" }],
  ["tags", { column: "tags", kind: "tags" }],
  ["predictiveScoreBand", { column: "scoreBand", kind: "select", subquery: RECORD_SCORE_SUBQUERY }],
  ["predictiveConfidence", { column: "confidence", kind: "number", subquery: RECORD_SCORE_SUBQUERY }],
  ["predictiveConversionProbability", { column: "conversionProbability", kind: "number", subquery: RECORD_SCORE_SUBQUERY }],
  ["predictiveWinProbability", { column: "winProbability", kind: "number", subquery: RECORD_SCORE_SUBQUERY }],
  ["predictiveStallRisk", { column: "stallRisk", kind: "number", subquery: RECORD_SCORE_SUBQUERY }],
  ["predictiveExpectedResponseLikelihood", { column: "expectedResponseLikelihood", kind: "number", subquery: RECORD_SCORE_SUBQUERY }],
  ["predictiveDuplicateRisk", { column: "duplicateRisk", kind: "number", subquery: RECORD_SCORE_SUBQUERY }],
  ["predictiveStaleRisk", { column: "staleRisk", kind: "number", subquery: RECORD_SCORE_SUBQUERY }],
]);

function normalizeLeadFilters(filters: LeadFilterInput[] | LeadFilterInput | null) {
  return normalizeFilterGroups(filters) as LeadFilterInput[];
}

// WP09 (F11 follow-up): exported (was previously private to this file) so opportunities-postgres.ts
// can build genuine cross-table SQL aggregates (e.g. lead-source ROI, which must join Opportunity
// to Lead through the SAME tenant/scope filtering both tables' own read paths already use) without
// duplicating or approximating this logic -- see the aggregate functions below and in
// opportunities-postgres.ts for why. Still the single source of truth for Lead's own
// tenant/soft-merge/record-scope filtering; nothing about its own logic changed.
export function buildLeadWhere(user: TenantUser, filters: LeadFilterInput[] | null) {
  const clauses: string[] = [];
  const values: unknown[] = [];

  let tenantIdParam: number | null = null;
  if (user.tenantId) {
    values.push(user.tenantId);
    tenantIdParam = values.length;
    clauses.push(`"tenantId" = $${tenantIdParam}`);
  } else {
    clauses.push(`"tenantId" is null`);
  }

  // A merged-away Lead is a soft-merge: the row survives (see mergeLeadsForTenant /
  // dedupe-postgres.ts) rather than being deleted, so every normal read path must exclude it
  // explicitly -- otherwise it would keep showing up in lists/search right alongside its
  // survivor as if nothing happened.
  clauses.push(`"mergedIntoId" is null`);

  // F03 fix (WP04): OWN/TEAM/ALL, not a binary OWN-vs-everything-else check -- see
  // record-scope.ts. A role configured as "TEAM Records" in the Roles UI previously fell
  // through to unrestricted tenant-wide visibility, identical to "ALL", since only "OWN" was
  // ever actually checked here.
  applyRecordScopeClause(clauses, values, user, "LEAD", tenantIdParam);

  // WP09 (F12): predictive-score fields (LEAD_FILTER_COLUMNS entries with a `subquery`
  // descriptor) now compile inline as part of the SAME grouped AND/OR tree -- see
  // buildGroupedFilterClause in query-filters.ts. Previously they were resolved into a record-id
  // list by a separate query and ANDed onto the whole where clause here, which silently turned a
  // top-level OR mixing a normal field and a score field into an intersection.
  buildGroupedFilterClause(clauses, values, normalizeLeadFilters(filters), LEAD_FILTER_COLUMNS, undefined, user.tenantId);

  return { sql: clauses.length ? `where ${clauses.join(" and ")}` : "", values };
}

async function getPredictiveScoreMap(tenantId: string | null, recordIds: string[]) {
  if (!recordIds.length) return new Map<string, any>();
  const rows = await query<any>(
    `select id, "recordType", "recordId", "fitScore", "engagementScore", "conversionProbability",
            "winProbability", "stallRisk", "scoreBand", confidence, reasons, source,
            "expectedResponseLikelihood", "duplicateRisk", "staleRisk", "expectedCloseRisk",
            "suggestedCloseDate", "suggestedCloseDateDeltaDays", "nextBestAction", "nextBestActivityType",
            "topDrivers", "missingDataWarnings", "similarRecordIds", "suggestedDataImprovements",
            "overrideReason", "overrideUntil", "overrideOwnerId", "overriddenAt", "callEngagementScore",
            "calculatedAt", "updatedAt"
     from "RecordScore"
     where "recordType" = 'LEAD'
       and "recordId" = any($1::text[])
       and ${tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
    tenantId ? [recordIds, tenantId] : [recordIds],
  );
  return new Map(rows.map((score) => [score.recordId, score]));
}

export async function getPendingNbaCountMap(tenantId: string | null, recordIds: string[]) {
  if (!recordIds.length) return new Map<string, number>();
  const rows = await query<{ recordId: string; count: number }>(
    `select "recordId", count(*)::int as count
     from "NextBestActionRecommendation"
     where "recordType" = 'LEAD'
       and "recordId" = any($1::text[])
       and (status = 'PENDING' or (status = 'SNOOZED' and ("snoozedUntil" is null or "snoozedUntil" <= now())))
       and ${tenantId ? '"tenantId" = $2' : '"tenantId" is null'}
     group by "recordId"`,
    tenantId ? [recordIds, tenantId] : [recordIds],
  );
  return new Map(rows.map((row) => [row.recordId, row.count]));
}

// F03 fix (WP04): every read path funnels through here, so a field a tenant's permission
// template marks "hidden" for this user (e.g. phone/email for a role that shouldn't see them)
// is masked before the record ever leaves the repository -- previously LEAD_COLUMNS always
// included every column regardless of what the template configured.
function formatLead(user: TenantUser, lead: any, predictiveScore: any = null, pendingNbaCount = 0) {
  return maskFieldsForUser(user, "leads", {
    ...lead,
    assignedUserId: lead.ownerId ?? null,
    predictiveScore,
    pendingNbaCount,
  });
}

async function getObjectId(user: TenantUser) {
  const existing = await queryOne<{ id: string }>(
    `select id from "ObjectDefinition" where name = 'lead' and ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'} limit 1`,
    user.tenantId ? [user.tenantId] : [],
  );
  if (existing?.id) return existing.id;

  const id = randomUUID();
  const now = new Date().toISOString();
  await queryOne(
    'insert into "ObjectDefinition" (id, "tenantId", name, label, "isCustom", "createdAt", "updatedAt") values ($1, $2, $3, $4, false, $5, $5) returning id',
    [id, user.tenantId, "lead", "Lead", now],
  );
  return id;
}

export async function createAuditLog(
  user: TenantUser,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  diff: Record<string, unknown> | null,
  client?: Queryable,
) {
  // "Complete audit trail" for impersonation (gap checklist: "impersonation governance") --
  // this is the single choke point nearly every write in this app already calls to log an
  // audit entry, so tagging it here covers all of them for free rather than needing every
  // individual call site to remember to pass impersonation context through. Without this, an
  // action taken by a platform admin impersonating a user was audit-logged identically to one
  // the real user took themselves -- indistinguishable after the fact. `user` here is
  // typically the exact object requireCurrentUser/getCurrentUser returned, which already
  // carries isImpersonating/impersonatedBy when applicable.
  //
  // WP08 (F13): optional `client` -- when the caller is inside a withTransaction (e.g. the
  // atomic core of createLeadForTenant/updateLeadForTenant), pass it so this insert commits or
  // rolls back with the record change itself rather than as a separate, independently-fallible
  // write. flagAuditLogIfAnomalous's own update reads the just-inserted row by id, so it must
  // use the SAME client -- a different pooled connection wouldn't see an uncommitted insert.
  const metadata = user.apiKeyId ? {apiKeyId:user.apiKeyId} : user.isImpersonating && user.impersonatedBy ? { impersonatedBy: user.impersonatedBy } : null;
  const id = randomUUID();
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, user.tenantId, user.id, action, entityType, entityId, before, after, diff, metadata, new Date().toISOString()],
    client,
  );
  // "Anomaly flags" (gap checklist: "audit review workflows") -- real but deliberately narrow:
  // a rate-based check reusing the existing Redis-backed rate limiter (more than N of the same
  // action by one user within a window gets flagged for a reviewer), not ML/statistical
  // modeling. Runs at this one choke point so every one of the ~90 call sites gets it for free.
  await flagAuditLogIfAnomalous(id, user.id, action, client).catch(() => undefined);
}

const ANOMALY_ACTION_LIMIT = 20;
const ANOMALY_WINDOW_SECONDS = 10 * 60;

async function flagAuditLogIfAnomalous(auditLogId: string, userId: string, action: string, client?: Queryable) {
  const result = await checkRateLimit({
    key: `audit-anomaly:${userId}:${action}`,
    limit: ANOMALY_ACTION_LIMIT,
    windowSeconds: ANOMALY_WINDOW_SECONDS,
  });
  if (!result.allowed) {
    await execute(`update "AuditLog" set flagged = true, "flagReason" = $1 where id = $2`, [
      `More than ${ANOMALY_ACTION_LIMIT} "${action}" actions by this user within ${ANOMALY_WINDOW_SECONDS / 60} minutes`,
      auditLogId,
    ], client);
  }
}

function fieldDiff(before: Record<string, any>, after: Record<string, any>) {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of ["name", "email", "phone", "company", "source", "status", "ownerId"]) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      diff[key] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return diff;
}

// --- List search, sort and row details (UI/UX plan decision 5, Phase 2 Leads list) ---
// strictFilters: refuse a filter that can't be applied instead of skipping it (Smart Views).
export type LeadListOptions = { search?: string | null; sort?: { id: string; desc: boolean } | null; strictFilters?: boolean };

// Name, email, company, or the phone's digits (ignoring spaces, "+" and dashes).
export function applyLeadSearch(where: { sql: string; values: unknown[] }, search?: string | null) {
  const term = typeof search === "string" ? search.trim() : "";
  if (!term) return where;
  const values = [...where.values, `%${term}%`];
  const n = values.length;
  const phone = term.replace(/\D/g, "").length >= 4
    ? ` or regexp_replace(coalesce(phone, ''), '\\D', '', 'g') like '%' || regexp_replace($${n}, '\\D', '', 'g') || '%'`
    : "";
  const clause = `(name ilike $${n} or email ilike $${n} or company ilike $${n}${phone})`;
  return { sql: where.sql ? `${where.sql} and ${clause}` : `where ${clause}`, values };
}

// Whitelisted sort columns only; anything else falls back to newest first.
const LEAD_SORTS: Record<string, string> = {
  name: "lower(name)",
  status: "crm_lead_status_key(status)",
  source: "lower(source)",
  score: "score",
  createdAt: '"createdAt"',
  updatedAt: '"updatedAt"',
  owner: '(select lower(coalesce(u.name, u.email)) from "User" u where u.id = "Lead"."ownerId")',
  lastActivityAt: '(select max(a."createdAt") from "Activity" a where a."leadId" = "Lead".id)',
};
function leadOrderBy(sort?: LeadListOptions["sort"]) {
  const expression = sort?.id ? LEAD_SORTS[sort.id] : undefined;
  if (!expression) return '"createdAt" desc';
  return `${expression} ${sort!.desc ? "desc" : "asc"} nulls last, "createdAt" desc`;
}

// Owner name, last activity and the next open task for a page of leads. The next task follows
// the tasks page's own access: people with "own records" access only see their own tasks.
async function getLeadRowDetails(user: TenantUser, leads: Array<{ id: string; ownerId?: string | null }>) {
  const ids = leads.map((lead) => lead.id);
  const ownerIds = [...new Set(leads.map((lead) => lead.ownerId).filter((id): id is string => !!id))];
  if (!ids.length) return { owners: new Map<string, string>(), lastActivity: new Map<string, string>(), nextTask: new Map<string, { id: string; title: string; dueAt: string | null }>() };
  const ownTasksOnly = recordAccessLevel(user as any) === "OWN";
  const [owners, activities, tasks] = await Promise.all([
    ownerIds.length ? query<{ id: string; name: string | null; email: string }>('select id, name, email from "User" where id = any($1::text[])', [ownerIds]) : Promise.resolve([]),
    query<{ leadId: string; at: string }>(
      `select "leadId", max("createdAt") as at from "Activity" where "tenantId" ${user.tenantId ? "= $2" : "is null"} and "leadId" = any($1::text[]) group by "leadId"`,
      user.tenantId ? [ids, user.tenantId] : [ids],
    ),
    query<{ leadId: string; id: string; title: string; dueAt: string | null }>(
      `select distinct on ("leadId") "leadId", id, title, "dueAt" from "Task"
       where "tenantId" ${user.tenantId ? "= $2" : "is null"} and "leadId" = any($1::text[])
         and coalesce(upper(status), '') not in ('COMPLETED', 'DONE', 'CANCELLED')
         ${ownTasksOnly ? `and "ownerId" = $${user.tenantId ? 3 : 2}` : ""}
       order by "leadId", "dueAt" asc nulls last, "createdAt" asc`,
      [ids, ...(user.tenantId ? [user.tenantId] : []), ...(ownTasksOnly ? [user.id] : [])],
    ),
  ]);
  return {
    owners: new Map((owners ?? []).map((owner) => [owner.id, owner.name || owner.email])),
    lastActivity: new Map((activities ?? []).map((row) => [row.leadId, row.at])),
    nextTask: new Map((tasks ?? []).map((row) => [row.leadId, { id: row.id, title: row.title, dueAt: row.dueAt }])),
  };
}

export async function listLeadsForTenant(
  user: TenantUser,
  page: number,
  limit: number,
  filters: LeadFilterInput[] | null = null,
  options: LeadListOptions = {},
) {
  const currentPage = Math.max(1, Number.isFinite(page) ? page : 1);
  // WP09 (F11): raised from 200 to 1000 -- inbuilt-reports.ts calls this with limit=1000 in
  // ~10 different reports, expecting up to that many rows for in-memory aggregation/analysis;
  // the old 200 cap silently truncated every one of those reports to a fifth of what they asked
  // for, with no indication anything was incomplete. 1000 is still not a durable fix at real
  // tenant scale (a tenant with >1000 matching leads still gets a silently-partial report) --
  // see 25_AUDIT_REMEDIATION_PLAN.md WP09 for why the real fix (per-report SQL aggregation) is
  // tracked as a separate, larger follow-up rather than done in this pass.
  const currentLimit = Math.min(1000, Math.max(1, Number.isFinite(limit) ? limit : 10));
  const offset = (currentPage - 1) * currentLimit;
  // "Current user/team tokens" (gap checklist's universal advanced filter drawer sub-item) --
  // "@myteam" needs a DB lookup, so it's resolved here, once, before the synchronous
  // buildLeadWhere runs, rather than making buildLeadWhere itself async (which would ripple
  // into its several other no-filter call sites below).
  const resolvedFilters = await substituteUserTokens(normalizeLeadFilters(filters), user);
  if (options.strictFilters) assertFilterGroupsSupported(resolvedFilters, LEAD_FILTER_COLUMNS);
  const where = applyLeadSearch(buildLeadWhere(user, resolvedFilters), options.search);

  const [countRow, data] = await Promise.all([
    queryOne<{ count: number }>(`select count(*)::int as count from "Lead" ${where.sql}`, where.values),
    query<any>(
      `select ${LEAD_COLUMNS} from "Lead" ${where.sql} order by ${leadOrderBy(options.sort)} limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      where.values.concat([currentLimit, offset]),
    ),
  ]);
  const [scoreMap, nbaCountMap, details] = await Promise.all([
    getPredictiveScoreMap(user.tenantId, data.map((lead) => lead.id)),
    getPendingNbaCountMap(user.tenantId, data.map((lead) => lead.id)),
    getLeadRowDetails(user, data),
  ]);

  return {
    data: data.map((lead) => ({
      ...formatLead(user, lead, scoreMap.get(lead.id) ?? null, nbaCountMap.get(lead.id) ?? 0),
      ownerName: lead.ownerId ? details.owners.get(lead.ownerId) ?? null : null,
      lastActivityAt: details.lastActivity.get(lead.id) ?? null,
      nextTask: details.nextTask.get(lead.id) ?? null,
    })),
    meta: {
      total: countRow?.count ?? 0,
      page: currentPage,
      last_page: Math.max(1, Math.ceil((countRow?.count ?? 0) / currentLimit)),
      limit: currentLimit,
      // WP09 (F11): `data` never has more rows than `currentLimit` even when more match --
      // `isComplete` says whether THIS response's `data` array genuinely IS every matching
      // record (only true on page 1 when the real total fits within one page), so a caller doing
      // in-memory aggregation over `.data` alone (as several inbuilt reports do) can tell a
      // capped/partial fetch apart from a genuinely complete one instead of silently treating
      // both the same way.
      isComplete: currentPage === 1 && (countRow?.count ?? 0) <= currentLimit,
    },
  };
}

// Gap checklist Module 17, item 25 (embedded analytics surfaces: "view-level count chips").
// A cheap, dedicated aggregate query -- reuses the exact same tenant/ownership scoping
// (`buildLeadWhere`) every other Lead read path uses, so the counts a viewer sees always match
// what they're actually allowed to see, not a raw tenant-wide count.
export async function getLeadStatusCountsForTenant(user: TenantUser) {
  const where = buildLeadWhere(user, null);
  return query<{ status: string; count: number }>(`select crm_lead_status_key(status) as status, count(*)::int as count from "Lead" ${where.sql} group by 1`, where.values);
}

// WP09 (F11): real SQL aggregation for `getPeriodComparisonReportForTenant` in inbuilt-reports.ts.
// The report previously fetched up to 1000 leads tenant-wide (most-recent-first) and filtered by
// date range in JS -- silently wrong for a tenant whose "this period"/"last period" window's real
// leads fall outside whatever happens to be in the top 1000 by createdAt (e.g. any tenant with
// >1000 total leads comparing a period other than "right now"). This runs one `count(*) filter
// (where ...)` query per range directly against the full matching set (same `buildLeadWhere`
// tenant/scope/soft-merge filtering every other Lead read path uses), so both counts are exact
// regardless of how many leads the tenant has in total.
export async function getLeadPeriodCountsForTenant(
  user: TenantUser,
  currentRange: { start: Date; end: Date },
  previousRange: { start: Date; end: Date },
) {
  const where = buildLeadWhere(user, null);
  const base = where.values.length;
  const values = where.values.concat([
    currentRange.start.toISOString(),
    currentRange.end.toISOString(),
    previousRange.start.toISOString(),
    previousRange.end.toISOString(),
  ]);
  const row = await queryOne<{ current: number; previous: number }>(
    `select
       count(*) filter (where "createdAt" >= $${base + 1}::timestamptz and "createdAt" < $${base + 2}::timestamptz)::int as current,
       count(*) filter (where "createdAt" >= $${base + 3}::timestamptz and "createdAt" < $${base + 4}::timestamptz)::int as previous
     from "Lead" ${where.sql}`,
    values,
  );
  return { current: row?.current ?? 0, previous: row?.previous ?? 0 };
}

const LEAD_CREATE_IDEMPOTENCY_SOURCE = "LEAD_CREATE";

function hashIdempotentRequestBody(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

// WP08 (F13): lead creation's atomic core + idempotency + after-commit side effects.
//
// Atomic core (one transaction): insert the lead, write its mandatory audit row, write durable
// WebhookOutbox rows for any active subscription, and (when an idempotency key was supplied)
// record the replay row -- all committed together or none at all. Previously each of these was a
// separately-fallible `await` after the lead already existed: a crash/error between them could
// leave a lead with no audit trail, or an audit trail with no webhook delivery ever enqueued
// (silently, since the old call sites swallowed the enqueue error).
//
// After commit (best-effort, never rolls back an already-committed lead): distribution
// (assignment), automations, the marketplace app event bus, NBA refresh, and report-rollup
// invalidation. These are the "expensive downstream work" the audit's fix asks to move out of
// the atomic core -- an ML/automation/marketplace outage must not turn a committed lead into an
// unexplained 500. This also settles the audit's own explicit question of which assignment
// invariant must hold: ownership is NOT required to exist the instant a lead is created --
// `distributeRecord` already runs its own separate transaction and is safe to fail/retry-later
// without the lead itself being invalid; a lead created while distribution is down simply stays
// unassigned (ownerId null) until the next successful distribution run for that record, rather
// than blocking creation on it.
export async function createLeadForTenant(user: TenantUser, payload: Record<string, unknown>, idempotencyKey?: string | null, unit?: CreateUnitOfWork) {
  const requestHash = idempotencyKey ? hashIdempotentRequestBody(payload) : null;

  // Checked before any other work (including getObjectId) -- a cache hit should be as cheap as
  // possible, not pay for a lookup/insert this request will just discard the result of.
  if (idempotencyKey && user.tenantId) {
    const existing = await queryOne<{ requestHash: string; responseSnapshot: any }>(
      `select "requestHash", "responseSnapshot" from "RequestIdempotencyKey" where "tenantId" = $1 and source = $2 and "idempotencyKey" = $3`,
      [user.tenantId, LEAD_CREATE_IDEMPOTENCY_SOURCE, idempotencyKey],
    );
    if (existing) {
      if (existing.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
      return maskFieldsForUser(user, "leads", existing.responseSnapshot);
    }
  }

  const objectId = await getObjectId(user);
  const now = new Date().toISOString();
  const id = randomUUID();
  // The tenant's first Open status when none is given (was a fixed "NEW").
  const status = await resolveLeadStatusForWrite(user.tenantId, payload.status);

  const insertLeadAndReplayRow = async () => {
    const write = async (client: Queryable) => {
      const lead = await queryOne<any>(
        `insert into "Lead" (id, name, email, phone, company, source, status, "tenantId", "createdBy", "objectId", score, tags, "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $12)
         returning ${LEAD_COLUMNS}`,
        [
          id,
          payload.name,
          payload.email || null,
          payload.phone || null,
          payload.company || null,
          payload.source || null,
          status,
          user.tenantId,
          user.id,
          objectId,
          [],
          now,
        ],
        client,
      );
      if (!lead) throw new Error("LEAD_INSERT_FAILED");
      // Raw (unmasked) shape for audit/distribution/automations/webhooks/NBA -- see the comment
      // on updateLeadForTenant's equivalent rawUpdated: masking is a response-to-the-acting-user
      // policy, not a property of the record itself, so internal system consumers always get the
      // real values regardless of what this particular caller's permission template hides.
      const rawLead = { ...lead, assignedUserId: lead.ownerId ?? null, predictiveScore: null, pendingNbaCount: 0 };
      await createAuditLog(user, "CREATE", "LEAD", rawLead.id, null, rawLead, null, client);
      await enqueueWebhookEvent(user.tenantId, "LEAD_CREATED", rawLead, client);

      if (idempotencyKey && user.tenantId) {
        const masked = maskFieldsForUser(user, "leads", rawLead);
        await execute(
          `insert into "RequestIdempotencyKey" (id, "tenantId", source, "idempotencyKey", "requestHash", "entityType", "entityId", "responseSnapshot", "createdAt")
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [randomUUID(), user.tenantId, LEAD_CREATE_IDEMPOTENCY_SOURCE, idempotencyKey, requestHash, "LEAD", rawLead.id, masked, now],
          client,
        );
      }
      return rawLead;
    };
    return unit ? write(unit.tx) : withTransaction(user as any, write);
  };

  let raw: any;
  try {
    raw = await insertLeadAndReplayRow();
  } catch (error) {
    // A concurrent request under the SAME idempotency key can race this one to the unique
    // index -- the loser here isn't a real failure, it means the winner already produced the
    // canonical result, so replay it instead of surfacing a spurious 500.
    const pgError = error as { code?: string };
    if (idempotencyKey && user.tenantId && (pgError.code === "23505" || (error instanceof Error && error.message.startsWith("DUPLICATE_RULE_BLOCK:")))) {
      const existing = await queryOne<{ requestHash: string; responseSnapshot: any }>(
        `select "requestHash", "responseSnapshot" from "RequestIdempotencyKey" where "tenantId" = $1 and source = $2 and "idempotencyKey" = $3`,
        [user.tenantId, LEAD_CREATE_IDEMPOTENCY_SOURCE, idempotencyKey],
      );
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        return maskFieldsForUser(user, "leads", existing.responseSnapshot);
      }
    }
    throw error;
  }

  const complete = async () => {
  const distribution = await distributeRecord(user, "LEAD", raw.id, raw).catch(() => null);
  const rawWithOwner = distribution?.assignedUserId ? { ...raw, ownerId: distribution.assignedUserId, assignedUserId: distribution.assignedUserId } : raw;
  await runAutomationsForEvent(user, "LEAD_CREATED", "LEAD", rawWithOwner.id, rawWithOwner).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, "LEAD_CREATED", rawWithOwner).catch(() => undefined);
  await refreshNextBestActionsForRecord(user, "LEAD", rawWithOwner.id);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  return maskFieldsForUser(user, "leads", rawWithOwner);
  };
  if (unit) { unit.afterCommit.push(complete); return maskFieldsForUser(user, "leads", raw); }
  return complete();
}

// Raw (unmasked) lead fetch, shared by getLeadForTenant (which masks before returning to the
// caller) and updateLeadForTenant (which needs the TRUE current values as its merge baseline --
// using the masked version there would silently overwrite a "hidden" field's real value with
// null on every update that doesn't explicitly touch it, since a masked field always reads as
// null regardless of what's actually stored).
async function fetchRawLead(user: TenantUser, id: string) {
  const where = buildLeadWhere(user, null);
  const values = where.values.concat([id]);
  const lead = await queryOne<any>(`select ${LEAD_COLUMNS} from "Lead" ${where.sql} and id = $${values.length} limit 1`, values);
  if (!lead) return null;
  const scoreMap = await getPredictiveScoreMap(user.tenantId, [lead.id]);
  return { ...lead, assignedUserId: lead.ownerId ?? null, predictiveScore: scoreMap.get(lead.id) ?? null, pendingNbaCount: 0 };
}

export async function getLeadForTenant(user: TenantUser, id: string) {
  const raw = await fetchRawLead(user, id);
  if (!raw) return null;
  // Owner name and last activity for the record header and summary (UI/UX plan §10.5).
  const details = await getLeadRowDetails(user, [raw]);
  return {
    ...maskFieldsForUser(user, "leads", raw),
    ownerName: raw.ownerId ? details.owners.get(raw.ownerId) ?? null : null,
    lastActivityAt: details.lastActivity.get(raw.id) ?? null,
  };
}

export async function updateLeadForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  const existing = await fetchRawLead(user, id);
  if (!existing) return null;

  // F03 fix: a field this user's permission template marks "readonly" or "hidden" is dropped
  // from the payload before it can influence the update -- silently, the same way a disabled
  // form field would never be submitted in the first place.
  const { sanitized } = sanitizeWritePayload(user, "leads", payload);

  const nextName = sanitized.name !== undefined ? sanitized.name : existing.name;
  const nextEmail = sanitized.email !== undefined ? sanitized.email : existing.email;
  const nextPhone = sanitized.phone !== undefined ? sanitized.phone : existing.phone;
  const nextCompany = sanitized.company !== undefined ? sanitized.company : existing.company;
  const nextSource = sanitized.source !== undefined ? sanitized.source : existing.source;
  // Tenant-configurable statuses (UI/UX plan decision 6): stored as the status key; an unknown
  // status is refused (LEAD_STATUS_UNKNOWN) unless it is the lead's current one.
  const nextStatus = sanitized.status !== undefined
    ? await resolveLeadStatusForWrite(user.tenantId, sanitized.status, existing.status)
    : existing.status;
  const nextOwnerId = sanitized.ownerId !== undefined ? sanitized.ownerId : existing.ownerId;

  // WP08 (F13): atomic core -- the update, its mandatory audit row, and durable WebhookOutbox
  // rows commit together or none do (same reasoning as createLeadForTenant's atomic core above).
  const rawUpdated = await withTransaction(user as any, async (client) => {
    const lead = await queryOne<any>(
      `update "Lead"
       set name = $1, email = $2, phone = $3, company = $4, source = $5, status = $6, "ownerId" = $7, "updatedAt" = $8
       where ${user.tenantId ? '"tenantId" = $9' : '"tenantId" is null'} and id = $${user.tenantId ? 10 : 9}
       returning ${LEAD_COLUMNS}`,
      [
        nextName,
        nextEmail || null,
        nextPhone || null,
        nextCompany || null,
        nextSource || null,
        nextStatus || existing.status,
        nextOwnerId || null,
        new Date().toISOString(),
        ...(user.tenantId ? [user.tenantId, id] : [id]),
      ],
      client,
    );
    if (!lead) return null;
    // Raw (unmasked) shape for the audit trail and internal system consumers (automations,
    // webhooks, marketplace events, NBA refresh) -- masking is a policy for what the ACTING
    // user's own API response shows, not for what the record actually contains internally.
    const updated = { ...lead, assignedUserId: lead.ownerId ?? null, predictiveScore: existing.predictiveScore, pendingNbaCount: existing.pendingNbaCount };
    const diff = fieldDiff(existing, updated);
    await createAuditLog(user, "UPDATE", "LEAD", updated.id, existing, updated, Object.keys(diff).length ? diff : null, client);
    await enqueueWebhookEvent(user.tenantId, "LEAD_UPDATED", updated, client);
    return updated;
  });
  if (!rawUpdated) return null;
  await runAutomationsForEvent(user, "LEAD_UPDATED", "LEAD", rawUpdated.id, rawUpdated).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, "LEAD_UPDATED", rawUpdated).catch(() => undefined);
  await refreshNextBestActionsForRecord(user, "LEAD", rawUpdated.id);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  return maskFieldsForUser(user, "leads", rawUpdated);
}

// "Select all N matching" (UI/UX plan B8): the ids of every record the list would show for these
// filters, under the same record access, so a bulk action changes exactly what the count said.
// At most `cap` ids; `truncated` says more match, and callers refuse rather than act on part.
export async function listLeadIdsForTenant(user: TenantUser, filters: LeadFilterInput[] | LeadFilterInput | null, cap = 5000, search?: string | null) {
  const resolvedFilters = await substituteUserTokens(normalizeLeadFilters(filters), user);
  const where = applyLeadSearch(buildLeadWhere(user, resolvedFilters), search);
  const rows = await query<{ id: string }>(
    `select id from "Lead" ${where.sql} order by "createdAt" desc limit $${where.values.length + 1}`,
    where.values.concat([cap + 1]),
  );
  return { ids: rows.slice(0, cap).map((row) => row.id), truncated: rows.length > cap, cap };
}

export async function deleteLeadsForTenant(user: TenantUser, ids: string[]) {
  if (!ids.length) return 0;
  const where = buildLeadWhere(user, null);
  const values = where.values.concat([ids]);
  const deleted = await execute(`delete from "Lead" ${where.sql} and id = any($${values.length}::text[])`, values);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  return deleted;
}

// Which of these lead ids this user may see: the same conditions as the leads list (workspace,
// not merged away, record scope). Used where ids arrive from elsewhere, e.g. list membership.
// Campaign and journey audiences (§8 #24: they were cut off at 500, 1,000 or 5,000 leads without
// saying so). Every matching lead, in id order, a batch at a time: keyset paging, so a long send
// neither skips nor repeats leads. Same record access and filters as the leads list;
// `staticListId` limits it to that list's members.
export type LeadAudienceQuery = { filters?: LeadFilterInput[] | null; strictFilters?: boolean; staticListId?: string | null };

async function leadAudienceWhere(user: TenantUser, input: LeadAudienceQuery) {
  const resolvedFilters = await substituteUserTokens(normalizeLeadFilters(input.filters ?? null), user);
  if (input.strictFilters) assertFilterGroupsSupported(resolvedFilters, LEAD_FILTER_COLUMNS);
  const where = buildLeadWhere(user, resolvedFilters);
  if (!input.staticListId) return where;
  const values = [...where.values, String(input.staticListId)];
  const listParam = values.length;
  const tenantSql = user.tenantId ? `m."tenantId" = "Lead"."tenantId"` : `m."tenantId" is null`;
  const member = `exists (select 1 from "LeadListMember" m where m."listId"::text = $${listParam} and ${tenantSql} and m."leadId" = "Lead".id)`;
  return { sql: where.sql ? `${where.sql} and ${member}` : `where ${member}`, values };
}

export async function countLeadAudienceForTenant(user: TenantUser, input: LeadAudienceQuery) {
  const where = await leadAudienceWhere(user, input);
  const row = await queryOne<{ count: number }>(`select count(*)::int as count from "Lead" ${where.sql}`, where.values);
  return row?.count ?? 0;
}

export async function listLeadAudiencePageForTenant(user: TenantUser, input: LeadAudienceQuery, afterId: string | null, limit: number) {
  const where = await leadAudienceWhere(user, input);
  const values = [...where.values];
  let sql = where.sql;
  if (afterId) {
    values.push(String(afterId));
    sql = `${sql ? `${sql} and` : "where"} id > $${values.length}`;
  }
  values.push(Math.min(1000, Math.max(1, Math.trunc(limit) || 200)));
  return query<any>(`select ${LEAD_COLUMNS} from "Lead" ${sql} order by id limit $${values.length}`, values);
}

export async function filterVisibleLeadIds(user: TenantUser, leadIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(leadIds.map(String))];
  if (!unique.length || !user.tenantId) return new Set();
  const clauses = ['"tenantId" = $1', '"mergedIntoId" is null', 'id::text = any($2::text[])'];
  const values: unknown[] = [user.tenantId, unique];
  applyRecordScopeClause(clauses, values, user, "LEAD", 1);
  const rows = await query<{ id: string }>(`select id from "Lead" where ${clauses.join(" and ")}`, values);
  return new Set(rows.map((row) => String(row.id)));
}
