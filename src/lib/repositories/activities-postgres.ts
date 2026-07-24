import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { listOpportunityTypesForTenant } from "@/lib/repositories/opportunities-postgres";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { formatTenantDate, getTenantTimeZone } from "@/lib/server/date-format";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

type ActivityFilterCondition = {
  field: string;
  operator?: string;
  value: string | number | boolean | null;
};

type ActivityFilterConfig = {
  conditions?: ActivityFilterCondition[];
  logic?: "AND" | "OR";
};

const ACTIVITY_COLUMNS =
  'id, "tenantId", "typeId", "leadId", "opportunityId", outcome, notes, "dueAt", "completedAt", "slaStatus", "slaTarget", "isRecurring", "recurrenceRule", "seriesId", "createdAt", "updatedAt", "createdBy"';

const ACTIVITY_FILTER_COLUMNS = new Map([
  ["typeId", "typeId"],
  ["leadId", "leadId"],
  ["opportunityId", "opportunityId"],
  ["outcome", "outcome"],
  ["notes", "notes"],
  ["dueAt", "dueAt"],
  ["completedAt", "completedAt"],
  ["slaStatus", "slaStatus"],
  ["createdBy", "createdBy"],
  ["createdAt", "createdAt"],
  ["updatedAt", "updatedAt"],
]);

const CORE_ACTIVITY_TYPES = [
  { name: "Call", icon: "Phone", color: "#3b82f6", defaultOutcome: "FOLLOW_UP_NEEDED", defaultSLA: 60, order: 0 },
  { name: "Email", icon: "Mail", color: "#8b5cf6", defaultOutcome: "SUCCESS", defaultSLA: 240, order: 1 },
  { name: "Meeting", icon: "Calendar", color: "#10b981", defaultOutcome: "SUCCESS", defaultSLA: 1440, order: 2 },
  { name: "Page Visit", icon: "Globe", color: "#0ea5e9", defaultOutcome: "SUCCESS", defaultSLA: null, order: 3 },
  { name: "Form Submitted", icon: "FileCheck", color: "#22c55e", defaultOutcome: "SUCCESS", defaultSLA: null, order: 4 },
  { name: "Automation Activity", icon: "Workflow", color: "#f97316", defaultOutcome: "SUCCESS", defaultSLA: null, order: 5 },
  { name: "Lead Captured", icon: "UserPlus", color: "#14b8a6", defaultOutcome: "SUCCESS", defaultSLA: null, order: 6 },
];

function tenantWhere(user: TenantUser, values: unknown[]) {
  if (user.tenantId) {
    values.push(user.tenantId);
    return `"tenantId" = $${values.length}`;
  }
  return '"tenantId" is null';
}

function addActivityCondition(clauses: string[], values: unknown[], condition: ActivityFilterCondition) {
  const column = ACTIVITY_FILTER_COLUMNS.get(condition.field);
  if (!column) return;
  const quoted = `"${column}"`;
  const operator = condition.operator ?? "equals";
  if (operator === "equals") {
    if (Array.isArray(condition.value)) {
      values.push(condition.value.map(String));
      clauses.push(`${quoted}::text = any($${values.length}::text[])`);
      return;
    }
    values.push(condition.value);
    clauses.push(`${quoted} = $${values.length}`);
  } else if (operator === "not_equals") {
    if (Array.isArray(condition.value)) {
      values.push(condition.value.map(String));
      clauses.push(`${quoted}::text <> all($${values.length}::text[])`);
      return;
    }
    values.push(condition.value);
    clauses.push(`${quoted} <> $${values.length}`);
  } else if (operator === "in" && Array.isArray(condition.value)) {
    values.push(condition.value.map(String));
    clauses.push(`${quoted}::text = any($${values.length}::text[])`);
  } else if (operator === "not_in" && Array.isArray(condition.value)) {
    values.push(condition.value.map(String));
    clauses.push(`${quoted}::text <> all($${values.length}::text[])`);
  } else if (operator === "contains" && typeof condition.value === "string") {
    values.push(`%${condition.value}%`);
    clauses.push(`${quoted} ilike $${values.length}`);
  } else if (operator === "gte") {
    values.push(condition.value);
    clauses.push(`${quoted} >= $${values.length}`);
  } else if (operator === "lte") {
    values.push(condition.value);
    clauses.push(`${quoted} <= $${values.length}`);
  } else if (operator === "greater_than") {
    values.push(condition.value);
    clauses.push(`${quoted} > $${values.length}`);
  } else if (operator === "less_than") {
    values.push(condition.value);
    clauses.push(`${quoted} < $${values.length}`);
  }
}

