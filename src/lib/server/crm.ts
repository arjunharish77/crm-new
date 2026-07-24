import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import * as pgActivities from "@/lib/repositories/activities-postgres";
import * as pgAutomations from "@/lib/repositories/automations-postgres";
import * as pgForms from "@/lib/repositories/forms-postgres";
import * as pgLeadLists from "@/lib/repositories/lead-lists-postgres";
import * as pgLeads from "@/lib/repositories/leads-postgres";
import * as pgOpportunities from "@/lib/repositories/opportunities-postgres";
import * as pgReportsDashboards from "@/lib/repositories/reports-dashboards-postgres";
import * as pgViews from "@/lib/repositories/views-postgres";
import { SmartViewTab } from "@/types/smart-views";
import { formatExportDateValue, formatTenantDate, getTenantTimeZone } from "@/lib/server/date-format";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  roleId?: string | null;
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

type NoteEntityType = "LEAD" | "OPPORTUNITY" | "ACTIVITY";

type DashboardWidgetInput = {
  title: string;
  type: string;
  config: Record<string, unknown>;
  layout?: {
    w?: number;
    h?: number;
    x?: number;
    y?: number;
  };
};

type SavedViewInput = {
  name: string;
  module: string;
  filters: Record<string, unknown>;
  tabs?: SmartViewTab[];
  scope?: "PRIVATE" | "SHARED" | "ROLE" | "TENANT_DEFAULT";
  isDefault?: boolean;
  isShared?: boolean;
  isPinned?: boolean;
  density?: "compact" | "comfortable" | "spacious";
  sort?: Record<string, unknown> | null;
  columns?: string[];
  groupBy?: string | null;
  quickActions?: string[];
  sharedUserIds?: string[];
  sharedTeamIds?: string[];
  sharedSalesGroupIds?: string[];
  sharedRoleIds?: string[];
};

type CustomReportInput = {
  name?: string;
  description?: string | null;
  module?: string;
  config?: Record<string, unknown>;
  chartType?: string;
  isPublic?: boolean;
  isActive?: boolean;
};

type LeadListInput = {
  name?: string;
  description?: string | null;
  type?: "STATIC" | "SMART";
  filters?: LeadFilterInput[] | null;
  leadIds?: string[];
};

type ImportModule = "LEAD" | "OPPORTUNITY" | "ACTIVITY";

type ImportMapping = {
  source: string;
  target: string;
};

type ImportInput = {
  module?: string;
  rows?: Record<string, unknown>[];
  mappings?: ImportMapping[];
  duplicateMode?: "SKIP" | "UPDATE" | "CREATE";
};

type WebhookInput = {
  name?: string;
  url?: string;
  events?: string[];
  secret?: string;
  isActive?: boolean;
};

type GlobalSearchResults = {
  leads: Array<{ id: string; type: "lead"; name: string; company: string | null }>;
  opportunities: Array<{ id: string; type: "opportunity"; title: string; amount: number | null }>;
  activities: Array<{ id: string; type: "activity"; notes: string | null }>;
};

export async function createAuditLog(
  user: TenantUser,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  diff: Record<string, unknown> | null
) {
  return pgLeads.createAuditLog(user, action, entityType, entityId, before, after, diff);
}

const AUDIT_SKIP_FIELDS = new Set([
  "tenantId",
  "objectId",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deletedBy",
  "hash",
  "type",
  "user",
  "lead",
  "opportunity",
  "duration",
  "assignedUserId",
]);

function auditValuesEqual(before: unknown, after: unknown) {
  return JSON.stringify(before ?? null) === JSON.stringify(after ?? null);
}

function asUuidOrNull(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function buildFieldDiff(before: Record<string, any> | null, after: Record<string, any> | null) {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    if (AUDIT_SKIP_FIELDS.has(key)) continue;
    const beforeValue = before?.[key] ?? null;
    const afterValue = after?.[key] ?? null;
    if (!auditValuesEqual(beforeValue, afterValue)) {
      diff[key] = { before: beforeValue, after: afterValue };
    }
  }
  return diff;
}

function fieldPermissionMap(user: TenantUser, module: "leads" | "opportunities" | "activities", typeId?: string | null) {
  const role = user.role && typeof user.role === "object" ? user.role : null;
  const legacy = role?.permissions?.fieldPermissions?.[module];
  const next: Record<string, string> = legacy && typeof legacy === "object" ? { ...(legacy as Record<string, string>) } : {};
  const baseScope = module === "leads" ? "lead" : module === "opportunities" ? "opportunity" : "activity";
  const typeScope = typeId && module !== "leads" ? `${baseScope}:${typeId}` : null;
  const templates = Array.isArray((user as any).permissionTemplates) ? (user as any).permissionTemplates : [];
  for (const template of templates) {
    const fieldPermissions = template?.permissions?.fieldPermissions;
    if (!fieldPermissions || typeof fieldPermissions !== "object") continue;
    const base = fieldPermissions[baseScope];
    const typed = typeScope ? fieldPermissions[typeScope] : null;
    if (base && typeof base === "object") Object.assign(next, base);
    if (typed && typeof typed === "object") Object.assign(next, typed);
  }
  return next;
}

function maskFieldsForUser<T extends Record<string, any>>(user: TenantUser, module: "leads" | "opportunities" | "activities", record: T): T {
  const permissions = fieldPermissionMap(user, module, record.opportunityTypeId ?? record.typeId ?? null);
  const masked: Record<string, any> = { ...record };
  for (const [field, access] of Object.entries(permissions)) {
    if (access === "hidden" && field in masked) {
      masked[field] = null;
      masked[`${field}Hidden`] = true;
    }
  }
  return masked as T;
}

function editablePayloadForUser(user: TenantUser, module: "leads" | "opportunities" | "activities", payload: Record<string, unknown>) {
  const permissions = fieldPermissionMap(user, module, String(payload.opportunityTypeId ?? payload.typeId ?? ""));
  const next = { ...payload };
  for (const [field, access] of Object.entries(permissions)) {
    if ((access === "hidden" || access === "readonly") && field in next) {
      delete next[field];
    }
  }
  return next;
}

function normalizeEntityType(entityType: string) {
  return entityType.toUpperCase() as NoteEntityType;
}

export function schedulePredictiveScoreRefresh(
  user: TenantUser,
  targetModules: Array<"LEAD" | "OPPORTUNITY">
) {
  if (!user.tenantId || targetModules.length === 0) return;
  void import("@/lib/server/self-learning-scoring")
    .then(({ recomputeSelfLearningScoresForTenant }) =>
      recomputeSelfLearningScoresForTenant(user, { targetModules })
    )
    .catch(() => undefined);
}

function valueAtPath(record: Record<string, unknown>, field: string) {
  const scoringAliases: Record<string, string> = {
    scoreBand: "predictiveScore.scoreBand",
    scoreValue: "predictiveScore.conversionProbability",
    confidence: "predictiveScore.confidence",
    stallRisk: "predictiveScore.stallRisk",
    conversionProbability: "predictiveScore.conversionProbability",
    winProbability: "predictiveScore.winProbability",
  };
  const parts = field.split(".");
  if (parts.length > 1) {
    const scoped = parts[0].toUpperCase();
    if (!record[parts[0]] && ["LEAD", "OPPORTUNITY", "ACTIVITY"].includes(scoped)) {
      return valueAtPath(record, parts.slice(1).join("."));
    }
  }
  if (scoringAliases[field]) {
    return valueAtPath(record, scoringAliases[field]);
  }
  return field.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, record);
}

export function automationConditionMatches(record: Record<string, unknown>, nodeData: Record<string, unknown>): boolean {
  const conditions = Array.isArray(nodeData.conditions) ? nodeData.conditions : [];
  if (conditions.length > 0) {
    const logic = String(nodeData.conditionLogic ?? nodeData.logic ?? "AND").toUpperCase();
    const checks: boolean[] = conditions.map((condition) => automationConditionMatches(record, condition as Record<string, unknown>));
    return logic === "OR" ? checks.some(Boolean) : checks.every(Boolean);
  }

  const actual = valueAtPath(record, String(nodeData.field ?? ""));
  const expected = nodeData.value;
  const operator = String(nodeData.operator ?? "equals");
  const expectedValues = Array.isArray(expected) ? expected.map(String) : [];

  if (!nodeData.field) return true;
  if (operator === "contains_data") return actual !== undefined && actual !== null && String(actual).length > 0;
  if (operator === "not_contains_data") return actual === undefined || actual === null || String(actual).length === 0;
  if ((operator === "equals" || operator === "in") && expectedValues.length > 0) return expectedValues.includes(String(actual ?? ""));
  if ((operator === "not_equals" || operator === "not_in") && expectedValues.length > 0) return !expectedValues.includes(String(actual ?? ""));
  if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "greater_than") return Number(actual) > Number(expected);
  if (operator === "less_than") return Number(actual) < Number(expected);
  if (operator === "greater_than_or_equal") return Number(actual) >= Number(expected);
  if (operator === "less_than_or_equal") return Number(actual) <= Number(expected);
  if (operator === "before") return new Date(String(actual)).getTime() < new Date(String(expected)).getTime();
  if (operator === "after") return new Date(String(actual)).getTime() > new Date(String(expected)).getTime();
  return String(actual ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
}

