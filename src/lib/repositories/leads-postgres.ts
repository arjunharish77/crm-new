import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { distributeRecord } from "@/lib/server/distribution-engine";
import { refreshNextBestActionsForRecord } from "@/lib/server/next-best-action";
import { enqueueWebhookEvent } from "@/lib/server/webhook-outbox";
import { enqueueAppEvent } from "@/lib/server/marketplace-events";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { invalidateReportRollupsForTenant } from "@/lib/server/report-rollups";
import { applyFilterCondition, buildGroupedFilterClause, type FilterValueKind } from "@/lib/query-filters";
import { substituteUserTokens } from "@/lib/server/user-token-filters";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  isImpersonating?: boolean;
  impersonatedBy?: string | null;
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

const LEAD_COLUMNS = 'id, name, email, phone, company, source, status, score, tags, "createdBy", "createdAt", "updatedAt", "ownerId"';
const LEAD_FILTER_COLUMNS = new Map<string, { column: string; kind: FilterValueKind }>([
  ["id", { column: "id", kind: "text" }],
  ["name", { column: "name", kind: "text" }],
  ["email", { column: "email", kind: "text" }],
  ["phone", { column: "phone", kind: "text" }],
  ["company", { column: "company", kind: "text" }],
  ["source", { column: "source", kind: "text" }],
  ["status", { column: "status", kind: "select" }],
  ["score", { column: "score", kind: "number" }],
  ["createdBy", { column: "createdBy", kind: "user" }],
  ["ownerId", { column: "ownerId", kind: "user" }],
  ["createdAt", { column: "createdAt", kind: "date" }],
  ["updatedAt", { column: "updatedAt", kind: "date" }],
  ["tags", { column: "tags", kind: "tags" }],
]);

const PREDICTIVE_SCORE_FILTER_FIELDS = new Set([
  "predictiveScoreBand",
  "predictiveConfidence",
  "predictiveConversionProbability",
  "predictiveWinProbability",
  "predictiveStallRisk",
  "predictiveExpectedResponseLikelihood",
  "predictiveDuplicateRisk",
  "predictiveStaleRisk",
]);

const SCORE_FIELD_TO_COLUMN = new Map<string, { column: string; kind: FilterValueKind }>([
  ["predictiveScoreBand", { column: "scoreBand", kind: "select" }],
  ["predictiveConfidence", { column: "confidence", kind: "number" }],
  ["predictiveConversionProbability", { column: "conversionProbability", kind: "number" }],
  ["predictiveWinProbability", { column: "winProbability", kind: "number" }],
  ["predictiveStallRisk", { column: "stallRisk", kind: "number" }],
  ["predictiveExpectedResponseLikelihood", { column: "expectedResponseLikelihood", kind: "number" }],
  ["predictiveDuplicateRisk", { column: "duplicateRisk", kind: "number" }],
  ["predictiveStaleRisk", { column: "staleRisk", kind: "number" }],
]);

function isOwnerScoped(user: TenantUser) {
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  return permissions?.isPartnerRole || permissions?.recordAccess === "OWN";
}

function normalizeLeadFilters(filters: LeadFilterInput[] | null) {
  if (!Array.isArray(filters)) return [];
  return filters;
}

function splitPredictiveScoreFilters(filters: LeadFilterInput[] | null) {
  const recordFilters: LeadFilterInput[] = [];
  const scoreFilters: LeadFilterCondition[] = [];

  for (const group of normalizeLeadFilters(filters)) {
    const conditions: LeadFilterCondition[] =
      "conditions" in group && Array.isArray(group.conditions)
        ? group.conditions
        : [group as LeadFilterCondition];
    const recordConditions = conditions.filter((condition) => !condition?.field || !PREDICTIVE_SCORE_FILTER_FIELDS.has(condition.field));
    scoreFilters.push(...conditions.filter((condition) => condition?.field && PREDICTIVE_SCORE_FILTER_FIELDS.has(condition.field)));
    if (recordConditions.length === conditions.length) recordFilters.push(group);
    else if (recordConditions.length > 0) recordFilters.push({ ...(group as any), conditions: recordConditions });
  }

  return { recordFilters, scoreFilters };
}

function addCondition(
  clauses: string[],
  values: unknown[],
  field: string,
  operator: string | undefined,
  value: unknown,
  columnMap: Map<string, { column: string; kind: FilterValueKind }>,
) {
  const entry = columnMap.get(field);
  if (!entry) return;
  applyFilterCondition(clauses, values, entry.column, operator, value, entry.kind);
}