function buildWhere(user: TenantUser, filters: ActivityFilterConfig | null) {
  const values: unknown[] = [];
  const clauses = [tenantWhere(user, values)];
  for (const condition of filters?.conditions ?? []) {
    if (!condition?.field) continue;
    addActivityCondition(clauses, values, condition);
  }
  return { sql: `where ${clauses.join(" and ")}`, values };
}

async function getObjectId(user: TenantUser) {
  const existing = await queryOne<{ id: string }>(
    `select id from "ObjectDefinition" where name = 'activity' and ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'} limit 1`,
    user.tenantId ? [user.tenantId] : [],
  );
  if (existing?.id) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  await queryOne(
    'insert into "ObjectDefinition" (id, "tenantId", name, label, "isCustom", "createdAt", "updatedAt") values ($1, $2, $3, $4, false, $5, $5) returning id',
    [id, user.tenantId, "activity", "Activity", now],
  );
  return id;
}

export async function listActivityTypesForTenant(user: TenantUser) {
  async function fetchTypes() {
    return query<any>(
      `select id, name, icon, color, "defaultOutcome", "defaultSLA", "isActive", "createdAt", "updatedAt"
       from "ActivityType"
       where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
       order by "order" asc`,
      user.tenantId ? [user.tenantId] : [],
    );
  }

  let data = await fetchTypes();
  if (user.tenantId) {
    const objectId = await getObjectId(user);
    const existingNames = new Set(data.map((item) => String(item.name).toLowerCase()));
    const missing = CORE_ACTIVITY_TYPES.filter((item) => !existingNames.has(item.name.toLowerCase()));
    const now = new Date().toISOString();
    for (const item of missing) {
      await execute(
        `insert into "ActivityType" (id, "tenantId", "objectId", name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $10)`,
        [randomUUID(), user.tenantId, objectId, item.name, item.icon, item.color, item.defaultOutcome, item.defaultSLA, item.order, now],
      );
    }
    if (missing.length) data = await fetchTypes();
  }

  return data.map((item) => ({ ...item, defaultSLA: item.defaultSLA ?? null, description: null }));
}

async function rowsByIds(table: string, columns: string, ids: string[], tenantId?: string | null) {
  if (!ids.length) return [];
  return query<any>(
    `select ${columns} from "${table}" where id = any($1::text[])${tenantId ? ' and "tenantId" = $2' : ""}`,
    tenantId ? [ids, tenantId] : [ids],
  );
}