async function getObjectId(user: TenantUser, objectName: string) {
  const existing = await queryOne<{ id: string }>(
    `select id
     from "ObjectDefinition"
     where name = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}
     limit 1`,
    user.tenantId ? [objectName, user.tenantId] : [objectName],
  );
  if (existing?.id) return existing.id;

  const supportedObjects = new Map([
    ["lead", "Lead"],
    ["opportunity", "Opportunity"],
    ["activity", "Activity"],
  ]);
  const label = supportedObjects.get(objectName);
  if (!label) throw new Error(`Missing object definition for ${objectName}`);

  const now = new Date().toISOString();
  const created = await queryOne<{ id: string }>(
    `insert into "ObjectDefinition" (id, "tenantId", name, label, "isCustom", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, false, $5, $5)
     returning id`,
    [randomUUID(), user.tenantId, objectName, label, now],
  );
  if (!created?.id) throw new Error(`Missing object definition for ${objectName}`);
  return created.id;
}

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

export async function listLeadsForTenant(
  user: TenantUser,
  page: number,
  limit: number,
  filters: LeadFilterInput[] | null = null
) {
  return pgLeads.listLeadsForTenant(user, page, limit, filters);
}

async function countLeadsForTenant(user: TenantUser, filters: LeadFilterInput[] | null = null) {
  const result = await pgLeads.listLeadsForTenant(user, 1, 1, filters);
  return result.meta.total;
}

export async function createLeadForTenant(user: TenantUser, payload: Record<string, unknown>) {
  return pgLeads.createLeadForTenant(user, payload);
}

export async function getLeadForTenant(user: TenantUser, id: string) {
  return pgLeads.getLeadForTenant(user, id);
}

export async function updateLeadForTenant(
  user: TenantUser,
  id: string,
  payload: Record<string, unknown>
) {
  return pgLeads.updateLeadForTenant(user, id, editablePayloadForUser(user, "leads", payload));
}

export async function deleteLeadsForTenant(user: TenantUser, ids: string[]) {
  return pgLeads.deleteLeadsForTenant(user, ids);
}

export async function listOpportunityTypesForTenant(user: TenantUser) {
  return pgOpportunities.listOpportunityTypesForTenant(user);
}

export async function listObjectDefinitionsForTenant(user: TenantUser) {
  return query(
    `select id, name, label, description, "isCustom", "createdAt", "updatedAt"
     from "ObjectDefinition"
     where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
     order by label asc`,
    user.tenantId ? [user.tenantId] : [],
  );
}

export async function listOpportunitiesForTenant(user: TenantUser, limit: number) {
  return pgOpportunities.listOpportunitiesForTenant(user, limit);
}

export async function listOpportunitiesForTenantByType(
  user: TenantUser,
  limit: number,
  opportunityTypeId: string | null,
  filters: LeadFilterInput[] | null = null,
  page = 1
) {
  return pgOpportunities.listOpportunitiesForTenantByType(user, limit, opportunityTypeId, filters, page);
}

export async function getOpportunityForTenant(user: TenantUser, id: string) {
  return pgOpportunities.getOpportunityForTenant(user, id);
}

export async function createOpportunityForTenant(user: TenantUser, payload: Record<string, unknown>) {
  return pgOpportunities.createOpportunityForTenant(user, payload);
}

export async function getOpportunityHistoryForTenant(user: TenantUser, opportunityId: string) {
  return pgOpportunities.getOpportunityHistoryForTenant(user, opportunityId);
}

export async function listActivityTypesForTenant(user: TenantUser) {
  return pgActivities.listActivityTypesForTenant(user);
}

async function ensureSystemActivityType(user: TenantUser, name: string, icon: string, color: string) {
  const objectId = await getObjectId(user, "activity");
  const existing = await queryOne<{ id: string }>(
    `select id from "ActivityType" where name = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'} limit 1`,
    user.tenantId ? [name, user.tenantId] : [name],
  );
  if (existing?.id) return existing.id;

  const now = new Date().toISOString();
  const created = await queryOne<{ id: string }>(
    `insert into "ActivityType" (id, "tenantId", "objectId", name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, 'SUCCESS', null, 100, true, $7, $7)
     returning id`,
    [randomUUID(), user.tenantId, objectId, name, icon, color, now],
  );
  if (!created?.id) throw new Error("ACTIVITY_TYPE_INSERT_FAILED");
  return created.id;
}

export async function listActivitiesForTenant(
  user: TenantUser,
  limit: number,
  filters: ActivityFilterConfig | null,
  page = 1
) {
  return pgActivities.listActivitiesForTenant(user, limit, filters, page);
}

export async function createActivityForTenant(user: TenantUser, payload: Record<string, unknown>) {
  return pgActivities.createActivityForTenant(user, payload);
}

export async function updateActivityForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  return pgActivities.updateActivityForTenant(user, id, editablePayloadForUser(user, "activities", payload));
}

export async function getOpportunityStatsForTenant(user: TenantUser) {
  return pgOpportunities.getOpportunityStatsForTenant(user);
}

export async function getActivityStatsForTenant(user: TenantUser) {
  return pgActivities.getActivityStatsForTenant(user);
}

export async function getGovernanceHistoryForTenant(
  user: TenantUser,
  entityType: string,
  entityId: string
) {
  const normalizedType = entityType.toUpperCase();
  const data = await query<any>(
    `select id, action, before, after, diff, "createdAt", "userId"
     from "AuditLog"
     where "entityType" = $1 and "entityId" = $2 and ${user.tenantId ? '"tenantId" = $3' : '"tenantId" is null'}
     order by "createdAt" desc`,
    user.tenantId ? [normalizedType, entityId, user.tenantId] : [normalizedType, entityId],
  );

  const userIds = [...new Set(data.map((item) => item.userId).filter(Boolean))];
  const users = userIds.length
    ? await query<any>(
        `select id, name, email from "User" where id = any($1::text[]) and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
        user.tenantId ? [userIds, user.tenantId] : [userIds],
      )
    : [];
  const userMap = new Map(users.map((record) => [record.id, record]));
  const [opportunityTypes, activityTypes] = await Promise.all([
    listOpportunityTypesForTenant(user).catch(() => []),
    listActivityTypesForTenant(user).catch(() => []),
  ]);
  const stageMap = new Map(
    (opportunityTypes as any[]).flatMap((type) => (type.stages ?? []).map((stage: any) => [stage.id, stage.label || stage.name || stage.id]))
  );
  const opportunityTypeMap = new Map((opportunityTypes as any[]).map((type) => [type.id, type.name]));
  const activityTypeMap = new Map((activityTypes as any[]).map((type) => [type.id, type.name]));

  return data.map((item) => ({
    id: item.id,
    action: item.action,
    createdAt: item.createdAt,
    user: userMap.get(item.userId) ?? { name: "Unknown User", email: "" },
    valueLabels: {
      stages: Object.fromEntries(stageMap),
      opportunityTypes: Object.fromEntries(opportunityTypeMap),
      activityTypes: Object.fromEntries(activityTypeMap),
    },
    changes: {
      before: item.before,
      after: item.after,
      diff: item.diff,
    },
  }));
}

export async function listAuditLogsForTenant(
  user: TenantUser,
  filters?: { entityType?: string; entityId?: string; action?: string }
) {
  const values: unknown[] = [];
  const clauses = [user.tenantId ? (() => {
    values.push(user.tenantId);
    return `"tenantId" = $${values.length}`;
  })() : '"tenantId" is null'];
  if (filters?.entityType) {
    values.push(filters.entityType.toUpperCase());
    clauses.push(`"entityType" = $${values.length}`);
  }
  if (filters?.entityId) {
    values.push(filters.entityId);
    clauses.push(`"entityId" = $${values.length}`);
  }
  if (filters?.action) {
    values.push(filters.action.toUpperCase());
    clauses.push(`action = $${values.length}`);
  }

  const data = await query<any>(
    `select id, action, "entityType", "entityId", before, after, diff, metadata, "createdAt", "userId"
     from "AuditLog"
     where ${clauses.join(" and ")}
     order by "createdAt" desc
     limit 200`,
    values,
  );
  const userIds = [...new Set(data.map((item: any) => item.userId).filter(Boolean))];
  const users = userIds.length
    ? await query<any>(
        `select id, name, email from "User" where id = any($1::text[]) and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
        user.tenantId ? [userIds, user.tenantId] : [userIds],
      )
    : [];
  const userMap = new Map(users.map((record: any) => [record.id, record]));

  return data.map((item: any) => ({
    id: item.id,
    action: item.action,
    entityType: item.entityType,
    entityId: item.entityId,
    createdAt: item.createdAt,
    user: userMap.get(item.userId) ?? { name: "Unknown User", email: "" },
    changes: {
      before: item.before,
      after: item.after,
      diff: item.diff,
    },
    metadata: item.metadata,
  }));
}