function buildLeadWhere(user: TenantUser, filters: LeadFilterInput[] | null, scoreMatchedIds?: string[] | null) {
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

  if (isOwnerScoped(user)) {
    values.push(user.id);
    const userIdParam = values.length;
    if (tenantIdParam) {
      // A record explicitly shared with this user (directly, or via their team) is visible
      // even to an otherwise OWN-scoped user -- RecordShare is the one exception to "only my
      // own records" enforced here at the row-selection level, not layered on afterward.
      clauses.push(
        `("ownerId" = $${userIdParam} or id = any(
          select rs."recordId" from "RecordShare" rs
          where rs."tenantId" = $${tenantIdParam} and rs."recordType" = 'LEAD'
            and ($${userIdParam} = any(rs."sharedUserIds")
                 or exists (select 1 from "User" u where u.id = $${userIdParam} and u."teamId"::text = any(rs."sharedTeamIds")))
        ))`
      );
    } else {
      clauses.push(`"ownerId" = $${userIdParam}`);
    }
  }

  if (scoreMatchedIds) {
    if (scoreMatchedIds.length === 0) clauses.push("false");
    else {
      values.push(scoreMatchedIds);
      clauses.push(`id = any($${values.length}::text[])`);
    }
  }

  buildGroupedFilterClause(clauses, values, normalizeLeadFilters(filters), LEAD_FILTER_COLUMNS);

  return { sql: clauses.length ? `where ${clauses.join(" and ")}` : "", values };
}

async function resolvePredictiveScoreRecordIds(
  tenantId: string | null,
  filters: LeadFilterCondition[],
) {
  if (!filters.length) return null;
  const clauses = ['"recordType" = $1'];
  const values: unknown[] = ["LEAD"];
  if (tenantId) {
    values.push(tenantId);
    clauses.push(`"tenantId" = $${values.length}`);
  } else {
    clauses.push('"tenantId" is null');
  }
  for (const filter of filters) {
    if (!filter.field) continue;
    addCondition(clauses, values, filter.field, filter.operator, filter.value, SCORE_FIELD_TO_COLUMN);
  }
  const rows = await query<{ recordId: string }>(
    `select "recordId" from "RecordScore" where ${clauses.join(" and ")} limit 5000`,
    values,
  );
  return Array.from(new Set(rows.map((row) => row.recordId).filter(Boolean)));
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

function formatLead(lead: any, predictiveScore: any = null, pendingNbaCount = 0) {
  return {
    ...lead,
    assignedUserId: lead.ownerId ?? null,
    predictiveScore,
    pendingNbaCount,
  };
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
) {
  // "Complete audit trail" for impersonation (gap checklist: "impersonation governance") --
  // this is the single choke point nearly every write in this app already calls to log an
  // audit entry, so tagging it here covers all of them for free rather than needing every
  // individual call site to remember to pass impersonation context through. Without this, an
  // action taken by a platform admin impersonating a user was audit-logged identically to one
  // the real user took themselves -- indistinguishable after the fact. `user` here is
  // typically the exact object requireCurrentUser/getCurrentUser returned, which already
  // carries isImpersonating/impersonatedBy when applicable.
  const metadata = user.isImpersonating && user.impersonatedBy ? { impersonatedBy: user.impersonatedBy } : null;
  const id = randomUUID();
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, user.tenantId, user.id, action, entityType, entityId, before, after, diff, metadata, new Date().toISOString()],
  );
  // "Anomaly flags" (gap checklist: "audit review workflows") -- real but deliberately narrow:
  // a rate-based check reusing the existing Redis-backed rate limiter (more than N of the same
  // action by one user within a window gets flagged for a reviewer), not ML/statistical
  // modeling. Runs at this one choke point so every one of the ~90 call sites gets it for free.
  await flagAuditLogIfAnomalous(id, user.id, action).catch(() => undefined);
}

const ANOMALY_ACTION_LIMIT = 20;
const ANOMALY_WINDOW_SECONDS = 10 * 60;

