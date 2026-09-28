import type { CreateUnitOfWork } from "./create-unit-of-work";
import type { TransactionClient } from "@/lib/db/transaction";
import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { listLeadsForTenant, buildLeadWhere } from "@/lib/repositories/leads-postgres";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { distributeRecord } from "@/lib/server/distribution-engine";
import { refreshNextBestActionsForRecord } from "@/lib/server/next-best-action";
import { recordAttributionTouch } from "@/lib/server/marketing-journeys";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { enqueueWebhookEvent } from "@/lib/server/webhook-outbox";
import { enqueueAppEvent } from "@/lib/server/marketplace-events";
import { invalidateReportRollupsForTenant } from "@/lib/server/report-rollups";
import { buildGroupedFilterClause, type FilterColumnEntry } from "@/lib/query-filters";
import { substituteUserTokens } from "@/lib/server/user-token-filters";
import { maskFieldsForUser, sanitizeWritePayload } from "@/lib/server/field-permissions";
import { applyRecordScopeClause } from "@/lib/server/record-scope";

type TenantUser = {
  apiKeyId?: string;
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  permissionTemplates?: any[] | null;
  teamId?: string | null;
  isPlatformAdmin?: boolean;
  // WP04 fix: see record-scope.ts's ScopedUser -- lets a marketplace-app actor's OWN/TEAM check
  // run against a designated internal user without changing what `id` itself means for audit
  // attribution.
  recordScopeActorId?: string | null;
};

type FilterCondition = {
  field?: string;
  operator?: string;
  value?: unknown;
};

type FilterInput =
  | FilterCondition
  | {
      logic?: "AND" | "OR";
      conditions?: FilterCondition[];
    };

const OPPORTUNITY_COLUMNS =
  '"duplicateWarnings", id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, amount, "expectedCloseDate", priority, tags, "ownerId", "createdAt", "updatedAt"';

// WP09 (F12): predictive-score fields compile as an inline `id in (select ...)` subquery against
// "RecordScore" (see the `subquery` descriptor on FilterColumnEntry in query-filters.ts) -- same
// fix and same reasoning as leads-postgres.ts's identical change.
const OPPORTUNITY_RECORD_SCORE_SUBQUERY = { table: '"RecordScore"', matchColumn: '"recordId"', recordType: "OPPORTUNITY" };

const OPPORTUNITY_FILTER_COLUMNS = new Map<string, FilterColumnEntry>([
  ["id", { column: "id", kind: "text" }],
  ["leadId", { column: "leadId", kind: "text" }],
  ["opportunityTypeId", { column: "opportunityTypeId", kind: "select" }],
  ["stageId", { column: "stageId", kind: "select" }],
  ["title", { column: "title", kind: "text" }],
  ["amount", { column: "amount", kind: "number" }],
  ["expectedCloseDate", { column: "expectedCloseDate", kind: "date" }],
  ["priority", { column: "priority", kind: "select" }],
  ["ownerId", { column: "ownerId", kind: "user" }],
  ["createdAt", { column: "createdAt", kind: "date" }],
  ["updatedAt", { column: "updatedAt", kind: "date" }],
  ["tags", { column: "tags", kind: "tags" }],
  ["predictiveScoreBand", { column: "scoreBand", kind: "select", subquery: OPPORTUNITY_RECORD_SCORE_SUBQUERY }],
  ["predictiveConfidence", { column: "confidence", kind: "number", subquery: OPPORTUNITY_RECORD_SCORE_SUBQUERY }],
  ["predictiveConversionProbability", { column: "conversionProbability", kind: "number", subquery: OPPORTUNITY_RECORD_SCORE_SUBQUERY }],
  ["predictiveWinProbability", { column: "winProbability", kind: "number", subquery: OPPORTUNITY_RECORD_SCORE_SUBQUERY }],
  ["predictiveStallRisk", { column: "stallRisk", kind: "number", subquery: OPPORTUNITY_RECORD_SCORE_SUBQUERY }],
  ["predictiveExpectedCloseRisk", { column: "expectedCloseRisk", kind: "number", subquery: OPPORTUNITY_RECORD_SCORE_SUBQUERY }],
]);