export async function listNotesForTenant(
  user: TenantUser,
  entityType: string,
  entityId: string
) {
  const normalizedType = normalizeEntityType(entityType);
  const data = await query<any>(
    `select id, content, "authorId", "isPinned", "createdAt", "updatedAt"
     from "Note"
     where "entityType" = $1 and "entityId" = $2 and ${user.tenantId ? '"tenantId" = $3' : '"tenantId" is null'}
     order by "isPinned" desc, "createdAt" desc`,
    user.tenantId ? [normalizedType, entityId, user.tenantId] : [normalizedType, entityId],
  );
  const authorIds = [...new Set(data.map((item) => item.authorId).filter(Boolean))];
  const users = authorIds.length
    ? await query<any>(
        `select id, name, email from "User" where id = any($1::text[]) and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
        user.tenantId ? [authorIds, user.tenantId] : [authorIds],
      )
    : [];
  const userMap = new Map(users.map((item: any) => [item.id, item]));

  return data.map((item: any) => ({
    id: item.id,
    content: item.content,
    isPinned: item.isPinned ?? false,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    author: userMap.get(item.authorId) ?? { id: item.authorId, name: "Unknown User", email: "" },
  }));
}

export async function createNoteForTenant(
  user: TenantUser,
  entityType: string,
  entityId: string,
  content: string
) {
  const normalizedType = normalizeEntityType(entityType);
  const now = new Date().toISOString();
  const data = await queryOne<any>(
    `insert into "Note" (
       id, "tenantId", "entityType", "entityId", content, "authorId", mentions, "isPinned", "createdAt", "updatedAt"
     ) values ($1, $2, $3, $4, $5, $6, $7, false, $8, $8)
     returning id, content, "authorId", "isPinned", "createdAt", "updatedAt"`,
    [randomUUID(), user.tenantId, normalizedType, entityId, content, user.id, [], now],
  );
  if (!data) throw new Error("NOTE_CREATE_FAILED");

  await createAuditLog(user, "CREATE", "NOTE", data.id, null, data, null);

  return {
    ...data,
    author: { id: user.id, name: user.name ?? "Unknown User", email: user.email ?? "" },
  };
}

export async function updateNoteForTenant(user: TenantUser, noteId: string, content: string) {
  const data = await queryOne<any>(
    `update "Note"
     set content = $1, "updatedAt" = $2
     where id = $3 and "authorId" = $4 and ${user.tenantId ? '"tenantId" = $5' : '"tenantId" is null'}
     returning id, content, "authorId", "isPinned", "createdAt", "updatedAt"`,
    user.tenantId ? [content, new Date().toISOString(), noteId, user.id, user.tenantId] : [content, new Date().toISOString(), noteId, user.id],
  );
  if (!data) throw new Error("NOTE_NOT_FOUND");

  return {
    ...data,
    author: { id: user.id, name: user.name ?? "Unknown User", email: user.email ?? "" },
  };
}

export async function deleteNoteForTenant(user: TenantUser, noteId: string) {
  await execute(
    `delete from "Note"
     where id = $1 and "authorId" = $2 and ${user.tenantId ? '"tenantId" = $3' : '"tenantId" is null'}`,
    user.tenantId ? [noteId, user.id, user.tenantId] : [noteId, user.id],
  );
}

export async function toggleNotePinForTenant(user: TenantUser, noteId: string) {
  const existing = await queryOne<any>(
    `select id, "isPinned"
     from "Note"
     where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}
     limit 1`,
    user.tenantId ? [noteId, user.tenantId] : [noteId],
  );
  if (!existing) throw new Error("NOTE_NOT_FOUND");
  const data = await queryOne<any>(
    `update "Note"
     set "isPinned" = $1, "updatedAt" = $2
     where id = $3 and ${user.tenantId ? '"tenantId" = $4' : '"tenantId" is null'}
     returning id, content, "authorId", "isPinned", "createdAt", "updatedAt"`,
    user.tenantId ? [!existing.isPinned, new Date().toISOString(), noteId, user.tenantId] : [!existing.isPinned, new Date().toISOString(), noteId],
  );
  if (!data) throw new Error("NOTE_NOT_FOUND");

  return {
    ...data,
    author: { id: user.id, name: user.name ?? "Unknown User", email: user.email ?? "" },
  };
}

export async function listDashboardWidgetsForTenant(user: TenantUser) {
  return pgReportsDashboards.listDashboardWidgetsForTenant(user);
}

export async function createDashboardWidgetForTenant(user: TenantUser, input: DashboardWidgetInput) {
  return pgReportsDashboards.createDashboardWidgetForTenant(user, input);
}

export async function seedDashboardPresetForTenant(user: TenantUser, persona?: string | null) {
  const selectedPersona = normalizeDashboardPersona(user, persona);
  const existingWidgets = await listDashboardWidgetsForTenant(user);
  const existingTitles = new Set(existingWidgets.map((widget: any) => widget.title));
  const presets = getDashboardPresetWidgets(selectedPersona);
  const created = [];

  for (const preset of presets) {
    if (existingTitles.has(preset.title)) continue;
    created.push(await createDashboardWidgetForTenant(user, preset));
  }

  return {
    persona: selectedPersona,
    created,
    widgets: await listDashboardWidgetsForTenant(user),
  };
}

export async function updateDashboardWidgetForTenant(
  user: TenantUser,
  id: string,
  input: Partial<DashboardWidgetInput>
) {
  return pgReportsDashboards.updateDashboardWidgetForTenant(user, id, input);
}

export async function deleteDashboardWidgetForTenant(user: TenantUser, id: string) {
  return pgReportsDashboards.deleteDashboardWidgetForTenant(user, id);
}

export async function getDashboardWidgetForTenant(user: TenantUser, id: string) {
  return pgReportsDashboards.getDashboardWidgetForTenant(user, id);
}

export async function getDashboardWidgetDataForTenant(user: TenantUser, id: string) {
  const widget = await getDashboardWidgetForTenant(user, id);

  if (!widget) {
    return null;
  }

  const reportKey = String((widget.config as any)?.reportKey ?? "");
  if (reportKey) {
    return getReportBackedWidgetData(user, widget);
  }

  const moduleName = String((widget.config as any)?.module ?? "").toUpperCase();
  const metric = String((widget.config as any)?.metric ?? "COUNT").toUpperCase();

  if (widget.type === "STAT") {
    if (moduleName === "LEADS") {
      const leads = await listLeadsForTenant(user, 1, 500);
      return metric === "COUNT" ? leads.meta.total : leads.meta.total;
    }

    if (moduleName === "OPPORTUNITIES") {
      const opportunities = await listOpportunitiesForTenant(user, 500);
      return opportunities.data.filter((item: any) => {
        const stage = item.stage;
        const filters = (widget.config as any)?.filters?.stage;
        if (!filters) return true;
        if (filters.isWon === false && stage?.isWon) return false;
        if (filters.isLost === false && stage?.isClosed && !stage?.isWon) return false;
        return true;
      }).length;
    }

    if (moduleName === "ACTIVITIES") {
      const activities = await listActivitiesForTenant(user, 500, null);
      return activities.meta.total;
    }

    return 0;
  }

  if (widget.type === "FUNNEL") {
    const stats = await getOpportunityStatsForTenant(user);
    return stats.map((item) => ({ stage: item.stage, count: item.count, value: item.value }));
  }

  if (widget.type === "TREND") {
    const timeZone = await getTenantTimeZone(user.tenantId);
    if (moduleName === "ACTIVITIES") {
      const activityStats = await getActivityStatsForTenant(user);
      return activityStats.trend.map((item) => ({ group: item.date, value: item.count }));
    }

    const days = Array.from({ length: 7 }).map((_, index) => {
      const current = new Date();
      current.setDate(current.getDate() - (6 - index));
      return formatTenantDate(current, timeZone);
    });

    if (moduleName === "LEADS") {
      const leads = await listLeadsForTenant(user, 1, 500);
      const counts = new Map<string, number>();
      leads.data.forEach((item: any) => {
        const key = formatTenantDate(item.createdAt, timeZone);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return days.map((day) => ({ group: day, value: counts.get(day) ?? 0 }));
    }

    if (moduleName === "OPPORTUNITIES") {
      const opportunities = await listOpportunitiesForTenant(user, 500);
      const counts = new Map<string, number>();
      opportunities.data.forEach((item: any) => {
        const key = formatTenantDate(item.createdAt, timeZone);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return days.map((day) => ({ group: day, value: counts.get(day) ?? 0 }));
    }
  }

  if (widget.type === "BAR") {
    if (moduleName === "LEADS") {
      const leads = await listLeadsForTenant(user, 1, 500);
      const counts = new Map<string, number>();
      const groupBy = String((widget.config as any)?.groupBy ?? "status");
      leads.data.forEach((item: any) => {
        const key = groupBy === "source" ? item.source ?? "Unknown" : item.status ?? "Unknown";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return [...counts.entries()].map(([group, value]) => ({ group, value }));
    }

    if (moduleName === "OPPORTUNITIES") {
      const stats = await getOpportunityStatsForTenant(user);
      return stats.map((item) => ({ group: item.stage, value: item.count }));
    }

    if (moduleName === "ACTIVITIES") {
      const activityStats = await getActivityStatsForTenant(user);
      return activityStats.byType.map((item) => ({ group: item.type, value: item.count }));
    }
  }

  return [];
}

async function getReportBackedWidgetData(user: TenantUser, widget: any) {
  const reports = await import("@/lib/server/inbuilt-reports");
  const reportKey = String(widget.config?.reportKey ?? "");
  const metric = String(widget.config?.metric ?? "count");

  if (reportKey === "sla_response_breaches") {
    const report = await reports.getSlaResponseBreachReportForTenant(user, Number(widget.config?.thresholdHours ?? 24));
    if (widget.type === "STAT") return readPath(report, metric) ?? 0;
    return report.rows.map((row: any) => ({ group: row.ownerName, value: readPath(row, metric) ?? 0 }));
  }

  if (reportKey === "rep_performance") {
    const report = await reports.getRepPerformanceReportForTenant(user);
    if (widget.type === "STAT") return sumMetric(report.rows, metric);
    return report.rows.slice(0, Number(widget.config?.limit ?? 5)).map((row: any) => ({
      group: row.repName,
      value: readPath(row, metric) ?? 0,
    }));
  }

  if (reportKey === "reassignment_impact") {
    const report = await reports.getReassignmentImpactReportForTenant(user, Number(widget.config?.thresholdHours ?? 24));
    if (widget.type === "STAT") return readPath(report, metric) ?? sumMetric(report.rows, metric);
    return report.rows.map((row: any) => ({ group: row.bucket, value: readPath(row, metric) ?? 0 }));
  }

  if (reportKey === "activity_call_volume_trends") {
    const report = await reports.getActivityCallVolumeTrendReportForTenant(user, "day", null, null);
    if (widget.type === "STAT") return sumMetric(report.rows, metric);
    return report.rows.map((row: any) => ({ group: row.periodStart.slice(0, 10), value: readPath(row, metric) ?? 0 }));
  }

  if (reportKey === "commission_payout_summary") {
    const report = await reports.getCommissionPayoutSummaryReportForTenant(user);
    if (widget.type === "STAT") return readPath(report, metric) ?? 0;
    if (metric === "payoutStatusCounts") {
      return Object.entries(report.payoutStatusCounts).map(([group, value]) => ({ group, value }));
    }
    return report.rows.map((row: any) => ({ group: row.partnerName, value: readPath(row, metric) ?? 0 }));
  }

  if (reportKey === "data_quality") {
    const report = await reports.getDataQualityReportForTenant(user, Number(widget.config?.staleDays ?? 30));
    if (widget.type === "STAT") return readPath(report, metric) ?? 0;
    return report.issues.map((issue: any) => ({ group: issue.label, value: issue.count }));
  }

  if (reportKey === "predictive_scoring") {
    return getPredictiveScoringWidgetData(user, widget.type, metric);
  }

  return widget.type === "STAT" ? 0 : [];
}

async function getPredictiveScoringWidgetData(user: TenantUser, widgetType: string, metric: string) {
  const [leads, opportunities] = await Promise.all([
    listLeadsForTenant(user, 1, 5000),
    listOpportunitiesForTenant(user, 5000),
  ]);
  const leadScores = leads.data.map((lead: any) => lead.predictiveScore).filter(Boolean);
  const opportunityScores = opportunities.data.map((opportunity: any) => opportunity.predictiveScore).filter(Boolean);
  const allScores = [...leadScores, ...opportunityScores];

  const countByBand = (scores: any[]) => {
    const counts = new Map<string, number>([
      ["HOT", 0],
      ["WARM", 0],
      ["COLD", 0],
      ["RISK", 0],
    ]);
    for (const score of scores) counts.set(score.scoreBand, (counts.get(score.scoreBand) ?? 0) + 1);
    return [...counts.entries()].map(([group, value]) => ({ group, value }));
  };

  if (widgetType === "STAT") {
    if (metric === "hotLeads") return leadScores.filter((score: any) => score.scoreBand === "HOT").length;
    if (metric === "highRiskOpportunities") return opportunityScores.filter((score: any) => score.scoreBand === "RISK").length;
    if (metric === "staleHighFitLeads") {
      return leadScores.filter((score: any) => Number(score.fitScore ?? 0) >= 70 && Number(score.stallRisk ?? 0) >= 60).length;
    }
    if (metric === "avgConversionProbability") {
      return Math.round(leadScores.reduce((sum: number, score: any) => sum + Number(score.conversionProbability ?? 0), 0) / Math.max(1, leadScores.length));
    }
    return allScores.length;
  }

  if (metric === "opportunityScoreDistribution") return countByBand(opportunityScores);
  if (metric === "scoreToConversionPerformance") {
    return countByBand(leadScores).map((bucket) => {
      const scores = leadScores.filter((score: any) => score.scoreBand === bucket.group);
      const average = scores.reduce((sum: number, score: any) => sum + Number(score.conversionProbability ?? 0), 0) / Math.max(1, scores.length);
      return { group: bucket.group, value: Math.round(average) };
    });
  }
  return countByBand(leadScores);
}

function readPath(source: any, path: string) {
  return path.split(".").reduce((current, key) => current?.[key], source);
}

function sumMetric(rows: any[], metric: string) {
  return rows.reduce((sum, row) => sum + Number(readPath(row, metric) ?? 0), 0);
}

function normalizeDashboardPersona(user: TenantUser, persona?: string | null) {
  const requested = String(persona ?? "").toLowerCase();
  if (["admin", "manager", "rep", "partner"].includes(requested)) return requested;
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  if ((user as any).isPartner || rolePermissions?.isPartnerRole) return "partner";
  if ((user as any).isTenantAdmin || rolePermissions?.recordAccess === "ALL" || rolePermissions?.modules?.admin === "full") return "admin";
  if (rolePermissions?.recordAccess === "TEAM") return "manager";
  return "rep";
}

function getDashboardPresetWidgets(persona: string): DashboardWidgetInput[] {
  const presets: Record<string, DashboardWidgetInput[]> = {
    admin: [
      { title: "Org-wide Funnel", type: "FUNNEL", config: { opportunityTypeId: null }, layout: { w: 2, h: 1, x: 0, y: 0 } },
      { title: "Source-wise Lead Volume", type: "BAR", config: { module: "LEADS", metric: "COUNT", groupBy: "source" }, layout: { w: 2, h: 1, x: 0, y: 1 } },
      { title: "SLA Breaches", type: "STAT", config: { reportKey: "sla_response_breaches", metric: "totals.responseBreaches", thresholdHours: 24 }, layout: { w: 1, h: 1, x: 0, y: 2 } },
      { title: "Rep Wins", type: "BAR", config: { reportKey: "rep_performance", metric: "wonOpportunities", limit: 5 }, layout: { w: 2, h: 1, x: 0, y: 3 } },
      { title: "Data Quality Flags", type: "BAR", config: { reportKey: "data_quality", metric: "issues", staleDays: 14 }, layout: { w: 2, h: 1, x: 0, y: 4 } },
      { title: "Reassignment Impact", type: "BAR", config: { reportKey: "reassignment_impact", metric: "wonConversionRate" }, layout: { w: 2, h: 1, x: 0, y: 5 } },
    ],
    manager: [
      { title: "Team Opportunity Funnel", type: "FUNNEL", config: { opportunityTypeId: null }, layout: { w: 2, h: 1, x: 0, y: 0 } },
      { title: "Team Activity Volume", type: "BAR", config: { module: "ACTIVITIES", metric: "COUNT" }, layout: { w: 2, h: 1, x: 0, y: 1 } },
      { title: "Rep Activity Comparison", type: "BAR", config: { reportKey: "rep_performance", metric: "activitiesCreated", limit: 5 }, layout: { w: 2, h: 1, x: 0, y: 2 } },
      { title: "Team Reassignment Impact", type: "BAR", config: { reportKey: "reassignment_impact", metric: "wonConversionRate" }, layout: { w: 2, h: 1, x: 0, y: 3 } },
      { title: "Overdue Follow-ups", type: "STAT", config: { reportKey: "activity_call_volume_trends", metric: "overdue" }, layout: { w: 1, h: 1, x: 0, y: 4 } },
    ],
    rep: [
      { title: "My Leads", type: "STAT", config: { module: "LEADS", metric: "COUNT" }, layout: { w: 1, h: 1, x: 0, y: 0 } },
      { title: "My Conversion", type: "STAT", config: { reportKey: "rep_performance", metric: "conversionRate" }, layout: { w: 1, h: 1, x: 1, y: 0 } },
      { title: "My Follow-ups Due", type: "STAT", config: { reportKey: "activity_call_volume_trends", metric: "overdue" }, layout: { w: 1, h: 1, x: 2, y: 0 } },
      { title: "My Activity Trend", type: "TREND", config: { reportKey: "activity_call_volume_trends", metric: "activities" }, layout: { w: 2, h: 1, x: 0, y: 1 } },
    ],
    partner: [
      { title: "My Referred Leads", type: "STAT", config: { module: "LEADS", metric: "COUNT" }, layout: { w: 1, h: 1, x: 0, y: 0 } },
      { title: "My Commission Total", type: "STAT", config: { reportKey: "commission_payout_summary", metric: "totals.netCommission" }, layout: { w: 1, h: 1, x: 1, y: 0 } },
      { title: "My Payout History", type: "BAR", config: { reportKey: "commission_payout_summary", metric: "payoutStatusCounts" }, layout: { w: 2, h: 1, x: 0, y: 1 } },
      { title: "My Lead Status", type: "BAR", config: { module: "LEADS", metric: "COUNT", groupBy: "status" }, layout: { w: 2, h: 1, x: 0, y: 2 } },
    ],
  };

  return presets[persona] ?? presets.rep;
}

export async function listFormsForTenant(user: TenantUser) {
  return pgForms.listFormsForTenant(user);
}

export async function listAvailableFormsForPlacement(user: TenantUser, placement: string) {
  return pgForms.listAvailableFormsForPlacement(user, placement);
}

export async function createFormForTenant(user: TenantUser, payload: Record<string, unknown>) {
  return pgForms.createFormForTenant(user, payload);
}

export async function getFormForTenant(user: TenantUser, formId: string) {
  return pgForms.getFormForTenant(user, formId);
}

export async function updateFormForTenant(user: TenantUser, formId: string, payload: Record<string, unknown>) {
  return pgForms.updateFormForTenant(user, formId, payload);
}

export async function deleteFormForTenant(user: TenantUser, formId: string) {
  return pgForms.deleteFormForTenant(user, formId);
}

export async function getPublicForm(identifier: string) {
  return pgForms.getPublicForm(identifier);
}

export async function submitPublicForm(identifier: string, payload: Record<string, unknown>) {
  return pgForms.submitPublicForm(identifier, payload);
}

export async function getFormStatsForTenant(user: TenantUser, formId: string) {
  return pgForms.getFormStatsForTenant(user, formId);
}

export async function getFormSubmissionsForTenant(user: TenantUser, formId: string, limit: number, offset: number) {
  return pgForms.getFormSubmissionsForTenant(user, formId, limit, offset);
}

export async function exportFormSubmissionsForTenant(user: TenantUser, formId: string) {
  return pgForms.exportFormSubmissionsForTenant(user, formId);
}

export async function getLeadsReportForTenant(user: TenantUser) {
  const leads = await listLeadsForTenant(user, 1, 500);
  const bySource = new Map<string, number>();
  leads.data.forEach((item: any) => {
    const key = item.source || "Unknown";
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  });
  return {
    total: leads.meta.total,
    bySource: [...bySource.entries()].map(([source, count]) => ({ source, count })),
  };
}

export async function getOpportunitiesReportForTenant(user: TenantUser) {
  const opportunities = await listOpportunitiesForTenant(user, 500);
  const byStage = new Map<string, { stage: string; count: number; value: number }>();
  let totalRevenue = 0;
  opportunities.data.forEach((item: any) => {
    const key = item.stage?.name || "Unassigned";
    const current = byStage.get(key) ?? { stage: key, count: 0, value: 0 };
    current.count += 1;
    current.value += Number(item.amount ?? 0);
    totalRevenue += Number(item.amount ?? 0);
    byStage.set(key, current);
  });
  return {
    total: opportunities.meta.total,
    totalRevenue,
    byStage: [...byStage.values()],
  };
}

export async function getActivitiesReportForTenant(user: TenantUser) {
  const activities = await listActivitiesForTenant(user, 500, null);
  return {
    total: activities.meta.total,
    byType: (await getActivityStatsForTenant(user)).byType,
  };
}

export async function listCustomReportsForTenant(user: TenantUser) {
  return pgReportsDashboards.listCustomReportsForTenant(user);
}

export async function createCustomReportForTenant(user: TenantUser, input: CustomReportInput) {
  return pgReportsDashboards.createCustomReportForTenant(user, input);
}

export async function updateCustomReportForTenant(user: TenantUser, reportId: string, input: CustomReportInput) {
  return pgReportsDashboards.updateCustomReportForTenant(user, reportId, input);
}

export async function deleteCustomReportForTenant(user: TenantUser, reportId: string) {
  return pgReportsDashboards.deleteCustomReportForTenant(user, reportId);
}

export async function exportCustomReportForTenant(user: TenantUser, reportId: string) {
  const data = await pgReportsDashboards.getCustomReportForTenant(user, reportId);
  if (!data) return "id,name\n";
  const timeZone = await getTenantTimeZone(user.tenantId);

  const queryDefinition = (data.config as any)?.queryDefinition;
  if (queryDefinition?.root && Array.isArray(queryDefinition?.fields)) {
    const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
    const result = await executeReportQueryForTenant(user, queryDefinition);
    const headers = result.columns.map((column) => column.label || column.key);
    const keys = result.columns.map((column) => column.key);
    return [
      headers.map((header) => csvValue(header, timeZone)).join(","),
      ...result.rows.map((row) => keys.map((key) => csvValue(row[key], timeZone)).join(",")),
    ].join("\n");
  }

  return exportSummaryReportRows(user, data.module, timeZone);
}

async function exportSummaryReportRows(user: TenantUser, module: string, timeZone: string) {
  let rows: Array<Record<string, unknown>> = [];
  const moduleName = String(module).toUpperCase();
  if (moduleName === "LEADS") {
    const report = await getLeadsReportForTenant(user);
    rows = report.bySource.map((item) => ({ source: item.source, count: item.count }));
  } else if (moduleName === "OPPORTUNITIES") {
    const report = await getOpportunitiesReportForTenant(user);
    rows = report.byStage.map((item) => ({ stage: item.stage, count: item.count, value: item.value }));
  } else if (moduleName === "ACTIVITIES") {
    const report = await getActivitiesReportForTenant(user);
    rows = report.byType.map((item: any) => ({ type: item.type, count: item.count }));
  }

  if (rows.length === 0) return "id,name\n";
  const headers = Object.keys(rows[0]);
  return [headers.map((header) => csvValue(header, timeZone)).join(","), ...rows.map((row) => headers.map((key) => csvValue(row[key], timeZone)).join(","))].join("\n");
}

function csvValue(value: unknown, timeZone: string) {
  if (value === null || value === undefined) return "";
  const formattedValue = formatExportDateValue(value, timeZone);
  const normalized = Array.isArray(formattedValue) ? formattedValue.join("; ") : typeof formattedValue === "object" ? JSON.stringify(formattedValue) : String(formattedValue);
  return `"${normalized.replace(/"/g, '""')}"`;
}