async function flagAuditLogIfAnomalous(auditLogId: string, userId: string, action: string) {
  const result = await checkRateLimit({
    key: `audit-anomaly:${userId}:${action}`,
    limit: ANOMALY_ACTION_LIMIT,
    windowSeconds: ANOMALY_WINDOW_SECONDS,
  });
  if (!result.allowed) {
    await execute(`update "AuditLog" set flagged = true, "flagReason" = $1 where id = $2`, [
      `More than ${ANOMALY_ACTION_LIMIT} "${action}" actions by this user within ${ANOMALY_WINDOW_SECONDS / 60} minutes`,
      auditLogId,
    ]);
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

export async function listLeadsForTenant(
  user: TenantUser,
  page: number,
  limit: number,
  filters: LeadFilterInput[] | null = null,
) {
  const currentPage = Math.max(1, Number.isFinite(page) ? page : 1);
  const currentLimit = Math.min(200, Math.max(1, Number.isFinite(limit) ? limit : 10));
  const offset = (currentPage - 1) * currentLimit;
  const { recordFilters, scoreFilters } = splitPredictiveScoreFilters(filters);
  const scoreMatchedIds = await resolvePredictiveScoreRecordIds(user.tenantId, scoreFilters);
  if (scoreMatchedIds && scoreMatchedIds.length === 0) {
    return { data: [], meta: { total: 0, page: currentPage, last_page: 1, limit: currentLimit } };
  }
  // "Current user/team tokens" (gap checklist's universal advanced filter drawer sub-item) --
  // "@myteam" needs a DB lookup, so it's resolved here, once, before the synchronous
  // buildLeadWhere runs, rather than making buildLeadWhere itself async (which would ripple
  // into its several other no-filter call sites below).
  const resolvedFilters = await substituteUserTokens(recordFilters, user);
  const where = buildLeadWhere(user, resolvedFilters, scoreMatchedIds);

  const [countRow, data] = await Promise.all([
    queryOne<{ count: number }>(`select count(*)::int as count from "Lead" ${where.sql}`, where.values),
    query<any>(
      `select ${LEAD_COLUMNS} from "Lead" ${where.sql} order by "createdAt" desc limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      where.values.concat([currentLimit, offset]),
    ),
  ]);
  const [scoreMap, nbaCountMap] = await Promise.all([
    getPredictiveScoreMap(user.tenantId, data.map((lead) => lead.id)),
    getPendingNbaCountMap(user.tenantId, data.map((lead) => lead.id)),
  ]);

  return {
    data: data.map((lead) => formatLead(lead, scoreMap.get(lead.id) ?? null, nbaCountMap.get(lead.id) ?? 0)),
    meta: {
      total: countRow?.count ?? 0,
      page: currentPage,
      last_page: Math.max(1, Math.ceil((countRow?.count ?? 0) / currentLimit)),
      limit: currentLimit,
    },
  };
}

// Gap checklist Module 17, item 25 (embedded analytics surfaces: "view-level count chips").
// A cheap, dedicated aggregate query -- reuses the exact same tenant/ownership scoping
// (`buildLeadWhere`) every other Lead read path uses, so the counts a viewer sees always match
// what they're actually allowed to see, not a raw tenant-wide count.
export async function getLeadStatusCountsForTenant(user: TenantUser) {
  const where = buildLeadWhere(user, null, null);
  return query<{ status: string; count: number }>(`select status, count(*)::int as count from "Lead" ${where.sql} group by status`, where.values);
}

export async function createLeadForTenant(user: TenantUser, payload: Record<string, unknown>) {
  const objectId = await getObjectId(user);
  const now = new Date().toISOString();
  const id = randomUUID();
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
      payload.status || "NEW",
      user.tenantId,
      user.id,
      objectId,
      [],
      now,
    ],
  );
  if (!lead) throw new Error("LEAD_INSERT_FAILED");
  const formatted = formatLead(lead);
  await createAuditLog(user, "CREATE", "LEAD", formatted.id, null, formatted, null);
  const distribution = await distributeRecord(user, "LEAD", formatted.id, formatted).catch(() => null);
  const formattedWithOwner = distribution?.assignedUserId ? { ...formatted, ownerId: distribution.assignedUserId } : formatted;
  await runAutomationsForEvent(user, "LEAD_CREATED", "LEAD", formattedWithOwner.id, formattedWithOwner).catch(() => undefined);
  await enqueueWebhookEvent(user.tenantId, "LEAD_CREATED", formattedWithOwner).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, "LEAD_CREATED", formattedWithOwner).catch(() => undefined);
  await refreshNextBestActionsForRecord(user, "LEAD", formattedWithOwner.id);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  return formattedWithOwner;
}

export async function getLeadForTenant(user: TenantUser, id: string) {
  const where = buildLeadWhere(user, null);
  const values = where.values.concat([id]);
  const lead = await queryOne<any>(`select ${LEAD_COLUMNS} from "Lead" ${where.sql} and id = $${values.length} limit 1`, values);
  if (!lead) return null;
  const scoreMap = await getPredictiveScoreMap(user.tenantId, [lead.id]);
  return formatLead(lead, scoreMap.get(lead.id) ?? null);
}

export async function updateLeadForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  const existing = await getLeadForTenant(user, id);
  if (!existing) return null;
  const nextName = payload.name !== undefined ? payload.name : existing.name;
  const nextEmail = payload.email !== undefined ? payload.email : existing.email;
  const nextPhone = payload.phone !== undefined ? payload.phone : existing.phone;
  const nextCompany = payload.company !== undefined ? payload.company : existing.company;
  const nextSource = payload.source !== undefined ? payload.source : existing.source;
  const nextStatus = payload.status !== undefined ? payload.status : existing.status;
  const nextOwnerId = payload.ownerId !== undefined ? payload.ownerId : existing.ownerId;

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
  );
  if (!lead) return null;
  const formatted = formatLead(lead);
  const diff = fieldDiff(existing, formatted);
  await createAuditLog(user, "UPDATE", "LEAD", formatted.id, existing, formatted, Object.keys(diff).length ? diff : null);
  await runAutomationsForEvent(user, "LEAD_UPDATED", "LEAD", formatted.id, formatted).catch(() => undefined);
  await enqueueWebhookEvent(user.tenantId, "LEAD_UPDATED", formatted).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, "LEAD_UPDATED", formatted).catch(() => undefined);
  await refreshNextBestActionsForRecord(user, "LEAD", formatted.id);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  return formatted;
}

export async function deleteLeadsForTenant(user: TenantUser, ids: string[]) {
  if (!ids.length) return 0;
  const where = buildLeadWhere(user, null);
  const values = where.values.concat([ids]);
  const deleted = await execute(`delete from "Lead" ${where.sql} and id = any($${values.length}::text[])`, values);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  return deleted;
}