async function hydrateActivities(user: TenantUser, activities: any[]) {
  const leadIds = [...new Set(activities.map((item) => item.leadId).filter(Boolean))];
  const opportunityIds = [...new Set(activities.map((item) => item.opportunityId).filter(Boolean))];
  const userIds = [...new Set(activities.map((item) => item.createdBy).filter(Boolean))];
  const activityIds = activities.map((item) => item.id);
  const [types, users, leads, opportunities, audits, opportunityTypes] = await Promise.all([
    listActivityTypesForTenant(user),
    rowsByIds("User", "id, name, email", userIds),
    rowsByIds("Lead", 'id, name, email, company, status, source, score, "ownerId", "createdAt", "updatedAt"', leadIds, user.tenantId),
    rowsByIds("Opportunity", 'id, "leadId", "opportunityTypeId", "stageId", title, amount, priority, "ownerId", "createdAt", "updatedAt"', opportunityIds, user.tenantId),
    activityIds.length
      ? query<any>(
          `select id, action, "entityId", diff, before, after, "createdAt", "userId"
           from "AuditLog"
           where "entityType" = 'ACTIVITY' and "entityId" = any($1::text[])${user.tenantId ? ' and "tenantId" = $2' : ""}
           order by "createdAt" desc`,
          user.tenantId ? [activityIds, user.tenantId] : [activityIds],
        )
      : [],
    listOpportunityTypesForTenant(user),
  ]);
  const typeMap = new Map(types.map((type: any) => [type.id, type]));
  const userMap = new Map(users.map((record: any) => [record.id, record]));
  const leadMap = new Map(leads.map((record: any) => [record.id, record]));
  const stageMap = new Map(opportunityTypes.flatMap((type: any) => (type.stages ?? []).map((stage: any) => [stage.id, stage])));
  const typeById = new Map(opportunityTypes.map((type: any) => [type.id, type]));
  const opportunityMap = new Map(opportunities.map((record: any) => [record.id, {
    ...record,
    stage: stageMap.get(record.stageId) ?? null,
    opportunityType: typeById.get(record.opportunityTypeId) ?? null,
  }]));
  const auditByActivityId = new Map<string, any[]>();
  for (const entry of audits) {
    const existing = auditByActivityId.get(entry.entityId) ?? [];
    existing.push({ ...entry, user: userMap.get(entry.userId) ?? { name: "Unknown User", email: "" } });
    auditByActivityId.set(entry.entityId, existing);
  }

  return activities.map((item) => ({
    ...item,
    duration: null,
    customFields: null,
    type: typeMap.get(item.typeId),
    user: userMap.get(item.createdBy) ?? null,
    lead: item.leadId ? leadMap.get(item.leadId) ?? null : null,
    opportunity: item.opportunityId ? opportunityMap.get(item.opportunityId) ?? null : null,
    auditEvents: auditByActivityId.get(item.id) ?? [],
  }));
}