export async function listSavedViewsForTenant(user: TenantUser, module: string) {
  return pgViews.listSavedViewsForTenant(user, module);
}

export async function createSavedViewForTenant(user: TenantUser, input: SavedViewInput) {
  return pgViews.createSavedViewForTenant(user, input);
}

export async function updateSavedViewForTenant(user: TenantUser, id: string, input: Partial<SavedViewInput>) {
  return pgViews.updateSavedViewForTenant(user, id, input);
}

export async function cloneSavedViewForTenant(user: TenantUser, id: string) {
  return pgViews.cloneSavedViewForTenant(user, id);
}

export async function deleteSavedViewForTenant(user: TenantUser, id: string) {
  return pgViews.deleteSavedViewForTenant(user, id);
}

export async function listLeadListsForTenant(user: TenantUser) {
  return pgLeadLists.listLeadListsForTenant(user);
}

export async function createLeadListForTenant(user: TenantUser, input: LeadListInput) {
  const list = await pgLeadLists.createLeadListForTenant(user, input);
  await createAuditLog(user, "CREATE", "LEAD_LIST", list.id, null, list, null).catch((auditError) => {
    console.error("Lead list audit log failed", auditError);
  });
  return list;
}

export async function getLeadListForTenant(user: TenantUser, id: string) {
  return pgLeadLists.getLeadListForTenant(user, id);
}

