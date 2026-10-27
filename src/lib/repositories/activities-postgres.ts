import { randomUUID } from "crypto";
import { execute, query, queryOne, type Queryable } from "@/lib/db/query";
import { listOpportunityTypesForTenant } from "@/lib/repositories/opportunities-postgres";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { formatTenantDate, getTenantTimeZone } from "@/lib/server/date-format";
import { enqueueWebhookEvent } from "@/lib/server/webhook-outbox";
import { enqueueAppEvent } from "@/lib/server/marketplace-events";
import { invalidateReportRollupsForTenant } from "@/lib/server/report-rollups";
import { applyFilterCondition, assertFilterGroupsSupported, buildGroupedFilterClause, normalizeFilterGroups, type FilterValueKind } from "@/lib/query-filters";
import { substituteUserTokens } from "@/lib/server/user-token-filters";
import { maskCustomFieldsForUser, maskFieldsForUser, sanitizeWritePayload } from "@/lib/server/field-permissions";
import { applyRecordScopeClause, recordAccessLevel } from "@/lib/server/record-scope";
import { appendWhere } from "@/lib/repositories/leads-postgres";
import { loadCustomFieldValues, saveCustomFieldValues } from "@/lib/repositories/custom-field-values-postgres";

type TenantUser = {
  id: string;
  tenantId: string | null;
  teamId?: string | null;
  recordScopeActorId?: string | null;
  role?: { permissions?: any } | string | null;
  permissionTemplates?: any[] | null;
};

// F03 fix (WP04, slice 3): masks the activity's own fields per its activity-type field-
// permission config, AND the embedded lead/opportunity summaries hydrateActivities attaches --
// those come from a direct raw fetch (rowsByIds) that bypasses leads-postgres.ts/
// opportunities-postgres.ts's own masking entirely, so without this an activity list/detail
// view would leak a hidden Lead/Opportunity field through the embedded card even after those
// two repositories were fixed directly.
function maskActivityForUser(user: TenantUser, item: any) {
  const masked = maskCustomFieldsForUser(user, "activities", maskFieldsForUser(user, "activities", item, item.typeId), item.typeId);
  if (masked.lead) masked.lead = maskFieldsForUser(user, "leads", masked.lead);
  if (masked.opportunity) masked.opportunity = maskFieldsForUser(user, "opportunities", masked.opportunity, masked.opportunity.opportunityTypeId);
  return masked;
}

type ActivityFilterCondition = {
  field: string;
  operator?: string;
  value: string | number | boolean | null;
};

// Real bug found and fixed while unifying this with Lead/Opportunity's own filter builders:
// this used to be a single flat {conditions, logic} object whose `logic` was silently ignored
// entirely (buildWhere always ANDed every condition together no matter what) -- now an array of
// real, independent groups, each with its own honored AND/OR logic, matching Lead/Opportunity's
// own LeadFilterInput[]/FilterInput[] shape exactly (see buildGroupedFilterClause,
// query-filters.ts). A bare condition (no `conditions` array) is still accepted as its own
// one-condition group, so an older flat {conditions, logic} caller still works unchanged.
type ActivityFilterInput =
  | ActivityFilterCondition
  | {
      logic?: "AND" | "OR";
      conditions?: ActivityFilterCondition[];
    };

const ACTIVITY_COLUMNS =
  'id, "tenantId", "typeId", "leadId", "opportunityId", outcome, notes, "dueAt", "completedAt", "slaStatus", "slaTarget", "isRecurring", "recurrenceRule", "seriesId", "createdAt", "updatedAt", "createdBy"';

const ACTIVITY_FILTER_COLUMNS = new Map<string, { column: string; kind: FilterValueKind }>([
  ["typeId", { column: "typeId", kind: "select" }],
  ["leadId", { column: "leadId", kind: "text" }],
  ["opportunityId", { column: "opportunityId", kind: "text" }],
  ["outcome", { column: "outcome", kind: "select" }],
  ["notes", { column: "notes", kind: "text" }],
  ["dueAt", { column: "dueAt", kind: "date" }],
  ["completedAt", { column: "completedAt", kind: "date" }],
  ["slaStatus", { column: "slaStatus", kind: "select" }],
  ["createdBy", { column: "createdBy", kind: "user" }],
  ["createdAt", { column: "createdAt", kind: "date" }],
  ["updatedAt", { column: "updatedAt", kind: "date" }],
]);