function transactionContext(user: TenantUser) {
  return { id: user.id, tenantId: user.tenantId };
}

function buildWhere(user: TenantUser, filters: FilterInput[] | null, opportunityTypeId?: string | null) {
  const clauses: string[] = [];
  const values: unknown[] = [];

  let tenantIdParam: number | null = null;
  if (user.tenantId) {
    values.push(user.tenantId);
    tenantIdParam = values.length;
    clauses.push(`"tenantId" = $${tenantIdParam}`);
  } else {
    clauses.push('"tenantId" is null');
  }
  // Same soft-merge exclusion as buildLeadWhere in leads-postgres.ts -- a merged-away
  // Opportunity row survives (mergeLeadsForTenant/dedupe-postgres.ts) rather than being
  // deleted, so it must be filtered out of every normal read path explicitly.
  clauses.push('"mergedIntoId" is null');
  // F03 fix (WP04): OWN/TEAM/ALL, not a binary OWN-vs-everything-else check -- see
  // record-scope.ts (shared with leads-postgres.ts's identical fix) for why "TEAM Records"
  // previously fell through to unrestricted tenant-wide visibility.
  applyRecordScopeClause(clauses, values, user, "OPPORTUNITY", tenantIdParam);
  if (opportunityTypeId) {
    values.push(opportunityTypeId);
    clauses.push(`"opportunityTypeId" = $${values.length}`);
  }

  buildGroupedFilterClause(clauses, values, Array.isArray(filters) ? filters : [], OPPORTUNITY_FILTER_COLUMNS, undefined, user.tenantId);

  return { sql: clauses.length ? `where ${clauses.join(" and ")}` : "", values };
}

function shiftSqlPlaceholders(sql: string, offset: number) {
  if (!offset) return sql;
  return sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + offset}`);
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
     where "recordType" = 'OPPORTUNITY'
       and "recordId" = any($1::text[])
       and ${tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
    tenantId ? [recordIds, tenantId] : [recordIds],
  );
  return new Map(rows.map((score) => [score.recordId, score]));
}

async function getPendingNbaCountMap(tenantId: string | null, recordIds: string[]) {
  if (!recordIds.length) return new Map<string, number>();
  const rows = await query<{ recordId: string; count: number }>(
    `select "recordId", count(*)::int as count
     from "NextBestActionRecommendation"
     where "recordType" = 'OPPORTUNITY'
       and "recordId" = any($1::text[])
       and (status = 'PENDING' or (status = 'SNOOZED' and ("snoozedUntil" is null or "snoozedUntil" <= now())))
       and ${tenantId ? '"tenantId" = $2' : '"tenantId" is null'}
     group by "recordId"`,
    tenantId ? [recordIds, tenantId] : [recordIds],
  );
  return new Map(rows.map((row) => [row.recordId, row.count]));
}

async function getObjectId(user: TenantUser) {
  const existing = await queryOne<{ id: string }>(
    `select id from "ObjectDefinition" where name = 'opportunity' and ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'} limit 1`,
    user.tenantId ? [user.tenantId] : [],
  );
  if (existing?.id) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  await queryOne(
    'insert into "ObjectDefinition" (id, "tenantId", name, label, "isCustom", "createdAt", "updatedAt") values ($1, $2, $3, $4, false, $5, $5) returning id',
    [id, user.tenantId, "opportunity", "Opportunity", now],
  );
  return id;
}

export async function listOpportunityTypesForTenant(user: TenantUser) {
  const types = await query<any>(
    `select id, "tenantId", name, description, icon, color, "order", "isActive", "programId"
     from "OpportunityType"
     where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
     order by "order" asc`,
    user.tenantId ? [user.tenantId] : [],
  );
  const stages = await query<any>(
    `select id, "tenantId", "opportunityTypeId", name, "order", probability, color, "isClosed", "isWon"
     from "StageDefinition"
     where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
     order by "order" asc`,
    user.tenantId ? [user.tenantId] : [],
  );
  return types.map((type) => ({
    ...type,
    stages: stages.filter((stage) => stage.opportunityTypeId === type.id).map((stage) => ({ ...stage, label: stage.name })),
  }));
}