export async function addLeadsToLeadListForTenant(user: TenantUser, id: string, leadIds: string[]) {
  const list = await pgLeadLists.addLeadsToLeadListForTenant(user, id, leadIds);
  const addedLeadIds = Array.isArray((list as any).addedLeadIds) ? (list as any).addedLeadIds : [];
  await createAuditLog(user, "UPDATE", "LEAD_LIST", id, null, null, { addedLeadIds }).catch((auditError) => {
    console.error("Lead list audit log failed", auditError);
  });
  for (const leadId of addedLeadIds) {
    await runAutomationsForEvent(user, "LEAD_ADDED_TO_LIST", "LEAD", leadId, { id: leadId, leadId, listId: id });
  }
  return list;
}

export async function removeLeadFromLeadListForTenant(user: TenantUser, id: string, leadId: string) {
  await pgLeadLists.removeLeadFromLeadListForTenant(user, id, leadId);
  await createAuditLog(user, "UPDATE", "LEAD_LIST", id, null, null, { removedLeadId: leadId }).catch((auditError) => {
    console.error("Lead list audit log failed", auditError);
  });
}

export async function ingestWebsiteVisitForTenant(input: Record<string, unknown>) {
  const tenantId = String(input.tenantId ?? "");
  if (!tenantId) throw new Error("TENANT_ID_REQUIRED");
  const trackingUser = await queryOne<any>(
    `select id, name, email, "tenantId"
     from "User"
     where "tenantId" = $1
     limit 1`,
    [tenantId],
  );
  const user: TenantUser = trackingUser ?? { id: "website-tracker", tenantId };
  const email = typeof input.email === "string" ? input.email.toLowerCase() : "";
  const leadId = typeof input.leadId === "string" ? input.leadId : "";
  let lead: any = null;
  if (leadId) {
    lead = await queryOne<any>(
      `select id, name, email from "Lead" where "tenantId" = $1 and id = $2 limit 1`,
      [tenantId, leadId],
    );
  }
  if (!lead && email) {
    lead = await queryOne<any>(
      `select id, name, email from "Lead" where "tenantId" = $1 and lower(email) = $2 limit 1`,
      [tenantId, email],
    );
  }
  if (!lead?.id) return { tracked: false, reason: "NO_MATCHING_LEAD" };

  const typeId = await ensureSystemActivityType(user, "Page Visit", "Globe", "#0ea5e9");
  const pageUrl = String(input.url ?? "");
  const title = input.title ? String(input.title) : "Website visit";
  const referrer = input.referrer ? `\nReferrer: ${input.referrer}` : "";
  const notes = `${title}${pageUrl ? `\n${pageUrl}` : ""}${referrer}`;
  const activity = await createActivityForTenant(user, {
    typeId,
    leadId: lead.id,
    outcome: "SUCCESS",
    notes,
  });
  return { tracked: true, activityId: activity.id, leadId: lead.id };
}