// Activity types the CRM creates itself (voice bot plan wave A, migration 0141). Nobody can pick
// them by hand; on their activities only notes and custom fields can be edited. Each voice bot
// adds its own (systemKey VOICE_BOT, one per bot).
export const SYSTEM_ACTIVITY_TYPES = {
  CALL: { name: "Call", icon: "Phone", color: "#3b82f6" },
  EMAIL: { name: "Email", icon: "Mail", color: "#8b5cf6" },
  WHATSAPP: { name: "WhatsApp", icon: "MessageCircle", color: "#22c55e" },
  SMS: { name: "SMS", icon: "MessageSquare", color: "#f59e0b" },
  PAGE_VISIT: { name: "Page Visit", icon: "Globe", color: "#0ea5e9" },
} as const;
export type SystemActivityKey = keyof typeof SYSTEM_ACTIVITY_TYPES;

type CoreActivityType = { name: string; icon: string; color: string; defaultOutcome: string; defaultSLA: number | null; order: number; systemKey?: SystemActivityKey };

const CORE_ACTIVITY_TYPES: CoreActivityType[] = [
  { name: "Call", icon: "Phone", color: "#3b82f6", defaultOutcome: "FOLLOW_UP_NEEDED", defaultSLA: 60, order: 0, systemKey: "CALL" },
  { name: "Call (logged manually)", icon: "PhoneOutgoing", color: "#3b82f6", defaultOutcome: "FOLLOW_UP_NEEDED", defaultSLA: 60, order: 1 },
  { name: "Email", icon: "Mail", color: "#8b5cf6", defaultOutcome: "SUCCESS", defaultSLA: null, order: 2, systemKey: "EMAIL" },
  { name: "Email (logged manually)", icon: "Mail", color: "#8b5cf6", defaultOutcome: "SUCCESS", defaultSLA: 240, order: 3 },
  { name: "WhatsApp", icon: "MessageCircle", color: "#22c55e", defaultOutcome: "SUCCESS", defaultSLA: null, order: 4, systemKey: "WHATSAPP" },
  { name: "SMS", icon: "MessageSquare", color: "#f59e0b", defaultOutcome: "SUCCESS", defaultSLA: null, order: 5, systemKey: "SMS" },
  { name: "Meeting", icon: "Calendar", color: "#10b981", defaultOutcome: "SUCCESS", defaultSLA: 1440, order: 6 },
  { name: "Page Visit", icon: "Globe", color: "#0ea5e9", defaultOutcome: "SUCCESS", defaultSLA: null, order: 7, systemKey: "PAGE_VISIT" },
  { name: "Form Submitted", icon: "FileCheck", color: "#22c55e", defaultOutcome: "SUCCESS", defaultSLA: null, order: 8 },
  { name: "Automation Activity", icon: "Workflow", color: "#f97316", defaultOutcome: "SUCCESS", defaultSLA: null, order: 9 },
  { name: "Lead Captured", icon: "UserPlus", color: "#14b8a6", defaultOutcome: "SUCCESS", defaultSLA: null, order: 10 },
];

function tenantWhere(user: TenantUser, values: unknown[]) {
  if (user.tenantId) {
    values.push(user.tenantId);
    return `"tenantId" = $${values.length}`;
  }
  return '"tenantId" is null';
}

// Record access for activities (decision confirmed 2026-10-02: "linked records only").
// Activities have no owner of their own: a user whose role is OWN or TEAM sees an activity only
// when its linked lead or opportunity is one they can see (owned, team, or shared with them --
// the same rule as leads/opportunities, record-scope.ts). Unlinked activities are visible only
// to ALL-access roles. Before this, no scope was applied at all and every OWN/TEAM user saw
// every activity in the tenant. `activityRef` qualifies the Activity table in the caller's query.
export function applyActivityScopeClause(clauses: string[], values: unknown[], user: TenantUser, tenantIdParam: number | null, activityRef = '"Activity"') {
  if (recordAccessLevel(user) === "ALL") return;
  const leadScope: string[] = [];
  applyRecordScopeClause(leadScope, values, user, "LEAD", tenantIdParam, "scope_l");
  const opportunityScope: string[] = [];
  applyRecordScopeClause(opportunityScope, values, user, "OPPORTUNITY", tenantIdParam, "scope_o");
  const tenantOf = (alias: string) => (tenantIdParam ? `${alias}."tenantId" = $${tenantIdParam}` : `${alias}."tenantId" is null`);
  clauses.push(
    `((${activityRef}."leadId" is not null and exists (select 1 from "Lead" scope_l where scope_l.id = ${activityRef}."leadId" and ${tenantOf("scope_l")} and ${leadScope.join(" and ")}))` +
      ` or (${activityRef}."opportunityId" is not null and exists (select 1 from "Opportunity" scope_o where scope_o.id = ${activityRef}."opportunityId" and ${tenantOf("scope_o")} and ${opportunityScope.join(" and ")})))`,
  );
}

