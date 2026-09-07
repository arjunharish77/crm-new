import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import { listLeadsForTenant } from "@/lib/repositories/leads-postgres";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { distributeRecord } from "@/lib/server/distribution-engine";
import { refreshNextBestActionsForRecord } from "@/lib/server/next-best-action";
import { recordAttributionTouch } from "@/lib/server/marketing-journeys";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { enqueueWebhookEvent } from "@/lib/server/webhook-outbox";
import { enqueueAppEvent } from "@/lib/server/marketplace-events";
import { invalidateReportRollupsForTenant } from "@/lib/server/report-rollups";
import { applyFilterCondition, buildGroupedFilterClause, type FilterValueKind } from "@/lib/query-filters";
import { substituteUserTokens } from "@/lib/server/user-token-filters";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  isPlatformAdmin?: boolean;
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
  'id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, amount, "expectedCloseDate", priority, tags, "ownerId", "createdAt", "updatedAt"';

const OPPORTUNITY_FILTER_COLUMNS = new Map<string, { column: string; kind: FilterValueKind }>([
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
]);

const SCORE_FIELD_TO_COLUMN = new Map<string, { column: string; kind: FilterValueKind }>([
  ["predictiveScoreBand", { column: "scoreBand", kind: "select" }],
  ["predictiveConfidence", { column: "confidence", kind: "number" }],
  ["predictiveConversionProbability", { column: "conversionProbability", kind: "number" }],
  ["predictiveWinProbability", { column: "winProbability", kind: "number" }],
  ["predictiveStallRisk", { column: "stallRisk", kind: "number" }],
  ["predictiveExpectedCloseRisk", { column: "expectedCloseRisk", kind: "number" }],
]);

function isOwnerScoped(user: TenantUser) {
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  return permissions?.isPartnerRole || permissions?.recordAccess === "OWN";
}