function normalizeImportModule(module: string | undefined): ImportModule {
  const normalized = String(module ?? "").toUpperCase();
  if (normalized === "LEAD" || normalized === "OPPORTUNITY" || normalized === "ACTIVITY") return normalized;
  throw new Error("UNSUPPORTED_IMPORT_MODULE");
}

function mapImportRow(row: Record<string, unknown>, mappings: ImportMapping[] | undefined) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return Object.fromEntries(Object.entries(row).filter(([key, value]) => key.trim() && value !== ""));
  }

  const mapped: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (!mapping.source || !mapping.target) continue;
    const value = row[mapping.source];
    if (value !== undefined && value !== "") mapped[mapping.target] = value;
  }
  return mapped;
}

async function findDuplicateForImport(user: TenantUser, module: ImportModule, payload: Record<string, unknown>) {
  if (module === "LEAD" && payload.email) {
    const row = await queryOne<{ id: string }>(
      `select id from "Lead"
       where email = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}
       limit 1`,
      user.tenantId ? [String(payload.email), user.tenantId] : [String(payload.email)],
    );
    return row?.id ?? null;
  }
  if (module === "OPPORTUNITY" && payload.leadId && payload.title) {
    const row = await queryOne<{ id: string }>(
      `select id from "Opportunity"
       where "leadId" = $1 and title = $2 and ${user.tenantId ? '"tenantId" = $3' : '"tenantId" is null'}
       limit 1`,
      user.tenantId ? [String(payload.leadId), String(payload.title), user.tenantId] : [String(payload.leadId), String(payload.title)],
    );
    return row?.id ?? null;
  }
  if (module === "ACTIVITY" && payload.leadId && payload.typeId && payload.dueAt) {
    const row = await queryOne<{ id: string }>(
      `select id from "Activity"
       where "leadId" = $1 and "typeId" = $2 and "dueAt" = $3 and ${user.tenantId ? '"tenantId" = $4' : '"tenantId" is null'}
       limit 1`,
      user.tenantId
        ? [String(payload.leadId), String(payload.typeId), String(payload.dueAt), user.tenantId]
        : [String(payload.leadId), String(payload.typeId), String(payload.dueAt)],
    );
    return row?.id ?? null;
  }

  return null;
}

async function updateImportedRecord(user: TenantUser, module: ImportModule, id: string, payload: Record<string, unknown>) {
  const table = module === "LEAD" ? "Lead" : module === "OPPORTUNITY" ? "Opportunity" : "Activity";
  const allowedFields = new Set(
    module === "LEAD"
      ? ["name", "email", "phone", "company", "source", "status", "ownerId"]
      : module === "OPPORTUNITY"
        ? ["title", "amount", "expectedCloseDate", "priority", "stageId", "ownerId"]
        : ["outcome", "notes", "dueAt", "completedAt", "opportunityId"]
  );
  const updatePayload = Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => allowedFields.has(key) && value !== undefined)
  );
  if (Object.keys(updatePayload).length === 0) return { id, updated: false };

  const values: unknown[] = [];
  const assignments = Object.entries({ ...updatePayload, updatedAt: new Date().toISOString() }).map(([key, value]) => {
    values.push(value);
    return `"${key}" = $${values.length}`;
  });
  values.push(id);
  const idIndex = values.length;
  const tenantClause = user.tenantId ? (() => {
    values.push(user.tenantId);
    return `"tenantId" = $${values.length}`;
  })() : '"tenantId" is null';
  const data = await queryOne<{ id: string }>(
    `update "${table}" set ${assignments.join(", ")} where id = $${idIndex} and ${tenantClause} returning id`,
    values,
  );
  if (!data) throw new Error("IMPORT_UPDATE_TARGET_NOT_FOUND");
  await createAuditLog(user, "UPDATE", module, id, null, null, updatePayload);
  return { id: data.id, updated: true };
}

async function createImportedRecord(user: TenantUser, module: ImportModule, payload: Record<string, unknown>) {
  if (module === "LEAD") return createLeadForTenant(user, payload);
  if (module === "OPPORTUNITY") return createOpportunityForTenant(user, payload);
  return createActivityForTenant(user, payload);
}

export async function listImportJobsForTenant(user: TenantUser) {
  return query(
    `select id, module, "filePath", status, stats, errors, "createdAt", "userId"
     from "ImportJob"
     where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
     order by "createdAt" desc
     limit 50`,
    user.tenantId ? [user.tenantId] : [],
  );
}