export function buildWhere(user: TenantUser, filters: ActivityFilterInput[] | ActivityFilterInput | null) {
  const values: unknown[] = [];
  const clauses = [tenantWhere(user, values)];
  applyActivityScopeClause(clauses, values, user, user.tenantId ? values.length : null);
  buildGroupedFilterClause(clauses, values, filters as ActivityFilterInput[] | null, ACTIVITY_FILTER_COLUMNS);
  return { sql: `where ${clauses.join(" and ")}`, values };
}

// OWN/TEAM users must link an activity to a lead or opportunity they can see; otherwise it would
// disappear from their own view as soon as it was saved (decision 2026-10-02). ALL-access roles
// are unchanged and may still log unlinked activities.
async function assertActivityLinksAllowed(user: TenantUser, leadId: unknown, opportunityId: unknown) {
  if (recordAccessLevel(user) === "ALL") return;
  if (!leadId && !opportunityId) throw new Error("ACTIVITY_LINK_REQUIRED");
  for (const [table, recordType, id] of [["Lead", "LEAD", leadId], ["Opportunity", "OPPORTUNITY", opportunityId]] as const) {
    if (!id) continue;
    const values: unknown[] = [id];
    const clauses = ['id = $1'];
    let tenantIdParam: number | null = null;
    if (user.tenantId) {
      values.push(user.tenantId);
      tenantIdParam = values.length;
      clauses.push(`"tenantId" = $${tenantIdParam}`);
    } else {
      clauses.push('"tenantId" is null');
    }
    applyRecordScopeClause(clauses, values, user, recordType, tenantIdParam);
    const visible = await queryOne<{ id: string }>(`select id from "${table}" where ${clauses.join(" and ")} limit 1`, values);
    if (!visible) throw new Error("ACTIVITY_RECORD_NOT_ACCESSIBLE");
  }
}

async function getObjectId(user: TenantUser, client?: Queryable) {
  const existing = await queryOne<{ id: string }>(
    `select id from "ObjectDefinition" where name = 'activity' and ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'} limit 1`,
    user.tenantId ? [user.tenantId] : [],
    client,
  );
  if (existing?.id) return existing.id;
  const id = randomUUID();
  const now = new Date().toISOString();
  await queryOne(
    'insert into "ObjectDefinition" (id, "tenantId", name, label, "isCustom", "createdAt", "updatedAt") values ($1, $2, $3, $4, false, $5, $5) returning id',
    [id, user.tenantId, "activity", "Activity", now],
    client,
  );
  return id;
}