async function decorateOpportunities(user: TenantUser, opportunities: any[]) {
  const [types, leads, scoreMap, nbaCountMap] = await Promise.all([
    listOpportunityTypesForTenant(user),
    listLeadsForTenant(user, 1, 500),
    getPredictiveScoreMap(user.tenantId, opportunities.map((opportunity) => opportunity.id)),
    getPendingNbaCountMap(user.tenantId, opportunities.map((opportunity) => opportunity.id)),
  ]);
  const stageMap = new Map(types.flatMap((type: any) => (type.stages ?? []).map((stage: any) => [stage.id, stage])));
  const typeMap = new Map(types.map((type: any) => [type.id, type]));
  const leadMap = new Map(leads.data.map((lead: any) => [lead.id, lead]));
  return opportunities.map((opportunity) => ({
    ...opportunity,
    tags: opportunity.tags ?? [],
    lead: leadMap.get(opportunity.leadId) ?? null,
    opportunityType: typeMap.get(opportunity.opportunityTypeId),
    stage: stageMap.get(opportunity.stageId),
    predictiveScore: scoreMap.get(opportunity.id) ?? null,
    pendingNbaCount: nbaCountMap.get(opportunity.id) ?? 0,
  }));
}

export async function listOpportunitiesForTenantByType(
  user: TenantUser,
  limit: number,
  opportunityTypeId: string | null,
  filters: FilterInput[] | null = null,
  page = 1,
) {
  // WP09 (F11): raised from 500 to 1000 -- inbuilt-reports.ts calls listOpportunitiesForTenant
  // with limit=1000 in several reports, expecting up to that many rows for in-memory aggregation;
  // the old 500 cap silently truncated those reports to half of what they asked for. 1000 is not
  // a durable fix at real scale either (see 25_AUDIT_REMEDIATION_PLAN.md WP09 for why this is
  // documented as a follow-up, not closed), but it does fix the specific request/response
  // mismatch this cap previously created.
  const currentLimit = Math.min(1000, Math.max(1, Number.isFinite(limit) ? limit : 100));
  const currentPage = Math.max(1, Number.isFinite(page) ? page : 1);
  const offset = (currentPage - 1) * currentLimit;

  // "Current user/team tokens" -- see the matching comment in leads-postgres.ts's own
  // listLeadsForTenant for why this resolves "@myteam" here rather than making buildWhere async.
  const resolvedFilters = await substituteUserTokens(Array.isArray(filters) ? filters : [], user);
  const where = buildWhere(user, resolvedFilters, opportunityTypeId);
  const [countRow, opportunities] = await Promise.all([
    queryOne<{ count: number }>(`select count(*)::int as count from "Opportunity" ${where.sql}`, where.values),
    query<any>(
      `select ${OPPORTUNITY_COLUMNS} from "Opportunity" ${where.sql} order by "createdAt" desc limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      where.values.concat([currentLimit, offset]),
    ),
  ]);
  const total = countRow?.count ?? 0;
  // F03 fix (WP04): mask fields this user's role/permission-template marks "hidden" for the
  // opportunity's own type -- see the equivalent Lead fix in leads-postgres.ts for the full
  // rationale (same field-permissions.ts shared module).
  const decorated = await decorateOpportunities(user, opportunities);
  return {
    data: decorated.map((opportunity) => maskFieldsForUser(user, "opportunities", opportunity, opportunity.opportunityTypeId)),
    meta: {
      total,
      page: currentPage,
      last_page: Math.max(1, Math.ceil(total / currentLimit)),
      limit: currentLimit,
      // WP09 (F11): see the identical field on listLeadsForTenant's meta in leads-postgres.ts.
      isComplete: currentPage === 1 && total <= currentLimit,
    },
  };
}

export async function listOpportunitiesForTenant(user: TenantUser, limit: number) {
  return listOpportunitiesForTenantByType(user, limit, null);
}

// Gap checklist Module 17, item 25 (embedded analytics surfaces: "view-level count chips"),
// mirroring `getLeadStatusCountsForTenant` in leads-postgres.ts. Deliberately NOT
// `getOpportunityStatsForTenant` (which pulls up to 500 full Opportunity rows just to count
// them) -- a cheap `group by "stageId"` count query plus a small, separate stage-name lookup,
// same tenant/ownership scoping (`buildWhere`) every other Opportunity read path uses.
// Bug fix: this (and marketing-cost.ts/marketing-journeys.ts's identical joins) previously
// queried a table named "OpportunityStage", which has never existed in this schema (confirmed
// via `\d` against real Postgres) -- the real table is "StageDefinition". Every one of these
// three call sites would 500 in production the moment it actually ran; masked in tests only
// because the DB layer is fully mocked there. Found incidentally while working on a nearby
// aggregation fix (F11), fixed here since it's a trivial, safe rename with matching columns.
export async function getOpportunityStageCountsForTenant(user: TenantUser) {
  const where = buildWhere(user, null, null);
  const counts = await query<{ stageId: string | null; count: number }>(
    `select "stageId", count(*)::int as count from "Opportunity" ${where.sql} group by "stageId"`,
    where.values,
  );
  const stageIds = counts.map((row) => row.stageId).filter((id): id is string => !!id);
  const stages = stageIds.length
    ? await query<{ id: string; name: string; order: number }>(`select id, name, "order" from "StageDefinition" where id = any($1::text[])`, [
        stageIds,
      ])
    : [];
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  return counts
    .map((row) => {
      const stage = row.stageId ? stageById.get(row.stageId) : undefined;
      return {
        stageId: row.stageId,
        stageName: stage?.name ?? (row.stageId ? "Unknown" : "Unassigned"),
        order: stage?.order ?? Number.MAX_SAFE_INTEGER,
        count: row.count,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...rest }) => rest);
}

// WP09 (F11): real SQL aggregation for `getFunnelByStageReportForTenant` in inbuilt-reports.ts.
// The report previously fetched up to 1000 opportunities tenant-wide (most-recent-first) and
// grouped/summed them in JS -- silently wrong for any tenant with more than 1000 matching
// opportunities (the funnel's per-stage counts/values would only reflect the newest 1000, not the
// true full pipeline). This aggregates in Postgres with a genuine `group by "stageId"` over the
// FULL matching set (same `buildWhere` tenant/scope/soft-merge filtering every other Opportunity
// read path uses), so there is no row cap on the underlying counts/sums at all. The CTE selects
// only the columns needed (id/amount/stageId) before joining "StageDefinition" for stage
// metadata -- joining the raw, still-`buildWhere`-filtered "Opportunity" rows to "StageDefinition"
// directly would make every unqualified column both tables share (tenantId, id, createdAt, ...)
// ambiguous, since `buildWhere`'s own SQL text references those columns unqualified.
export async function getFunnelByStageAggregateForTenant(user: TenantUser) {
  const where = buildWhere(user, null, null);
  return query<{ stageId: string | null; stage: string; count: number; value: number; isWon: boolean; isClosed: boolean; order: number }>(
    `with scoped_opportunities as (
       select id, amount, "stageId" from "Opportunity" ${where.sql}
     )
     select o."stageId" as "stageId",
            coalesce(sd.name, 'Unassigned') as stage,
            count(*)::int as count,
            coalesce(sum(o.amount), 0)::float8 as value,
            coalesce(sd."isWon", false) as "isWon",
            coalesce(sd."isClosed", false) as "isClosed",
            coalesce(sd."order", 2147483647) as "order"
     from scoped_opportunities o
     left join "StageDefinition" sd on sd.id = o."stageId"
     group by o."stageId", sd.name, sd."isWon", sd."isClosed", sd."order"`,
    where.values,
  );
}

// WP09 (F11): real SQL aggregation for `getPeriodComparisonReportForTenant` in inbuilt-reports.ts
// -- the Opportunity-side half of the fix (see `getLeadPeriodCountsForTenant` in
// leads-postgres.ts for the identical Lead-side reasoning). One query, two ranges, via `filter
// (where ...)` on each aggregate rather than fetching rows and reducing in JS -- no row cap at
// all, so a tenant whose comparison period's real opportunities fall outside whatever a 1000-row
// tenant-wide cap would have captured is no longer silently under-counted.
export async function getOpportunityPeriodMetricsForTenant(
  user: TenantUser,
  currentRange: { start: Date; end: Date },
  previousRange: { start: Date; end: Date },
) {
  const where = buildWhere(user, null, null);
  const base = where.values.length;
  const values = where.values.concat([
    currentRange.start.toISOString(),
    currentRange.end.toISOString(),
    previousRange.start.toISOString(),
    previousRange.end.toISOString(),
  ]);
  const row = await queryOne<{
    currentCount: number;
    previousCount: number;
    currentWonCount: number;
    previousWonCount: number;
    currentWonValue: number;
    previousWonValue: number;
  }>(
    `with scoped_opportunities as (
       select id, "createdAt", amount, "stageId" from "Opportunity" ${where.sql}
     )
     select
       count(*) filter (where so."createdAt" >= $${base + 1}::timestamptz and so."createdAt" < $${base + 2}::timestamptz)::int as "currentCount",
       count(*) filter (where so."createdAt" >= $${base + 3}::timestamptz and so."createdAt" < $${base + 4}::timestamptz)::int as "previousCount",
       count(*) filter (where so."createdAt" >= $${base + 1}::timestamptz and so."createdAt" < $${base + 2}::timestamptz and coalesce(sd."isWon", false))::int as "currentWonCount",
       count(*) filter (where so."createdAt" >= $${base + 3}::timestamptz and so."createdAt" < $${base + 4}::timestamptz and coalesce(sd."isWon", false))::int as "previousWonCount",
       coalesce(sum(so.amount) filter (where so."createdAt" >= $${base + 1}::timestamptz and so."createdAt" < $${base + 2}::timestamptz and coalesce(sd."isWon", false)), 0)::float8 as "currentWonValue",
       coalesce(sum(so.amount) filter (where so."createdAt" >= $${base + 3}::timestamptz and so."createdAt" < $${base + 4}::timestamptz and coalesce(sd."isWon", false)), 0)::float8 as "previousWonValue"
     from scoped_opportunities so
     left join "StageDefinition" sd on sd.id = so."stageId"`,
    values,
  );
  return {
    current: { count: row?.currentCount ?? 0, wonCount: row?.currentWonCount ?? 0, wonValue: Number(row?.currentWonValue ?? 0) },
    previous: { count: row?.previousCount ?? 0, wonCount: row?.previousWonCount ?? 0, wonValue: Number(row?.previousWonValue ?? 0) },
  };
}

// WP09 (F11): real SQL aggregation for `getLeadSourceRoiReportForTenant` in inbuilt-reports.ts.
// This report groups by LEAD source but sums OPPORTUNITY pipeline/won value, so it genuinely
// needs both tables' own filtering -- `buildWhere` for Opportunity's tenant/scope/soft-merge
// rules, and `buildLeadWhere` (exported from leads-postgres.ts for exactly this) for Lead's own,
// identical-in-shape-but-separately-scoped rules. Two CTEs (each built from ONE table only, so
// each where-builder's unqualified column references stay unambiguous) are joined on
// `"leadId" = id` -- this reproduces exactly what the old JS version did (an opportunity only
// counts against a source if its lead is itself in the caller's own visible/scoped lead set), just
// as a real join instead of an in-memory Map lookup, and with no 1000-row cap on either side.
export async function getLeadSourceRoiAggregateForTenant(user: TenantUser) {
  const leadWhere = buildLeadWhere(user, null);
  const leadRows = await query<{ source: string | null; leads: number }>(
    `select source, count(*)::int as leads from "Lead" ${leadWhere.sql} group by source`,
    leadWhere.values,
  );

  const oppWhere = buildWhere(user, null, null);
  const leadWhereShifted = shiftSqlPlaceholders(leadWhere.sql, oppWhere.values.length);
  const oppRows = await query<{ source: string | null; opportunities: number; pipelineValue: number; wonOpportunities: number; wonValue: number }>(
    `with scoped_opportunities as (
       select id, "leadId", amount, "stageId" from "Opportunity" ${oppWhere.sql}
     ),
     scoped_leads as (
       select id, source from "Lead" ${leadWhereShifted}
     )
     select sl.source as source,
            count(*)::int as opportunities,
            coalesce(sum(so.amount), 0)::float8 as "pipelineValue",
            count(*) filter (where coalesce(sd."isWon", false))::int as "wonOpportunities",
            coalesce(sum(so.amount) filter (where coalesce(sd."isWon", false)), 0)::float8 as "wonValue"
     from scoped_opportunities so
     join scoped_leads sl on sl.id = so."leadId"
     left join "StageDefinition" sd on sd.id = so."stageId"
     group by sl.source`,
    oppWhere.values.concat(leadWhere.values),
  );

  return { leadRows, oppRows };
}

// Raw (unmasked) single-row fetch, shared by getOpportunityForTenant (masks before returning to
// the caller) and updateOpportunityForTenant (needs the TRUE current values as its merge/diff
// baseline -- see leads-postgres.ts's fetchRawLead for why using an already-masked read there
// would silently overwrite a hidden field's real value with null on every unrelated update).
async function fetchRawOpportunity(user: TenantUser, id: string) {
  const where = buildWhere(user, null);
  const values = where.values.concat([id]);
  return queryOne<any>(`select ${OPPORTUNITY_COLUMNS} from "Opportunity" ${where.sql} and id = $${values.length} limit 1`, values);
}

export async function getOpportunityForTenant(user: TenantUser, id: string) {
  const opportunity = await fetchRawOpportunity(user, id);
  if (!opportunity) return null;
  const decorated = (await decorateOpportunities(user, [opportunity]))[0] ?? null;
  return decorated ? maskFieldsForUser(user, "opportunities", decorated, decorated.opportunityTypeId) : null;
}

async function createAuditLog(user: TenantUser, action: string, entityId: string, before: unknown, after: unknown, diff: unknown, tx?: TransactionClient) {
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, 'OPPORTUNITY', $5, $6, $7, $8, $10, $9)`,
    [randomUUID(), user.tenantId, user.id, action, entityId, before, after, diff, new Date().toISOString(), user.apiKeyId ? {apiKeyId:user.apiKeyId} : null],
    tx,
  );
}

function fieldDiff(before: Record<string, any>, after: Record<string, any>) {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of ["stageId", "title", "amount", "expectedCloseDate", "priority", "opportunityTypeId"]) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      diff[key] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return diff;
}

export async function createOpportunityForTenant(user: TenantUser, payload: Record<string, unknown>, unit?: CreateUnitOfWork) {
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const objectId = await getObjectId(user);
  const types = await listOpportunityTypesForTenant(user);
  const selectedType = types.find((type) => type.id === payload.opportunityTypeId);
  const stageId = (payload.stageId as string | undefined) ?? selectedType?.stages?.[0]?.id;
  if (!selectedType || !stageId || !selectedType.stages?.some((stage: {id:string}) => stage.id === stageId)) throw new Error("INVALID_OPPORTUNITY_REFERENCE");
  const id = randomUUID();
  const now = new Date().toISOString();
  let created: any = null;

  const write = async (tx: TransactionClient) => {
    const leadWhere = buildLeadWhere(user, null);
    const lead = await tx.query(`select id from "Lead" ${leadWhere.sql} and id=$${leadWhere.values.length+1}`, [...leadWhere.values,payload.leadId]);
    if (!lead.rows.length) throw new Error("INVALID_OPPORTUNITY_REFERENCE");
    const result = await tx.query(
      `insert into "Opportunity" (id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, amount, "expectedCloseDate", priority, tags, "ownerId", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, null, $12, $13, $13)
       returning ${OPPORTUNITY_COLUMNS}`,
      [
        id,
        user.tenantId,
        objectId,
        payload.leadId,
        payload.opportunityTypeId,
        stageId,
        payload.title,
        payload.amount ?? null,
        payload.expectedCloseDate || null,
        payload.priority || "MEDIUM",
        [],
        user.id,
        now,
      ],
    );
    created = result.rows[0];
    await tx.query(
      'insert into "OpportunityStageHistory" (id, "tenantId", "opportunityId", "fromStageId", "toStageId", "changedById", notes) values ($1, $2, $3, null, $4, $5, null)',
      [randomUUID(), user.tenantId, created.id, created.stageId, user.id],
    );
    await createAuditLog(user, "CREATE", created.id, null, created, null, tx);
    await enqueueWebhookEvent(user.tenantId, "OPPORTUNITY_CREATED", created, tx);
  };
  if (unit) await write(unit.tx); else await withTransaction(transactionContext(user), write);

  const complete = async () => {
  const distribution = await distributeRecord(user, "OPPORTUNITY", created.id, created).catch(() => null);
  const createdWithOwner = distribution?.assignedUserId ? { ...created, ownerId: distribution.assignedUserId } : created;
  await runAutomationsForEvent(user, "OPPORTUNITY_CREATED", "OPPORTUNITY", createdWithOwner.id, createdWithOwner).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, "OPPORTUNITY_CREATED", createdWithOwner).catch(() => undefined);
  await refreshNextBestActionsForRecord(user, "OPPORTUNITY", createdWithOwner.id);
  // Credited against the LEAD, not the Opportunity itself, so it joins the lead's earlier
  // form/website attribution touches under the same (recordType, recordId) key --
  // an Opportunity has no touches of its own to attribute against.
  if (createdWithOwner.leadId) {
    await recordAttributionTouch(user, {
      recordType: "LEAD",
      recordId: createdWithOwner.leadId,
      channel: "OTHER",
      touchType: "CONVERSION",
      metadata: { opportunityId: createdWithOwner.id },
    }).catch(() => undefined);
  }
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  const decorated = (await decorateOpportunities(user, [createdWithOwner]))[0];
  return { ...maskFieldsForUser(user, "opportunities", decorated, decorated.opportunityTypeId), distribution };
  };
  if (unit) { unit.afterCommit.push(complete); return maskFieldsForUser(user, "opportunities", created, created.opportunityTypeId); }
  return complete();
}

export async function updateOpportunityForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await fetchRawOpportunity(user, id);
  if (!existing) return null;
  // F03 fix: drop any field this user's permission template marks "readonly"/"hidden" for this
  // opportunity's type before it can influence the update (see field-permissions.ts).
  const { sanitized } = sanitizeWritePayload(user, "opportunities", payload, (payload.opportunityTypeId as string | undefined) ?? existing.opportunityTypeId);
  const now = new Date().toISOString();
  const where = buildWhere(user, null);
  const nextStageId = sanitized.stageId !== undefined ? sanitized.stageId : existing.stageId;
  const nextTitle = sanitized.title !== undefined ? sanitized.title : existing.title;
  const nextAmount = sanitized.amount !== undefined ? sanitized.amount : existing.amount;
  const nextExpectedCloseDate = sanitized.expectedCloseDate !== undefined ? sanitized.expectedCloseDate : existing.expectedCloseDate;
  const nextPriority = sanitized.priority !== undefined ? sanitized.priority : existing.priority;
  const nextOpportunityTypeId = sanitized.opportunityTypeId !== undefined ? sanitized.opportunityTypeId : existing.opportunityTypeId;
  const values = [
    nextStageId,
    nextTitle,
    nextAmount,
    nextExpectedCloseDate,
    nextPriority,
    nextOpportunityTypeId,
    now,
    ...where.values,
    id,
  ];
  const shiftedWhereSql = shiftSqlPlaceholders(where.sql, 7);
  let updated: any = null;
  await withTransaction(transactionContext(user), async (tx) => {
    const result = await tx.query(
      `update "Opportunity"
       set "stageId" = $1, title = $2, amount = $3, "expectedCloseDate" = $4, priority = $5, "opportunityTypeId" = $6, "updatedAt" = $7
       ${shiftedWhereSql} and id = $${values.length}
       returning ${OPPORTUNITY_COLUMNS}`,
      values,
    );
    updated = result.rows[0] ?? null;
    if (updated?.stageId && existing.stageId !== updated.stageId) {
      await tx.query(
        'insert into "OpportunityStageHistory" (id, "tenantId", "opportunityId", "fromStageId", "toStageId", "changedById", notes) values ($1, $2, $3, $4, $5, $6, null)',
        [randomUUID(), user.tenantId, updated.id, existing.stageId, updated.stageId, user.id],
      );
    }
  });
  if (!updated) return null;
  const diff = fieldDiff(existing, updated);
  await createAuditLog(user, "UPDATE", updated.id, existing, updated, Object.keys(diff).length ? diff : null);
  await runAutomationsForEvent(user, "OPPORTUNITY_UPDATED", "OPPORTUNITY", updated.id, updated).catch(() => undefined);
  await enqueueWebhookEvent(user.tenantId, "OPPORTUNITY_UPDATED", updated).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, "OPPORTUNITY_UPDATED", updated).catch(() => undefined);
  if (updated.stageId && existing.stageId !== updated.stageId) {
    const stageNames = await query<{ id: string; name: string }>(
      'select id, name from "StageDefinition" where id = any($1::text[])',
      [[existing.stageId, updated.stageId]],
    );
    const stageNameById = new Map(stageNames.map((stage) => [stage.id, stage.name]));
    const stageChangedPayload = {
      ...updated,
      fromStageId: existing.stageId,
      toStageId: updated.stageId,
      fromStageName: stageNameById.get(existing.stageId) ?? null,
      toStageName: stageNameById.get(updated.stageId) ?? null,
    };
    await runAutomationsForEvent(user, "STAGE_CHANGED", "OPPORTUNITY", updated.id, stageChangedPayload).catch(() => undefined);
    await enqueueWebhookEvent(user.tenantId, "STAGE_CHANGED", stageChangedPayload).catch(() => undefined);
    await enqueueAppEvent(user.tenantId, "STAGE_CHANGED", stageChangedPayload).catch(() => undefined);
  }
  await refreshNextBestActionsForRecord(user, "OPPORTUNITY", updated.id);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  const decoratedUpdated = (await decorateOpportunities(user, [updated]))[0] ?? updated;
  return maskFieldsForUser(user, "opportunities", decoratedUpdated, decoratedUpdated.opportunityTypeId);
}

export async function deleteOpportunityForTenant(user: TenantUser, id: string) {
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const where = buildWhere(user, null);
  const values = where.values.concat([id]);
  await execute(`delete from "Opportunity" ${where.sql} and id = $${values.length}`, values);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
}

export async function getOpportunityHistoryForTenant(user: TenantUser, opportunityId: string) {
  const history = await query<any>(
    `select id, "tenantId", "opportunityId", "fromStageId", "toStageId", "changedById", "changedAt", notes
     from "OpportunityStageHistory"
     where "opportunityId" = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}
     order by "changedAt" desc`,
    user.tenantId ? [opportunityId, user.tenantId] : [opportunityId],
  );
  const [types, users] = await Promise.all([
    listOpportunityTypesForTenant(user),
    query<any>(`select id, name, email from "User" where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}`, user.tenantId ? [user.tenantId] : []),
  ]);
  const stageMap = new Map(types.flatMap((type: any) => (type.stages ?? []).map((stage: any) => [stage.id, { name: stage.name, label: stage.label ?? stage.name }])));
  const userMap = new Map(users.map((record) => [record.id, record]));
  return history.map((item) => ({
    ...item,
    fromStage: item.fromStageId ? stageMap.get(item.fromStageId) ?? null : null,
    toStage: stageMap.get(item.toStageId) ?? { name: "Unknown", label: "Unknown" },
    changedBy: userMap.get(item.changedById) ?? { name: "Unknown User", email: "" },
  }));
}

export async function getOpportunityStatsForTenant(user: TenantUser) {
  const opportunities = await listOpportunitiesForTenant(user, 500);
  const summary = new Map<string, { stage: string; value: number; count: number; order: number }>();
  for (const opportunity of opportunities.data) {
    const stageName = opportunity.stage?.name ?? "Unassigned";
    const current = summary.get(stageName) ?? { stage: stageName, value: 0, count: 0, order: opportunity.stage?.order ?? Number.MAX_SAFE_INTEGER };
    current.value += Number(opportunity.amount ?? 0);
    current.count += 1;
    current.order = Math.min(current.order, opportunity.stage?.order ?? Number.MAX_SAFE_INTEGER);
    summary.set(stageName, current);
  }
  return [...summary.values()].sort((a, b) => a.order - b.order).map(({ order, ...item }) => item);
}