export async function runImportForTenant(user: TenantUser, input: ImportInput) {
  const importModule = normalizeImportModule(input.module);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const duplicateMode = input.duplicateMode === "UPDATE" || input.duplicateMode === "CREATE" ? input.duplicateMode : "SKIP";
  const now = new Date().toISOString();
  const jobId = randomUUID();
  const rowErrors: Array<{ row: number; message: string }> = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  await execute(
    `insert into "ImportJob" (
       id, "tenantId", "userId", module, "filePath", status, mapping, stats, errors, "createdAt", "updatedAt"
     ) values ($1, $2, $3, $4, null, 'PROCESSING', $5, $6, $7, $8, $8)`,
    [
      jobId,
      user.tenantId,
      user.id,
      importModule,
      { fields: input.mappings ?? [], duplicateMode },
      { total: rows.length, processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
      [],
      now,
    ],
  );

  for (const [index, row] of rows.entries()) {
    try {
      const payload = mapImportRow(row, input.mappings);
      const duplicateId = await findDuplicateForImport(user, importModule, payload);
      if (duplicateId && duplicateMode === "SKIP") {
        skipped += 1;
        continue;
      }
      if (duplicateId && duplicateMode === "UPDATE") {
        await updateImportedRecord(user, importModule, duplicateId, payload);
        updated += 1;
        continue;
      }
      await createImportedRecord(user, importModule, payload);
      created += 1;
    } catch (error) {
      rowErrors.push({
        row: index + 1,
        message: error instanceof Error ? error.message : "Import failed",
      });
    }
  }

  const stats = {
    total: rows.length,
    processed: rows.length,
    created,
    updated,
    skipped,
    failed: rowErrors.length,
  };

  const data = await queryOne<any>(
    `update "ImportJob"
     set status = $1, stats = $2, errors = $3, "updatedAt" = $4
     where id = $5 and ${user.tenantId ? '"tenantId" = $6' : '"tenantId" is null'}
     returning id, module, "filePath", status, stats, errors, "createdAt", "userId"`,
    user.tenantId
      ? [rowErrors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED", stats, rowErrors, new Date().toISOString(), jobId, user.tenantId]
      : [rowErrors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED", stats, rowErrors, new Date().toISOString(), jobId],
  );
  if (!data) throw new Error("IMPORT_JOB_NOT_FOUND");
  await createAuditLog(user, "CREATE", "IMPORT_JOB", jobId, null, data, stats);
  return data;
}

export async function listWebhooksForTenant(user: TenantUser) {
  return query(
    `select id,
            coalesce(nullif(url, ''), 'Webhook') as name,
            url,
            events,
            "isActive",
            secret,
            "createdAt",
            "updatedAt"
     from "WebhookSubscription"
     where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
     order by "createdAt" desc`,
    user.tenantId ? [user.tenantId] : [],
  );
}

export async function createWebhookForTenant(user: TenantUser, input: WebhookInput) {
  const name = String(input.name ?? "").trim();
  const url = String(input.url ?? "").trim();
  if (!name || !url) throw new Error("WEBHOOK_NAME_URL_REQUIRED");
  const now = new Date().toISOString();
  const webhook = await queryOne<any>(
    `insert into "WebhookSubscription" (
       id, "tenantId", url, events, secret, "isActive", "createdAt", "updatedAt"
     ) values ($1, $2, $3, $4, $5, $6, $7, $7)
     returning id, coalesce(nullif(url, ''), 'Webhook') as name, url, events, "isActive", secret, "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      url,
      JSON.stringify(Array.isArray(input.events) && input.events.length > 0 ? input.events : ["LEAD_CREATED"]),
      input.secret ? String(input.secret) : null,
      input.isActive !== false,
      now,
    ],
  );
  if (!webhook) throw new Error("WEBHOOK_CREATE_FAILED");
  await createAuditLog(user, "CREATE", "WEBHOOK", webhook.id, null, webhook, null);
  return webhook;
}

export async function deleteWebhookForTenant(user: TenantUser, id: string) {
  await execute(
    `delete from "WebhookSubscription"
     where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
    user.tenantId ? [id, user.tenantId] : [id],
  );
  await createAuditLog(user, "DELETE", "WEBHOOK", id, null, null, null);
}

export async function getTelephonySettingsForTenant(user: TenantUser) {
  const data = await queryOne<any>(
    `select id, type, config, "isActive", "updatedAt"
     from "IntegrationSetting"
     where type = 'TELEPHONY' and ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
     limit 1`,
    user.tenantId ? [user.tenantId] : [],
  );
  return data ?? { type: "TELEPHONY", config: { provider: "", agentPopupUrl: "", clickToCallUrl: "" }, isActive: false };
}

export async function saveTelephonySettingsForTenant(user: TenantUser, config: Record<string, unknown>) {
  const now = new Date().toISOString();
  const existing = await getTelephonySettingsForTenant(user) as { id?: string };
  const data = existing.id
    ? await queryOne<any>(
        `update "IntegrationSetting"
         set config = $1, "isActive" = $2, "updatedBy" = $3, "updatedAt" = $4
         where id = $5 and ${user.tenantId ? '"tenantId" = $6' : '"tenantId" is null'}
         returning id, type, config, "isActive", "updatedAt"`,
        user.tenantId
          ? [config, Boolean(config.isActive), asUuidOrNull(user.id), now, existing.id, user.tenantId]
          : [config, Boolean(config.isActive), asUuidOrNull(user.id), now, existing.id],
      )
    : await queryOne<any>(
        `insert into "IntegrationSetting" (
           id, "tenantId", type, config, "isActive", "updatedBy", "createdAt", "updatedAt"
         ) values ($1, $2, 'TELEPHONY', $3, $4, $5, $6, $6)
         returning id, type, config, "isActive", "updatedAt"`,
        [randomUUID(), user.tenantId, config, Boolean(config.isActive), asUuidOrNull(user.id), now],
      );
  if (!data) throw new Error("TELEPHONY_SETTINGS_SAVE_FAILED");
  await createAuditLog(user, "UPDATE", "INTEGRATION_SETTING", data.id, null, data, { type: "TELEPHONY" });
  return data;
}

export async function listTelephonyCallLogsForTenant(user: TenantUser, limit = 100) {
  const currentLimit = Math.min(500, Math.max(1, Number.isFinite(limit) ? limit : 100));
  return query(
    `select id, provider, "callId", direction, "fromNumber", "toNumber", status, duration,
            "recordingUrl", "agentId", "leadId", "opportunityId", "activityId", metadata,
            "startedAt", "endedAt", "createdAt"
     from "TelephonyCallLog"
     where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
     order by "startedAt" desc
     limit ${currentLimit}`,
    user.tenantId ? [user.tenantId] : [],
  );
}

export async function createTelephonyCallLogForTenant(user: TenantUser, input: Record<string, unknown>) {
  const now = new Date().toISOString();
  const callTypeId = await ensureSystemActivityType(user, "Call", "Phone", "#3b82f6");
  let activityId: string | null = null;

  if (input.leadId || input.opportunityId) {
    const activity = await createActivityForTenant(user, {
      typeId: callTypeId,
      leadId: input.leadId,
      opportunityId: input.opportunityId,
      outcome: input.status === "completed" ? "SUCCESS" : input.status ?? null,
      notes: [
        input.direction ? `Direction: ${input.direction}` : null,
        input.fromNumber ? `From: ${input.fromNumber}` : null,
        input.toNumber ? `To: ${input.toNumber}` : null,
        input.duration ? `Duration: ${input.duration}s` : null,
        input.recordingUrl ? `Recording: ${input.recordingUrl}` : null,
      ].filter(Boolean).join("\n"),
    });
    activityId = activity.id;
  }

  const data = await queryOne<any>(
    `insert into "TelephonyCallLog" (
       id, "tenantId", provider, "callId", direction, "fromNumber", "toNumber", status, duration,
       "recordingUrl", "agentId", "leadId", "opportunityId", "activityId", metadata, "startedAt", "endedAt", "createdAt"
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     returning id, provider, "callId", direction, "fromNumber", "toNumber", status, duration,
               "recordingUrl", "agentId", "leadId", "opportunityId", "activityId", metadata,
               "startedAt", "endedAt", "createdAt"`,
    [
      randomUUID(),
      user.tenantId,
      input.provider ? String(input.provider) : "manual",
      input.callId ? String(input.callId) : randomUUID(),
      input.direction ? String(input.direction) : "OUTBOUND",
      input.fromNumber ? String(input.fromNumber) : null,
      input.toNumber ? String(input.toNumber) : null,
      input.status ? String(input.status) : "completed",
      input.duration == null ? null : Number(input.duration),
      input.recordingUrl ? String(input.recordingUrl) : null,
      input.agentId ? String(input.agentId) : user.id,
      asUuidOrNull(input.leadId),
      asUuidOrNull(input.opportunityId),
      asUuidOrNull(activityId),
      input.metadata ?? {},
      input.startedAt ? String(input.startedAt) : now,
      input.endedAt ? String(input.endedAt) : null,
      now,
    ],
  );
  if (!data) throw new Error("TELEPHONY_CALL_LOG_CREATE_FAILED");
  await createAuditLog(user, "CREATE", "TELEPHONY_CALL_LOG", data.id, null, data, null).catch(() => undefined);
  return data;
}

export async function buildClickToCallPayloadForTenant(user: TenantUser, input: Record<string, unknown>) {
  const settings = await getTelephonySettingsForTenant(user);
  const config = (settings as any)?.config ?? {};
  const phoneNumber = String(input.phoneNumber ?? input.toNumber ?? "");
  if (!phoneNumber) throw new Error("PHONE_NUMBER_REQUIRED");
  const leadId = input.leadId ? String(input.leadId) : null;
  let lead: any = null;
  if (leadId) {
    lead = await queryOne<any>(
      `select id, name, email, phone, company, "ownerId"
       from "Lead"
       where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}
       limit 1`,
      user.tenantId ? [leadId, user.tenantId] : [leadId],
    );
  }
  const replacements: Record<string, string> = {
    "@leadPhone": phoneNumber,
    "@LeadPhone": phoneNumber,
    "@phoneNumber": phoneNumber,
    "@AgentNumberWithoutCC": String((user as any).phone ?? config.defaultAgentNumber ?? config.outboundCallerId ?? ""),
    "@agentPhone": String((user as any).phone ?? config.defaultAgentNumber ?? config.outboundCallerId ?? ""),
    "@AgentEmail": user.email ?? "",
    "@agentEmail": user.email ?? "",
    "@LeadId": leadId ?? "",
    "@leadId": leadId ?? "",
    "@LeadName": lead?.name ?? "",
    "@leadName": lead?.name ?? "",
  };
  const merge = (value: unknown) => {
    let text = String(value ?? "");
    for (const [token, replacement] of Object.entries(replacements)) {
      text = text.split(token).join(replacement);
    }
    return text;
  };
  const method = String(config.clickToCallMethod ?? "POST").toUpperCase();
  const requestType = String(config.clickToCallRequestType ?? "JSON").toUpperCase();
  const url = merge(config.clickToCallUrl ?? "");
  const headers = {
    ...(requestType === "JSON" ? { "Content-Type": "application/json" } : {}),
    ...((Array.isArray(config.clickToCallHeaders) ? config.clickToCallHeaders : []) as any[]).reduce((acc, header) => {
      if (header?.key) acc[String(header.key)] = merge(header.value);
      return acc;
    }, {} as Record<string, string>),
  };
  const rawBody = config.clickToCallTemplate
    ? merge(config.clickToCallTemplate)
    : JSON.stringify({ phoneNumber, leadId, agentId: input.agentId ?? user.id });
  const body = method === "GET" ? undefined : rawBody;
  let providerResponse: Record<string, unknown> | null = null;
  let executed = false;
  let success = false;

  if (url && input.execute !== false) {
    executed = true;
    try {
      const response = await fetch(url, { method, headers, body });
      const responseText = await response.text();
      const responseKeyword = String(config.clickToCallResponseKeyword ?? "success").toLowerCase();
      success = response.ok && (!responseKeyword || responseText.toLowerCase().includes(responseKeyword));
      providerResponse = { status: response.status, ok: response.ok, body: responseText.slice(0, 2000) };
    } catch (error: any) {
      providerResponse = { error: error?.message ?? "Provider request failed" };
    }
  }

  return {
    provider: config.provider ?? "",
    clickToCallUrl: url,
    agentPopupUrl: config.agentPopupUrl ?? "",
    executed,
    success,
    providerResponse,
    request: { method, headers, body },
    payload: {
      agentId: input.agentId ?? user.id,
      phoneNumber,
      leadId,
      opportunityId: input.opportunityId ?? null,
      metadata: input.metadata ?? {},
    },
  };
}

export async function getAgentPopupContextForTenant(user: TenantUser, input: Record<string, unknown>) {
  const phone = String(input.phoneNumber ?? input.fromNumber ?? input.toNumber ?? "");
  let lead: any = null;
  if (phone) {
    lead = await queryOne<any>(
      `select id, name, email, phone, company, status, source, "ownerId"
       from "Lead"
       where phone = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}
       limit 1`,
      user.tenantId ? [phone, user.tenantId] : [phone],
    );
  }
  const opportunities = lead?.id ? await listOpportunitiesForTenant(user, 50) : { data: [] };
  return {
    lead: lead ? maskFieldsForUser(user, "leads", lead) : null,
    opportunities: (opportunities.data ?? []).filter((opportunity: any) => opportunity.leadId === lead?.id),
    recentCalls: phone ? (await listTelephonyCallLogsForTenant(user, 20)).filter((call: any) => call.fromNumber === phone || call.toNumber === phone) : [],
  };
}

export async function searchTenantData(user: TenantUser, term: string): Promise<GlobalSearchResults> {
  const normalized = term.trim();

  if (!normalized) {
    return { leads: [], opportunities: [], activities: [] };
  }

  const pattern = `%${normalized}%`;
  const tenantWhere = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
  const values = user.tenantId ? [pattern, user.tenantId] : [pattern];
  const [leads, opportunities, activities] = await Promise.all([
    query<any>(
      `select id, name, company
       from "Lead"
       where (name ilike $1 or email ilike $1 or company ilike $1) and ${tenantWhere}
       order by "updatedAt" desc
       limit 8`,
      values,
    ),
    query<any>(
      `select id, title, amount
       from "Opportunity"
       where title ilike $1 and ${tenantWhere}
       order by "updatedAt" desc
       limit 8`,
      values,
    ),
    query<any>(
      `select id, notes
       from "Activity"
       where notes ilike $1 and ${tenantWhere}
       order by "updatedAt" desc
       limit 8`,
      values,
    ),
  ]);

  return {
    leads: leads.map((item: any) => ({
      id: item.id,
      type: "lead" as const,
      name: item.name,
      company: item.company ?? null,
    })),
    opportunities: opportunities.map((item: any) => ({
      id: item.id,
      type: "opportunity" as const,
      title: item.title,
      amount: item.amount == null ? null : Number(item.amount),
    })),
    activities: activities.map((item: any) => ({
      id: item.id,
      type: "activity" as const,
      notes: item.notes ?? null,
    })),
  };
}

export async function listAutomationsForTenant(user: TenantUser) {
  return pgAutomations.listAutomationsForTenant(user);
}

export async function getAutomationForTenant(user: TenantUser, id: string) {
  return pgAutomations.getAutomationForTenant(user, id);
}

export async function createActivityTypeForTenant(user: TenantUser, payload: Record<string, unknown>) {
  const objectId = await getObjectId(user, "activity");
  const now = new Date().toISOString();
  const nextOrder = payload.order !== undefined
    ? Number(payload.order)
    : Number(
        (
          await queryOne<{ nextOrder: number }>(
            `select coalesce(max("order"), -1) + 1 as "nextOrder"
             from "ActivityType"
             where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}`,
            user.tenantId ? [user.tenantId] : [],
          )
        )?.nextOrder ?? 0,
      );

  const data = await queryOne<any>(
    `insert into "ActivityType" (
       id, "tenantId", "objectId", name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "createdAt", "updatedAt"
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     returning id, name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      objectId,
      String(payload.name ?? "").trim(),
      payload.icon ? String(payload.icon) : null,
      payload.color ? String(payload.color) : null,
      payload.defaultOutcome ? String(payload.defaultOutcome) : null,
      payload.defaultSLA ? Number(payload.defaultSLA) : null,
      nextOrder,
      payload.isActive !== false,
      now,
    ],
  );
  if (!data) throw new Error("ACTIVITY_TYPE_CREATE_FAILED");
  return data;
}

export async function updateActivityTypeForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  const updatePayload: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  for (const key of ["name", "icon", "color", "defaultOutcome"]) {
    if (key in payload) {
      updatePayload[key] = payload[key] === "" ? null : payload[key];
    }
  }

  if ("defaultSLA" in payload) {
    updatePayload.defaultSLA = payload.defaultSLA ? Number(payload.defaultSLA) : null;
  }

  if ("order" in payload) {
    updatePayload.order = Number(payload.order ?? 0);
  }

  if ("isActive" in payload) {
    updatePayload.isActive = payload.isActive !== false;
  }

  const entries = Object.entries(updatePayload);
  const values = entries.map(([, value]) => value);
  const assignments = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(", ");
  values.push(id);
  const idIndex = values.length;
  const tenantClause = user.tenantId ? (() => {
    values.push(user.tenantId);
    return `"tenantId" = $${values.length}`;
  })() : '"tenantId" is null';
  const data = await queryOne<any>(
    `update "ActivityType"
     set ${assignments}
     where id = $${idIndex} and ${tenantClause}
     returning id, name, icon, color, "defaultOutcome", "defaultSLA", "order", "isActive", "createdAt", "updatedAt"`,
    values,
  );
  if (!data) throw new Error("ACTIVITY_TYPE_NOT_FOUND");
  return data;
}

export async function deleteActivityTypeForTenant(user: TenantUser, id: string) {
  await execute(
    `delete from "ActivityType" where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
    user.tenantId ? [id, user.tenantId] : [id],
  );
}

export async function createAutomationForTenant(user: TenantUser, payload: Record<string, unknown>) {
  return pgAutomations.createAutomationForTenant(user, payload);
}

export async function updateAutomationForTenant(user: TenantUser, id: string, payload: Record<string, unknown>) {
  return pgAutomations.updateAutomationForTenant(user, id, payload);
}

export async function deleteAutomationForTenant(user: TenantUser, id: string) {
  return pgAutomations.deleteAutomationForTenant(user, id);
}

export async function listAutomationExecutionsForTenant(user: TenantUser, automationId: string) {
  return pgAutomations.listAutomationExecutionsForTenant(user, automationId);
}

export async function testAutomationForTenant(
  user: TenantUser,
  automationId: string,
  input: { entityType: string; entityId: string }
) {
  return pgAutomations.testAutomationForTenant(user, automationId, input);
}

export async function runAutomationsForEvent(
  user: TenantUser,
  eventType: string,
  entityType: string,
  entityId: string,
  record: Record<string, unknown>
) {
  return pgAutomations.runAutomationsForEvent(user, eventType, entityType, entityId, record);
}

export async function processDueAutomationJobsForTenant(user: TenantUser, limit = 25) {
  return pgAutomations.processDueAutomationJobsForTenant(user, limit);
}

export async function processDueAutomationJobs(limit = 50) {
  return pgAutomations.processDueAutomationJobs(limit);
}

export async function updateOpportunityForTenant(
  user: TenantUser,
  id: string,
  payload: Record<string, unknown>
) {
  return pgOpportunities.updateOpportunityForTenant(user, id, editablePayloadForUser(user, "opportunities", payload));
}

export async function deleteOpportunityForTenant(user: TenantUser, id: string) {
  return pgOpportunities.deleteOpportunityForTenant(user, id);
}