export async function listActivityTypesForTenant(user: TenantUser) {
  async function fetchTypes() {
    return query<any>(
      `select id, name, icon, color, "defaultOutcome", "defaultSLA", "isActive", "systemKey", "isSystem", "createdAt", "updatedAt"
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
    const existingSystemKeys = new Set(data.map((item) => item.systemKey).filter(Boolean));
    // System types are matched by their key, others by name. A name another type already uses
    // is left alone (ensureSystemActivityType gives that system type another name when needed).
    const missing = CORE_ACTIVITY_TYPES.filter((item) => (item.systemKey ? !existingSystemKeys.has(item.systemKey) : !existingNames.has(item.name.toLowerCase())));
    const now = new Date().toISOString();
    for (const item of missing) {
      await execute(
        `insert into "ActivityType" (id, "tenantId", "objectId", name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "systemKey", "isSystem", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $12)
         on conflict do nothing`,
        [randomUUID(), user.tenantId, objectId, item.name, item.icon, item.color, item.defaultOutcome, item.defaultSLA, item.order, item.systemKey ?? null, !!item.systemKey, now],
      );
    }
    if (missing.length) data = await fetchTypes();
  }

  return data.map((item) => ({ ...item, isSystem: !!item.isSystem, defaultSLA: item.defaultSLA ?? null, description: null }));
}

// The id of a system activity type, created on first use. If a hand-made type already has the
// name (one the 0141 rename couldn't move), the system type is called "<name> (system)".
export async function ensureSystemActivityType(user: TenantUser, key: SystemActivityKey, client?: Queryable) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const lookup = () => queryOne<{ id: string }>(`select id from "ActivityType" where "tenantId" = $1 and "systemKey" = $2 limit 1`, [user.tenantId, key], client);
  const existing = await lookup();
  if (existing) return existing.id;
  const definition = SYSTEM_ACTIVITY_TYPES[key];
  const objectId = await getObjectId(user, client);
  for (const name of [definition.name, `${definition.name} (system)`]) {
    const created = await queryOne<{ id: string }>(
      `insert into "ActivityType" (id, "tenantId", "objectId", name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "systemKey", "isSystem", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, 'SUCCESS', null, 100, true, $7, true, now(), now())
       on conflict do nothing
       returning id`,
      [randomUUID(), user.tenantId, objectId, name, definition.icon, definition.color, key],
      client,
    );
    if (created) return created.id;
    // Another request may have created it a moment ago.
    const winner = await lookup();
    if (winner) return winner.id;
  }
  throw new Error("ACTIVITY_TYPE_INSERT_FAILED");
}

async function activityTypeOf(user: TenantUser, typeId: unknown, client?: Queryable) {
  if (!typeId) return null;
  return queryOne<{ id: string; isSystem: boolean; systemKey: string | null }>(
    `select id, "isSystem", "systemKey" from "ActivityType" where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'} limit 1`,
    user.tenantId ? [String(typeId), user.tenantId] : [String(typeId)],
    client,
  );
}

// Activities of system types are created by the CRM only (decision 9).
export async function assertActivityTypeSelectable(user: TenantUser, typeId: unknown) {
  const type = await activityTypeOf(user, typeId);
  if (!type) throw new Error("ACTIVITY_TYPE_NOT_FOUND");
  if (type.isSystem) throw new Error("ACTIVITY_TYPE_SYSTEM");
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
  const [types, users, leads, opportunities, audits, opportunityTypes, customValues] = await Promise.all([
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
    user.tenantId ? loadCustomFieldValues(user.tenantId, "ACTIVITY", activityIds) : Object.assign(new Map<string, Record<string, unknown>>(), { labels: {} as Record<string, string> }),
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
    customFields: customValues.get(item.id) ?? {},
    customFieldLabels: Object.fromEntries(Object.keys(customValues.get(item.id) ?? {}).map((key) => [key, customValues.labels[key] ?? key])),
    type: typeMap.get(item.typeId),
    user: userMap.get(item.createdBy) ?? null,
    lead: item.leadId ? leadMap.get(item.leadId) ?? null : null,
    opportunity: item.opportunityId ? opportunityMap.get(item.opportunityId) ?? null : null,
    auditEvents: auditByActivityId.get(item.id) ?? [],
  }));
}

// "Select all N matching" (UI/UX plan B8): the ids of every record the list would show for these
// filters, under the same record access, so a bulk action changes exactly what the count said.
// At most `cap` ids; `truncated` says more match, and callers refuse rather than act on part.
// Whether this user can open the activity (the same access rule as the lists): used by notes
// and record history for an activity.
export async function isActivityVisibleForTenant(user: TenantUser, id: string) {
  const where = buildWhere(user, null);
  const row = await queryOne<{ id: string }>(`select id from "Activity" ${where.sql} and id = $${where.values.length + 1} limit 1`, where.values.concat([id]));
  return !!row;
}

export async function listActivityIdsForTenant(user: TenantUser, filters: ActivityFilterInput[] | ActivityFilterInput | null, cap = 5000) {
  const resolvedFilters = await substituteUserTokens(normalizeFilterGroups(filters) as ActivityFilterInput[], user);
  const where = buildWhere(user, resolvedFilters);
  const rows = await query<{ id: string }>(
    `select id from "Activity" ${where.sql} order by "createdAt" desc limit $${where.values.length + 1}`,
    where.values.concat([cap + 1]),
  );
  return { ids: rows.slice(0, cap).map((row) => row.id), truncated: rows.length > cap, cap };
}