export async function listActivitiesForTenant(user: TenantUser, limit: number, filters: ActivityFilterConfig | null, page = 1) {
  const currentLimit = Math.min(500, Math.max(1, Number.isFinite(limit) ? limit : 100));
  const currentPage = Math.max(1, Number.isFinite(page) ? page : 1);
  const offset = (currentPage - 1) * currentLimit;
  const where = buildWhere(user, filters);
  const [countRow, activities] = await Promise.all([
    queryOne<{ count: number }>(`select count(*)::int as count from "Activity" ${where.sql}`, where.values),
    query<any>(
      `select ${ACTIVITY_COLUMNS} from "Activity" ${where.sql} order by "createdAt" desc limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      where.values.concat([currentLimit, offset]),
    ),
  ]);
  const total = countRow?.count ?? 0;
  return {
    data: await hydrateActivities(user, activities),
    meta: { total, page: currentPage, last_page: Math.max(1, Math.ceil(total / currentLimit)), limit: currentLimit },
  };
}

async function createAuditLog(user: TenantUser, action: string, entityId: string, before: unknown, after: unknown, diff: unknown) {
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, $4, 'ACTIVITY', $5, $6, $7, $8, null, $9)`,
    [randomUUID(), user.tenantId, user.id, action, entityId, before, after, diff, new Date().toISOString()],
  );
}

export async function createActivityForTenant(user: TenantUser, payload: Record<string, unknown>) {
  const objectId = await getObjectId(user);
  const now = new Date().toISOString();
  const activity = await queryOne<any>(
    `insert into "Activity" (id, "tenantId", "objectId", "typeId", "leadId", "opportunityId", outcome, notes, "dueAt", "completedAt", "slaStatus", "slaTarget", "isRecurring", "recurrenceRule", "seriesId", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, null, 'PENDING', null, false, null, null, $10, $11, $11)
     returning ${ACTIVITY_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      objectId,
      payload.typeId,
      payload.leadId || null,
      payload.opportunityId || null,
      payload.outcome || null,
      payload.notes || null,
      payload.dueAt || null,
      user.id,
      now,
    ],
  );
  if (!activity) throw new Error("ACTIVITY_INSERT_FAILED");
  const [hydrated] = await hydrateActivities(user, [activity]);
  await createAuditLog(user, "CREATE", activity.id, null, hydrated, null);
  if (hydrated.leadId) {
    await runAutomationsForEvent(user, "ACTIVITY_CREATED", "ACTIVITY", hydrated.id, hydrated).catch(() => undefined);
  }
  if (hydrated.opportunityId) {
    await runAutomationsForEvent(user, "ACTIVITY_CREATED_ON_OPPORTUNITY", "ACTIVITY", hydrated.id, hydrated).catch(() => undefined);
  }
  return hydrated;
}

function diff(before: Record<string, any>, after: Record<string, any>) {
  const result: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of ["typeId", "leadId", "opportunityId", "outcome", "notes", "dueAt", "completedAt", "slaStatus", "slaTarget"]) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      result[key] = { before: before[key] ?? null, after: after[key] ?? null };
    }
  }
  return Object.keys(result).length ? result : null;
}

export async function updateActivityForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  const values: unknown[] = [];
  const existing = await queryOne<any>(
    `select ${ACTIVITY_COLUMNS} from "Activity" where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'} limit 1`,
    user.tenantId ? [id, user.tenantId] : [id],
  );
  if (!existing) throw new Error("ACTIVITY_NOT_FOUND");

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["typeId", "leadId", "opportunityId", "outcome", "notes", "dueAt", "completedAt", "slaStatus", "slaTarget"]) {
    if (payload[key] !== undefined) patch[key] = payload[key] || null;
  }
  const columns = Object.keys(patch);
  const assignments = columns.map((column) => {
    values.push(patch[column]);
    return `"${column}" = $${values.length}`;
  });
  values.push(id);
  const idIndex = values.length;
  const tenantClause = user.tenantId ? (() => {
    values.push(user.tenantId);
    return `and "tenantId" = $${values.length}`;
  })() : 'and "tenantId" is null';

  const activity = await queryOne<any>(
    `update "Activity" set ${assignments.join(", ")} where id = $${idIndex} ${tenantClause} returning ${ACTIVITY_COLUMNS}`,
    values,
  );
  if (!activity) throw new Error("ACTIVITY_NOT_FOUND");
  const [hydrated] = await hydrateActivities(user, [activity]);
  await createAuditLog(user, "UPDATE", activity.id, existing, activity, diff(existing, activity));
  if (hydrated.leadId) {
    await runAutomationsForEvent(user, "ACTIVITY_UPDATED", "ACTIVITY", hydrated.id, hydrated).catch(() => undefined);
  }
  if (hydrated.opportunityId) {
    await runAutomationsForEvent(user, "ACTIVITY_UPDATED_ON_OPPORTUNITY", "ACTIVITY", hydrated.id, hydrated).catch(() => undefined);
  }
  return hydrated;
}

export async function getActivityStatsForTenant(user: TenantUser) {
  const timeZone = await getTenantTimeZone(user.tenantId);
  const activities = await query<any>(
    `select id, "typeId", "createdAt" from "Activity" where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'} order by "createdAt" desc limit 1000`,
    user.tenantId ? [user.tenantId] : [],
  );
  const types = await listActivityTypesForTenant(user);
  const typeMap = new Map(types.map((type: any) => [type.id, type.name]));
  const byTypeMap = new Map<string, number>();
  const trendMap = new Map<string, number>();
  for (const activity of activities) {
    const typeName = String(typeMap.get(activity.typeId) ?? "Unknown");
    byTypeMap.set(typeName, (byTypeMap.get(typeName) ?? 0) + 1);
    const day = formatTenantDate(activity.createdAt, timeZone);
    trendMap.set(day, (trendMap.get(day) ?? 0) + 1);
  }
  return {
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })),
    trend: [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
  };
}
