import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { distributeRecord } from "@/lib/server/distribution-engine";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
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
const LEAD_FILTER_COLUMNS = new Map([
  ["id", "id"],
  ["name", "name"],
  ["email", "email"],
  ["phone", "phone"],
  ["company", "company"],
  ["source", "source"],
  ["status", "status"],
  ["score", "score"],
  ["createdBy", "createdBy"],
  ["ownerId", "ownerId"],
  ["createdAt", "createdAt"],
  ["updatedAt", "updatedAt"],
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

const SCORE_FIELD_TO_COLUMN = new Map([
  ["predictiveScoreBand", "scoreBand"],
  ["predictiveConfidence", "confidence"],
  ["predictiveConversionProbability", "conversionProbability"],
  ["predictiveWinProbability", "winProbability"],
  ["predictiveStallRisk", "stallRisk"],
  ["predictiveExpectedResponseLikelihood", "expectedResponseLikelihood"],
  ["predictiveDuplicateRisk", "duplicateRisk"],
  ["predictiveStaleRisk", "staleRisk"],
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
  columnMap: Map<string, string>,
) {
  const column = columnMap.get(field);
  if (!column) return;
  const quotedColumn = `"${column}"`;
  const op = operator ?? "equals";

  if (op === "equals") {
    if (Array.isArray(value)) {
      values.push(value.map(String));
      clauses.push(`${quotedColumn}::text = any($${values.length}::text[])`);
      return;
    }
    values.push(value);
    clauses.push(`${quotedColumn} = $${values.length}`);
  } else if (op === "not_equals") {
    if (Array.isArray(value)) {
      values.push(value.map(String));
      clauses.push(`${quotedColumn}::text <> all($${values.length}::text[])`);
      return;
    }
    values.push(value);
    clauses.push(`${quotedColumn} <> $${values.length}`);
  } else if (op === "in" && Array.isArray(value)) {
    values.push(value.map(String));
    clauses.push(`${quotedColumn}::text = any($${values.length}::text[])`);
  } else if (op === "not_in" && Array.isArray(value)) {
    values.push(value.map(String));
    clauses.push(`${quotedColumn}::text <> all($${values.length}::text[])`);
  } else if (op === "contains" && typeof value === "string") {
    values.push(`%${value}%`);
    clauses.push(`${quotedColumn} ilike $${values.length}`);
  } else if (op === "greater_than") {
    values.push(value);
    clauses.push(`${quotedColumn} > $${values.length}`);
  } else if (op === "less_than") {
    values.push(value);
    clauses.push(`${quotedColumn} < $${values.length}`);
  } else if (op === "gte") {
    values.push(value);
    clauses.push(`${quotedColumn} >= $${values.length}`);
  } else if (op === "lte") {
    values.push(value);
    clauses.push(`${quotedColumn} <= $${values.length}`);
  }
}

function buildLeadWhere(user: TenantUser, filters: LeadFilterInput[] | null, scoreMatchedIds?: string[] | null) {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (user.tenantId) {
    values.push(user.tenantId);
    clauses.push(`"tenantId" = $${values.length}`);
  } else {
    clauses.push(`"tenantId" is null`);
  }

  if (isOwnerScoped(user)) {
    values.push(user.id);
    clauses.push(`"ownerId" = $${values.length}`);
  }

  if (scoreMatchedIds) {
    if (scoreMatchedIds.length === 0) clauses.push("false");
    else {
      values.push(scoreMatchedIds);
      clauses.push(`id = any($${values.length}::text[])`);
    }
  }

  for (const group of normalizeLeadFilters(filters)) {
    const conditions: LeadFilterCondition[] =
      "conditions" in group && Array.isArray(group.conditions)
        ? group.conditions
        : [group as LeadFilterCondition];
    for (const condition of conditions) {
      if (!condition?.field) continue;
      addCondition(clauses, values, condition.field, condition.operator, condition.value, LEAD_FILTER_COLUMNS);
    }
  }

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
            "overrideReason", "overrideUntil", "overrideOwnerId", "overriddenAt",
            "calculatedAt", "updatedAt"
     from "RecordScore"
     where "recordType" = 'LEAD'
       and "recordId" = any($1::text[])
       and ${tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
    tenantId ? [recordIds, tenantId] : [recordIds],
  );
  return new Map(rows.map((score) => [score.recordId, score]));
}

function formatLead(lead: any, predictiveScore: any = null) {
  return {
    ...lead,
    assignedUserId: lead.ownerId ?? null,
    predictiveScore,
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
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, $10)`,
    [randomUUID(), user.tenantId, user.id, action, entityType, entityId, before, after, diff, new Date().toISOString()],
  );
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
  const where = buildLeadWhere(user, recordFilters, scoreMatchedIds);

  const [countRow, data] = await Promise.all([
    queryOne<{ count: number }>(`select count(*)::int as count from "Lead" ${where.sql}`, where.values),
    query<any>(
      `select ${LEAD_COLUMNS} from "Lead" ${where.sql} order by "createdAt" desc limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      where.values.concat([currentLimit, offset]),
    ),
  ]);
  const scoreMap = await getPredictiveScoreMap(user.tenantId, data.map((lead) => lead.id));

  return {
    data: data.map((lead) => formatLead(lead, scoreMap.get(lead.id) ?? null)),
    meta: {
      total: countRow?.count ?? 0,
      page: currentPage,
      last_page: Math.max(1, Math.ceil((countRow?.count ?? 0) / currentLimit)),
      limit: currentLimit,
    },
  };
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
  return formatted;
}

export async function deleteLeadsForTenant(user: TenantUser, ids: string[]) {
  if (!ids.length) return 0;
  const where = buildLeadWhere(user, null);
  const values = where.values.concat([ids]);
  return execute(`delete from "Lead" ${where.sql} and id = any($${values.length}::text[])`, values);
}