// strictFilters: refuse a filter that can't be applied instead of skipping it (Smart Views).
export type ActivityListOptions = { search?: string | null; sort?: { id: string; desc: boolean } | null; strictFilters?: boolean; extraWhere?: { sql: string; values: unknown[] } | null };

// Whitelisted sort columns only; anything else is newest first.
const ACTIVITY_SORTS: Record<string, string> = {
  createdAt: '"createdAt"',
  dueAt: '"dueAt"',
  completedAt: '"completedAt"',
  outcome: "lower(outcome)",
  slaStatus: '"slaStatus"',
  type: '(select lower(t.name) from "ActivityType" t where t.id = "Activity"."typeId")',
};

// Notes, or the linked lead's name.
function applyActivitySearch(where: { sql: string; values: unknown[] }, search?: string | null) {
  const term = typeof search === "string" ? search.trim() : "";
  if (!term) return where;
  const values = [...where.values, `%${term}%`];
  const param = `$${values.length}`;
  const clause = `(notes ilike ${param} or exists (select 1 from "Lead" l where l.id = "Activity"."leadId" and l.name ilike ${param}))`;
  return { sql: where.sql ? `${where.sql} and ${clause}` : `where ${clause}`, values };
}

export async function listActivitiesForTenant(user: TenantUser, limit: number, filters: ActivityFilterInput[] | ActivityFilterInput | null, page = 1, options: ActivityListOptions = {}) {
  const currentLimit = Math.min(500, Math.max(1, Number.isFinite(limit) ? limit : 100));
  const currentPage = Math.max(1, Number.isFinite(page) ? page : 1);
  const offset = (currentPage - 1) * currentLimit;
  // "Current user/team tokens" -- see the matching comment in leads-postgres.ts's own
  // listLeadsForTenant.
  const resolvedFilters = await substituteUserTokens(normalizeFilterGroups(filters) as ActivityFilterInput[], user);
  if (options.strictFilters) assertFilterGroupsSupported(resolvedFilters, ACTIVITY_FILTER_COLUMNS);
  const where = appendWhere(applyActivitySearch(buildWhere(user, resolvedFilters), options.search), options.extraWhere);
  const sortExpression = options.sort?.id ? ACTIVITY_SORTS[options.sort.id] : undefined;
  const orderBy = sortExpression ? `${sortExpression} ${options.sort!.desc ? "desc" : "asc"} nulls last, "createdAt" desc` : '"createdAt" desc';
  const [countRow, activities] = await Promise.all([
    queryOne<{ count: number }>(`select count(*)::int as count from "Activity" ${where.sql}`, where.values),
    query<any>(
      `select ${ACTIVITY_COLUMNS} from "Activity" ${where.sql} order by ${orderBy} limit $${where.values.length + 1} offset $${where.values.length + 2}`,
      where.values.concat([currentLimit, offset]),
    ),
  ]);
  const total = countRow?.count ?? 0;
  const hydrated = await hydrateActivities(user, activities);
  return {
    data: hydrated.map((item) => maskActivityForUser(user, item)),
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

// Custom field values arrive as `data` (the record form) or `customFields` (the API), by field key.
// Fields the user's permission template marks hidden or read-only are dropped, as for core fields.
function customFieldInput(user: TenantUser, payload: Record<string, unknown>, typeId: string | null) {
  const value = payload.customFields ?? payload.data;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return sanitizeWritePayload(user, "activities", value as Record<string, unknown>, typeId).sanitized;
}

// `system`: the CRM itself is logging this (a call, a sent message, a page visit), so a system
// activity type is allowed. People, imports, automations and Next Best Action can't use one.
export async function createActivityForTenant(user: TenantUser, payload: Record<string, unknown>, options: { system?: boolean } = {}) {
  if (!options.system) await assertActivityTypeSelectable(user, payload.typeId);
  await assertActivityLinksAllowed(user, payload.leadId, payload.opportunityId);
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
  if (user.tenantId) await saveCustomFieldValues(user.tenantId, "ACTIVITY", activity.id, activity.typeId, customFieldInput(user, payload, activity.typeId));
  const [hydrated] = await hydrateActivities(user, [activity]);
  await createAuditLog(user, "CREATE", activity.id, null, hydrated, null);
  if (hydrated.leadId) {
    await runAutomationsForEvent(user, "ACTIVITY_CREATED", "ACTIVITY", hydrated.id, hydrated).catch(() => undefined);
  }
  if (hydrated.opportunityId) {
    await runAutomationsForEvent(user, "ACTIVITY_CREATED_ON_OPPORTUNITY", "ACTIVITY", hydrated.id, hydrated).catch(() => undefined);
  }
  await enqueueWebhookEvent(user.tenantId, "ACTIVITY_CREATED", hydrated).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, "ACTIVITY_CREATED", hydrated).catch(() => undefined);
  await refreshNbaForActivity(user, hydrated).catch(() => undefined);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  return maskActivityForUser(user, hydrated);
}

// Event-based NBA refresh (gap checklist: "worker job... plus event-based refresh on
// lead/opportunity/activity/task/communication/scoring changes") -- an Activity logged
// against a Lead/Opportunity is a real signal that record's recommendations may be stale
// (e.g. a just-logged call satisfies what a "call this lead" recommendation was suggesting).
// Dynamic import: next-best-action.ts already imports createActivityForTenant from this
// file, so a static import back would be circular.
async function refreshNbaForActivity(user: TenantUser, hydrated: { leadId?: string | null; opportunityId?: string | null }) {
  const { refreshNextBestActionsForRecord } = await import("@/lib/server/next-best-action");
  if (hydrated.leadId) await refreshNextBestActionsForRecord(user, "LEAD", hydrated.leadId);
  if (hydrated.opportunityId) await refreshNextBestActionsForRecord(user, "OPPORTUNITY", hydrated.opportunityId);
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
  // Same record access as the list: an activity outside the user's scope is "not found".
  const lookup = buildWhere(user, null);
  const existing = await queryOne<any>(
    `select ${ACTIVITY_COLUMNS} from "Activity" ${lookup.sql} and id = $${lookup.values.length + 1} limit 1`,
    [...lookup.values, id],
  );
  if (!existing) throw new Error("ACTIVITY_NOT_FOUND");

  // F03 fix: drop any field this user's permission template marks "readonly"/"hidden" for this
  // activity's type before it can influence the update (see field-permissions.ts).
  const { sanitized } = sanitizeWritePayload(user, "activities", payload, (payload.typeId as string | undefined) ?? existing.typeId);

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["typeId", "leadId", "opportunityId", "outcome", "notes", "dueAt", "completedAt", "slaStatus", "slaTarget"]) {
    if (sanitized[key] !== undefined) patch[key] = sanitized[key] || null;
  }
  // A system activity records what happened (decision 10): only its notes, custom fields and
  // whether it's done (Mark complete) can change. Fields sent back unchanged are fine.
  const currentType = await activityTypeOf(user, existing.typeId);
  if (currentType?.isSystem) {
    for (const key of Object.keys(patch)) {
      if (key === "updatedAt" || key === "notes" || key === "completedAt") continue;
      const before = existing[key] instanceof Date ? existing[key].toISOString() : existing[key] ?? null;
      const after = patch[key] instanceof Date ? (patch[key] as Date).toISOString() : patch[key] ?? null;
      const same = before === after || (before && after && new Date(String(before)).getTime() === new Date(String(after)).getTime() && !Number.isNaN(new Date(String(after)).getTime()));
      if (!same) throw new Error("ACTIVITY_SYSTEM_READ_ONLY");
      delete patch[key];
    }
  } else if ("typeId" in patch && patch.typeId !== existing.typeId) {
    await assertActivityTypeSelectable(user, patch.typeId);
  }
  if ("leadId" in patch || "opportunityId" in patch) {
    await assertActivityLinksAllowed(user, "leadId" in patch ? patch.leadId : existing.leadId, "opportunityId" in patch ? patch.opportunityId : existing.opportunityId);
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
  if (user.tenantId) await saveCustomFieldValues(user.tenantId, "ACTIVITY", activity.id, activity.typeId, customFieldInput(user, payload, activity.typeId));
  const [hydrated] = await hydrateActivities(user, [activity]);
  await createAuditLog(user, "UPDATE", activity.id, existing, activity, diff(existing, activity));
  if (hydrated.leadId) {
    await runAutomationsForEvent(user, "ACTIVITY_UPDATED", "ACTIVITY", hydrated.id, hydrated).catch(() => undefined);
  }
  if (hydrated.opportunityId) {
    await runAutomationsForEvent(user, "ACTIVITY_UPDATED_ON_OPPORTUNITY", "ACTIVITY", hydrated.id, hydrated).catch(() => undefined);
  }
  await enqueueWebhookEvent(user.tenantId, "ACTIVITY_UPDATED", hydrated).catch(() => undefined);
  await enqueueAppEvent(user.tenantId, "ACTIVITY_UPDATED", hydrated).catch(() => undefined);
  await refreshNbaForActivity(user, hydrated).catch(() => undefined);
  await invalidateReportRollupsForTenant(user.tenantId).catch(() => undefined);
  return maskActivityForUser(user, hydrated);
}

// Round-2 plan wave 3 (B1): counted in SQL over every activity the user can see (the newest 1,000
// before). Days are the workspace's calendar days, labelled as formatTenantDate does (DD/MM/YYYY).
export async function getActivityStatsForTenant(user: TenantUser) {
  const timeZone = await getTenantTimeZone(user.tenantId);
  const scoped = buildWhere(user, null);
  const tz = scoped.values.length + 1;
  const [typeRows, dayRows, types] = await Promise.all([
    query<{ typeId: string | null; count: number }>(
      `select "typeId", count(*)::int as count from "Activity" ${scoped.sql} group by "typeId" order by max("createdAt") desc`,
      scoped.values,
    ),
    query<{ day: string; count: number }>(
      `select to_char(("createdAt" at time zone $${tz})::date, 'DD/MM/YYYY') as day, count(*)::int as count from "Activity" ${scoped.sql} group by 1`,
      [...scoped.values, timeZone],
    ),
    listActivityTypesForTenant(user),
  ]);
  const typeMap = new Map(types.map((type: any) => [type.id, type.name]));
  const byTypeMap = new Map<string, number>();
  const trendMap = new Map<string, number>();
  for (const row of typeRows) {
    const typeName = String(typeMap.get(row.typeId) ?? "Unknown");
    byTypeMap.set(typeName, (byTypeMap.get(typeName) ?? 0) + row.count);
  }
  for (const row of dayRows) trendMap.set(row.day, row.count);
  return {
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })),
    trend: [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
  };
}