function transactionContext(user: TenantUser) {
  return { id: user.id, tenantId: user.tenantId };
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

function splitScoreFilters(filters: FilterInput[] | null) {
  const recordFilters: FilterInput[] = [];
  const scoreFilters: FilterCondition[] = [];
  for (const group of Array.isArray(filters) ? filters : []) {
    const conditions = "conditions" in group && Array.isArray(group.conditions) ? group.conditions : [group as FilterCondition];
    const recordConditions = conditions.filter((condition) => !condition?.field || !SCORE_FIELD_TO_COLUMN.has(condition.field));
    scoreFilters.push(...conditions.filter((condition) => condition?.field && SCORE_FIELD_TO_COLUMN.has(condition.field)));
    if (recordConditions.length === conditions.length) recordFilters.push(group);
    else if (recordConditions.length > 0) recordFilters.push({ ...(group as any), conditions: recordConditions });
  }
  return { recordFilters, scoreFilters };
}

function buildWhere(user: TenantUser, filters: FilterInput[] | null, opportunityTypeId?: string | null, scoreMatchedIds?: string[] | null) {
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
  if (isOwnerScoped(user)) {
    values.push(user.id);
    const userIdParam = values.length;
    if (tenantIdParam) {
      // Same RecordShare exception as leads-postgres.ts's buildLeadWhere -- kept identical
      // in shape deliberately, not abstracted into a shared helper, since these two files
      // don't share a common query-builder module today.
      clauses.push(
        `("ownerId" = $${userIdParam} or id = any(
          select rs."recordId" from "RecordShare" rs
          where rs."tenantId" = $${tenantIdParam} and rs."recordType" = 'OPPORTUNITY'
            and ($${userIdParam} = any(rs."sharedUserIds")
                 or exists (select 1 from "User" u where u.id = $${userIdParam} and u."teamId"::text = any(rs."sharedTeamIds")))
        ))`
      );
    } else {
      clauses.push(`"ownerId" = $${userIdParam}`);
    }
  }
  if (opportunityTypeId) {
    values.push(opportunityTypeId);
    clauses.push(`"opportunityTypeId" = $${values.length}`);
  }
  if (scoreMatchedIds) {
    if (scoreMatchedIds.length === 0) clauses.push("false");
    else {
      values.push(scoreMatchedIds);
      clauses.push(`id = any($${values.length}::text[])`);
    }
  }

  buildGroupedFilterClause(clauses, values, Array.isArray(filters) ? filters : [], OPPORTUNITY_FILTER_COLUMNS);

  return { sql: clauses.length ? `where ${clauses.join(" and ")}` : "", values };
}

function shiftSqlPlaceholders(sql: string, offset: number) {
  if (!offset) return sql;
  return sql.replace(/\$(\d+)/g, (_, index) => `$${Number(index) + offset}`);
}

async function resolveScoreRecordIds(tenantId: string | null, filters: FilterCondition[]) {
  if (!filters.length) return null;
  const clauses = ['"recordType" = $1'];
  const values: unknown[] = ["OPPORTUNITY"];
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
  const currentLimit = Math.min(500, Math.max(1, Number.isFinite(limit) ? limit : 100));
  const currentPage = Math.max(1, Number.isFinite(page) ? page : 1);
  const offset = (currentPage - 1) * currentLimit;
  const { recordFilters, scoreFilters } = splitScoreFilters(filters);
  const scoreMatchedIds = await resolveScoreRecordIds(user.tenantId, scoreFilters);
  if (scoreMatchedIds && scoreMatchedIds.length === 0) {
    return { data: [], meta: { total: 0, page: currentPage, last_page: 1, limit: currentLimit } };
  }

  // "Current user/team tokens" -- see the matching comment in leads-postgres.ts's own
  // listLeadsForTenant for why this resolves "@myteam" here rather than making buildWhere async.
  const resolvedFilters = await substituteUserTokens(recordFilters, user);
  const where = buildWhere(user, resolvedFilters, opportunityTypeId, scoreMatchedIds);
  const [countRow, opportunities] = await Promise.all([
    queryOne<{ count: number }>(`select count(*)::int as count from "Opportunity" ${where.sql}`, where.values),
    query<any>(
      `select ${OPPORTUNITY_COLUMNS} from "Opportunity" ${where.sql} order by "createdAt" desc limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      where.values.concat([currentLimit, offset]),
    ),
  ]);
  const total = countRow?.count ?? 0;
  return {
    data: await decorateOpportunities(user, opportunities),
    meta: { total, page: currentPage, last_page: Math.max(1, Math.ceil(total / currentLimit)), limit: currentLimit },
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
export async function getOpportunityStageCountsForTenant(user: TenantUser) {
  const where = buildWhere(user, null, null, null);
  const counts = await query<{ stageId: string | null; count: number }>(
    `select "stageId", count(*)::int as count from "Opportunity" ${where.sql} group by "stageId"`,
    where.values,
  );
  const stageIds = counts.map((row) => row.stageId).filter((id): id is string => !!id);
  const stages = stageIds.length
    ? await query<{ id: string; name: string; order: number }>(`select id, name, "order" from "OpportunityStage" where id = any($1::text[])`, [
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

export async function getOpportunityForTenant(user: TenantUser, id: string) {
  const where = buildWhere(user, null);
  const values = where.values.concat([id]);
  const opportunity = await queryOne<any>(`select ${OPPORTUNITY_COLUMNS} from "Opportunity" ${where.sql} and id = $${values.length} limit 1`, values);
  if (!opportunity) return null;
  return (await decorateOpportunities(user, [opportunity]))[0] ?? null;
}

async function createAuditLog(user: TenantUser, action: string, entityId: string, before: unknown, after: unknown, diff: unknown) {
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, 'OPPORTUNITY', $5, $6, $7, $8, null, $9)`,
    [randomUUID(), user.tenantId, user.id, action, entityId, before, after, diff, new Date().toISOString()],
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

export async function createOpportunityForTenant(user: TenantUser, payload: Record<string, unknown>) {
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const objectId = await getObjectId(user);
  const types = await listOpportunityTypesForTenant(user);
  const selectedType = types.find((type) => type.id === payload.opportunityTypeId);
  const stageId = (payload.stageId as string | undefined) ?? selectedType?.stages?.[0]?.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  let created: any = null;

  await withTransaction(transactionContext(user), async (tx) => {
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
        payload.amount || null,
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
  });

  await createAuditLog(user, "CREATE", created.id, null, created, null);
  const distribution = await distributeRecord(user, "OPPORTUNITY", created.id, created).catch(() => null);
  const createdWithOwner = distribution?.assignedUserId ? { ...created, ownerId: distribution.assignedUserId } : created;
  await runAutomationsForEvent(user, "OPPORTUNITY_CREATED", "OPPORTUNITY", createdWithOwner.id, createdWithOwner).catch(() => undefined);
  await enqueueWebhookEvent(user.tenantId, "OPPORTUNITY_CREATED", createdWithOwner).catch(() => undefined);
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
  return { ...(await decorateOpportunities(user, [createdWithOwner]))[0], distribution };
}

export async function updateOpportunityForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const existing = await getOpportunityForTenant(user, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const where = buildWhere(user, null);
  const nextStageId = payload.stageId !== undefined ? payload.stageId : existing.stageId;
  const nextTitle = payload.title !== undefined ? payload.title : existing.title;
  const nextAmount = payload.amount !== undefined ? payload.amount : existing.amount;
  const nextExpectedCloseDate = payload.expectedCloseDate !== undefined ? payload.expectedCloseDate : existing.expectedCloseDate;
  const nextPriority = payload.priority !== undefined ? payload.priority : existing.priority;
  const nextOpportunityTypeId = payload.opportunityTypeId !== undefined ? payload.opportunityTypeId : existing.opportunityTypeId;
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
  return (await decorateOpportunities(user, [updated]))[0] ?? updated;
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