// ---- Sent messages as activities (decision 24, 2026-10-27) ---------------------------------------
// Every email, WhatsApp or SMS the CRM sends to a lead or opportunity is a locked activity of the
// matching system type. Its outcome follows the message: QUEUED, SENT, DELIVERED, READ, CLICKED,
// or FAILED / BOUNCED / NOT_SENT. Created straight in the database, without the "activity
// created" automations: an automation that sends a message on a new activity would otherwise
// trigger itself again for every message it sends.
const MESSAGE_TYPE_KEYS: Record<string, SystemActivityKey> = { EMAIL: "EMAIL", WHATSAPP: "WHATSAPP", SMS: "SMS" };
const MESSAGE_PROGRESS: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, CLICKED: 4 };
const MESSAGE_FAILURES = new Set(["FAILED", "BOUNCED", "NOT_SENT"]);

// A delivery event as an activity outcome (null: the event doesn't change it).
export function messageOutcomeForEvent(eventType: string) {
  const event = String(eventType ?? "").toUpperCase();
  if (event === "QUEUED" || event === "SENT" || event === "DELIVERED" || event === "CLICKED") return event;
  if (event === "OPENED" || event === "READ") return "READ";
  if (event === "SUPPRESSED") return "NOT_SENT";
  if (event === "BOUNCED" || event === "HARD_BOUNCE" || event === "SOFT_BOUNCE") return "BOUNCED";
  if (event === "FAILED" || event === "UNDELIVERED" || event === "REJECTED" || event === "DROPPED") return "FAILED";
  return null;
}

// Events arrive in any order: progress only moves forward, and a failure replaces progress
// unless the message was already read or clicked (proof it arrived).
export function nextMessageOutcome(current: string | null, incoming: string | null) {
  if (!incoming) return current;
  if (!current) return incoming;
  if (MESSAGE_FAILURES.has(current)) return current;
  if (MESSAGE_FAILURES.has(incoming)) return (MESSAGE_PROGRESS[current] ?? 0) >= MESSAGE_PROGRESS.READ ? current : incoming;
  return (MESSAGE_PROGRESS[incoming] ?? 0) > (MESSAGE_PROGRESS[current] ?? 0) ? incoming : current;
}

const MESSAGE_SOURCES: Record<string, string> = {
  MARKETING_CAMPAIGN: "campaign",
  AUTOMATION: "automation",
  JOURNEY: "journey",
};

export async function createMessageActivity(
  input: {
    tenantId: string; outboxId: string; channel: string; entityType: string | null; entityId: string | null;
    recipient: string; subject: string | null; body: string; status: string; sourceType: string | null; createdBy: string | null;
  },
  client?: Queryable,
) {
  const key = MESSAGE_TYPE_KEYS[String(input.channel).toUpperCase()];
  const entityType = String(input.entityType ?? "").toUpperCase();
  if (!key || !input.entityId || (entityType !== "LEAD" && entityType !== "OPPORTUNITY")) return null;
  const table = entityType === "LEAD" ? "Lead" : "Opportunity";
  // Who it's "by": the person who sent it, else the record's owner, else the workspace's first user
  // (an automation or campaign has no person; the activity needs a real user).
  const owner = await queryOne<{ recordId: string | null; userId: string | null }>(
    `select r.id as "recordId",
            coalesce((select id from "User" where id = $3 and "tenantId" = $1),
                     (select id from "User" where id = r."ownerId" and "tenantId" = $1),
                     (select id from "User" where "tenantId" = $1 order by "createdAt" asc limit 1)) as "userId"
       from "${table}" r where r.id = $2 and r."tenantId" = $1`,
    [input.tenantId, input.entityId, input.createdBy ?? ""],
    client,
  );
  if (!owner?.recordId || !owner.userId) return null;
  const actor = { id: owner.userId, tenantId: input.tenantId };
  const typeId = await ensureSystemActivityType(actor, key, client);
  const source = MESSAGE_SOURCES[String(input.sourceType ?? "")];
  const notes = [
    input.subject ? `Subject: ${input.subject}` : null,
    `To: ${input.recipient}`,
    source ? `Sent by ${source}` : null,
    "",
    input.body.length > 1000 ? `${input.body.slice(0, 1000)}…` : input.body,
  ].filter((line) => line !== null).join("\n");
  const activity = await queryOne<{ id: string }>(
    `insert into "Activity" (id, "tenantId", "objectId", "typeId", "leadId", "opportunityId", outcome, notes, "dueAt", "completedAt", "slaStatus", "slaTarget", "isRecurring", "recurrenceRule", "seriesId", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, null, now(), 'PENDING', null, false, null, null, $9, now(), now())
     returning id`,
    [
      randomUUID(), input.tenantId, await getObjectId(actor, client), typeId,
      entityType === "LEAD" ? input.entityId : null, entityType === "OPPORTUNITY" ? input.entityId : null,
      messageOutcomeForEvent(input.status) ?? "QUEUED", notes, owner.userId,
    ],
    client,
  );
  if (!activity) return null;
  await execute(`update "CommunicationOutbox" set "activityId" = $1 where id = $2 and "tenantId" = $3`, [activity.id, input.outboxId, input.tenantId], client);
  return activity.id;
}

// Moves a sent message's activity on with a delivery event. Provider webhooks don't know the
// outbox row, only the provider's message id, which the "SENT" event recorded.
export async function updateMessageActivityForEvent(
  tenantId: string, outboxId: string | null, providerMessageId: string | null, eventType: string, client?: Queryable,
) {
  const incoming = messageOutcomeForEvent(eventType);
  if (!incoming) return;
  let resolvedOutboxId = outboxId;
  if (!resolvedOutboxId && providerMessageId) {
    const sent = await queryOne<{ outboxId: string }>(
      `select "outboxId" from "CommunicationDeliveryEvent" where "tenantId" = $1 and "providerMessageId" = $2 and "outboxId" is not null limit 1`,
      [tenantId, providerMessageId],
      client,
    );
    resolvedOutboxId = sent?.outboxId ?? null;
  }
  if (!resolvedOutboxId) return;
  const current = await queryOne<{ activityId: string; outcome: string | null }>(
    `select a.id as "activityId", a.outcome from "CommunicationOutbox" o join "Activity" a on a.id = o."activityId" and a."tenantId" = o."tenantId"
      where o.id = $1 and o."tenantId" = $2`,
    [resolvedOutboxId, tenantId],
    client,
  );
  if (!current) return;
  const next = nextMessageOutcome(current.outcome, incoming);
  if (next === current.outcome) return;
  await execute(`update "Activity" set outcome = $1, "updatedAt" = now() where id = $2 and "tenantId" = $3`, [next, current.activityId, tenantId], client);
}
