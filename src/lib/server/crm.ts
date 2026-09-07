import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import * as pgActivities from "@/lib/repositories/activities-postgres";
import * as pgAutomations from "@/lib/repositories/automations-postgres";
import * as pgForms from "@/lib/repositories/forms-postgres";
import * as pgLeadLists from "@/lib/repositories/lead-lists-postgres";
import * as pgLeads from "@/lib/repositories/leads-postgres";
import * as pgOpportunities from "@/lib/repositories/opportunities-postgres";
import * as pgRecordShare from "@/lib/repositories/record-share-postgres";
import * as pgReportsDashboards from "@/lib/repositories/reports-dashboards-postgres";
import * as pgViews from "@/lib/repositories/views-postgres";
import { SmartViewTab } from "@/types/smart-views";
import { formatExportDateValue, formatTenantDate, getTenantTimeZone } from "@/lib/server/date-format";
import { getCurrentUserById } from "@/lib/repositories/auth-admin-postgres";
import { enqueueImportJob } from "@/lib/server/job-queue";
import { createUserNotification } from "@/lib/server/notifications";
import { DatabaseError } from "@/lib/db/errors";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  roleId?: string | null;
  role?: { permissions?: any } | string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
};

type ActivityFilterCondition = {
  field: string;
  operator?: string;
  value: string | number | boolean | null;
};

type ActivityFilterInput =
  | ActivityFilterCondition
  | {
      logic?: "AND" | "OR";
      conditions?: ActivityFilterCondition[];
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
  visibility?: "PRIVATE" | "TEAM" | "TENANT";
  sharedWithTeamId?: string | null;
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
  isArchived?: boolean;
  ownerId?: string;
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
  rateLimitPerMinute?: number;
};

type GlobalSearchResults = {
  leads: Array<{ id: string; type: "lead"; name: string; company: string | null }>;
  opportunities: Array<{ id: string; type: "opportunity"; title: string; amount: number | null }>;
  activities: Array<{ id: string; type: "activity"; notes: string | null }>;
  tasks: Array<{ id: string; type: "task"; title: string }>;
  partners: Array<{ id: string; type: "partner"; name: string; company: string | null }>;
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

export async function getLeadStatusCountsForTenant(user: TenantUser) {
  return pgLeads.getLeadStatusCountsForTenant(user);
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

export async function ensureSystemActivityType(user: TenantUser, name: string, icon: string, color: string) {
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
  filters: ActivityFilterInput[] | null,
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

export async function getOpportunityStageCountsForTenant(user: TenantUser) {
  return pgOpportunities.getOpportunityStageCountsForTenant(user);
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
  filters?: {
    entityType?: string;
    entityTypes?: string[];
    entityId?: string;
    action?: string;
    reviewStatus?: string;
    flagged?: boolean;
    legalHold?: boolean;
    dateFrom?: string;
    dateTo?: string;
    // Gap checklist Module 10's "user-level audit of productivity actions" item -- previously
    // no filter anywhere in this stack (repository/API/UI) could answer "what did user X do,"
    // only "what happened to record Y."
    userId?: string;
  }
) {
  const values: unknown[] = [];
  const clauses = [user.tenantId ? (() => {
    values.push(user.tenantId);
    return `"tenantId" = $${values.length}`;
  })() : '"tenantId" is null'];
  if (filters?.entityTypes?.length) {
    values.push(filters.entityTypes.map((t) => t.toUpperCase()));
    clauses.push(`"entityType" = any($${values.length}::text[])`);
  } else if (filters?.entityType) {
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
  if (filters?.userId) {
    values.push(filters.userId);
    clauses.push(`"userId" = $${values.length}`);
  }
  // "Status" + "anomaly flags" + "retention/legal hold" sub-items -- gap checklist: "audit
  // review workflows".
  if (filters?.reviewStatus) {
    values.push(filters.reviewStatus);
    clauses.push(`"reviewStatus" = $${values.length}`);
  }
  if (filters?.flagged) {
    clauses.push(`flagged = true`);
  }
  if (filters?.legalHold) {
    clauses.push(`"legalHold" = true`);
  }
  if (filters?.dateFrom) {
    values.push(filters.dateFrom);
    clauses.push(`"createdAt" >= $${values.length}`);
  }
  if (filters?.dateTo) {
    values.push(filters.dateTo);
    clauses.push(`"createdAt" <= $${values.length}`);
  }

  const data = await query<any>(
    `select id, action, "entityType", "entityId", before, after, diff, metadata, "createdAt", "userId",
            "reviewStatus", "reviewerId", "reviewedBy", "reviewedAt", "reviewNote", flagged, "flagReason", "legalHold"
     from "AuditLog"
     where ${clauses.join(" and ")}
     order by "createdAt" desc
     limit 200`,
    values,
  );
  const userIds = [...new Set(data.flatMap((item: any) => [item.userId, item.reviewerId, item.reviewedBy]).filter(Boolean))];
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
    reviewStatus: item.reviewStatus,
    reviewer: item.reviewerId ? (userMap.get(item.reviewerId) ?? null) : null,
    reviewedBy: item.reviewedBy ? (userMap.get(item.reviewedBy) ?? null) : null,
    reviewedAt: item.reviewedAt,
    reviewNote: item.reviewNote,
    flagged: item.flagged,
    flagReason: item.flagReason,
    legalHold: item.legalHold,
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

// Gap checklist Module 17, item 4 (advanced dashboard builder: cross-filtering/drill-down).
// Deliberately scoped to the two module-backed widget shapes where a single, unambiguous
// filterable field already exists: LEADS (status/source, whichever the clicked BAR was grouped
// by) and OPPORTUNITIES (always stage name). ACTIVITIES and every report-backed widget (19
// structurally different report shapes, each with its own grouping semantics) are excluded --
// applying a filter correctly to all of them would need per-report filtering logic, not a
// generic mechanism, so this stays an honest STAT/BAR-only feature rather than a broken
// promise of universal drill-down.
export type DashboardCrossFilter = { module: "LEADS" | "OPPORTUNITIES"; field: string; value: string } | null;

export async function getDashboardWidgetDataForTenant(user: TenantUser, id: string, crossFilter: DashboardCrossFilter = null) {
  const widget = await getDashboardWidgetForTenant(user, id);

  if (!widget) {
    return null;
  }

  const reportKey = String((widget.config as any)?.reportKey ?? "");
  if (reportKey) {
    return getReportBackedWidgetData(user, widget);
  }

  // Gap checklist Module 16's app-backed reports, "expose ... through ... widgets" half --
  // the piece the original pass explicitly left unattempted (see the comment above
  // marketplace-postgres.ts's App-backed report datasets section). Built per explicit user
  // decision, reusing the exact same STAT/BAR/TABLE rendering every other widget source
  // already has -- no new chart type.
  const appReportKey = String((widget.config as any)?.appReportKey ?? "");
  if (appReportKey) {
    return getAppReportBackedWidgetData(user, widget);
  }

  const moduleName = String((widget.config as any)?.module ?? "").toUpperCase();
  const metric = String((widget.config as any)?.metric ?? "COUNT").toUpperCase();
  const activeFilter = crossFilter && crossFilter.module === moduleName ? crossFilter : null;

  if (widget.type === "STAT") {
    if (moduleName === "LEADS") {
      const leads = await listLeadsForTenant(user, 1, 500);
      if (!activeFilter) return metric === "COUNT" ? leads.meta.total : leads.meta.total;
      return leads.data.filter((item: any) => String((item as any)[activeFilter.field] ?? "Unknown") === activeFilter.value).length;
    }

    if (moduleName === "OPPORTUNITIES") {
      const opportunities = await listOpportunitiesForTenant(user, 500);
      return opportunities.data.filter((item: any) => {
        const stage = item.stage;
        const filters = (widget.config as any)?.filters?.stage;
        if (filters) {
          if (filters.isWon === false && stage?.isWon) return false;
          if (filters.isLost === false && stage?.isClosed && !stage?.isWon) return false;
        }
        if (activeFilter && String(stage?.name ?? "Unassigned") !== activeFilter.value) return false;
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

  // Gap checklist Module 17's chart-library expansion, "sankey diagram" sub-item -- visualizing
  // source->stage flow (per explicit user direction). Reuses recharts' own built-in `Sankey`
  // component (already ships with the pre-existing `recharts` dependency, confirmed by reading
  // its actual type definitions before assuming a new `d3-sankey`-class package was needed --
  // it wasn't) -- no new dependency added. Data reuses `listOpportunitiesForTenant`'s already-
  // decorated rows (`opportunity.lead`/`opportunity.stage` are joined in-memory there already),
  // the same source this widget's own BAR/FUNNEL siblings already read from.
  if (widget.type === "SANKEY") {
    const opportunities = await listOpportunitiesForTenant(user, 500);
    const sourceNames: string[] = [];
    const stageNames: string[] = [];
    const flowCounts = new Map<string, number>();
    for (const item of opportunities.data as any[]) {
      const source = item.lead?.source ?? "Unknown";
      const stage = item.stage?.name ?? "Unassigned";
      if (!sourceNames.includes(source)) sourceNames.push(source);
      if (!stageNames.includes(stage)) stageNames.push(stage);
      const key = `${source} ${stage}`;
      flowCounts.set(key, (flowCounts.get(key) ?? 0) + 1);
    }
    const nodes = [...sourceNames, ...stageNames].map((name) => ({ name }));
    const links = [...flowCounts.entries()].map(([key, value]) => {
      const [source, stage] = key.split(" ");
      return { source: sourceNames.indexOf(source), target: sourceNames.length + stageNames.indexOf(stage), value };
    });
    return { nodes, links };
  }

  // Gap checklist Module 17's chart-library expansion, "pivot table" sub-item -- row dimension +
  // column dimension + aggregation, reusing the semantic metric layer's own object/field/
  // aggregation model (per explicit user direction). A pivot widget references an existing
  // Metric (its own `groupBy` becomes the pivot's row dimension) plus one additional column
  // dimension picked at widget-creation time -- not a second query-definition UI.
  if (widget.type === "PIVOT") {
    const pivotConfig = (widget.config as any)?.pivot;
    if (!pivotConfig?.metricId || !pivotConfig?.columnGroupBy) return { rowLabels: [], columnLabels: [], cells: {} };
    const { getMetricForTenant } = await import("@/lib/server/metrics");
    const { executePivotQueryForTenant } = await import("@/lib/server/reporting-query");
    const metric = await getMetricForTenant(user, pivotConfig.metricId);
    if (!metric?.groupBy) return { rowLabels: [], columnLabels: [], cells: {} };
    return executePivotQueryForTenant(user, {
      root: metric.root,
      aggregation: metric.aggregation,
      aggregateField: metric.aggregateField,
      filters: metric.filters,
      rowGroupBy: metric.groupBy,
      columnGroupBy: pivotConfig.columnGroupBy,
    });
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

  if (widget.type === "NBA") {
    // Dynamic import to avoid a circular import -- next-best-action.ts already imports
    // createAuditLog/automationConditionMatches from this file (same pattern communications.ts
    // uses to reach back into automations-postgres.ts).
    const { listRecommendationsForOwner } = await import("@/lib/server/next-best-action");
    const recommendations = await listRecommendationsForOwner(user, user.id);
    // listRecommendationsForOwner returns raw recommendation rows with no lead/opportunity
    // name join (the table only stores recordType/recordId) -- capped small by the tenant's
    // own maxVisibleRecommendationsPerUser (default 5), so an individual lookup per row here
    // is not a real N+1 risk.
    return Promise.all(
      recommendations.map(async (rec: any) => {
        const record = rec.recordType === "OPPORTUNITY"
          ? await pgOpportunities.getOpportunityForTenant(user, rec.recordId).catch(() => null)
          : await pgLeads.getLeadForTenant(user, rec.recordId).catch(() => null);
        return {
          id: rec.id,
          recordType: rec.recordType,
          recordId: rec.recordId,
          recordName: (record as any)?.name ?? (record as any)?.title ?? "Unknown record",
          actionType: rec.actionType,
          reason: rec.reason,
          score: rec.score,
        };
      }),
    );
  }

  if (widget.type === "BAR") {
    if (moduleName === "LEADS") {
      const leads = await listLeadsForTenant(user, 1, 500);
      const groupBy = String((widget.config as any)?.groupBy ?? "status");
      const rows = activeFilter ? leads.data.filter((item: any) => String((item as any)[activeFilter.field] ?? "Unknown") === activeFilter.value) : leads.data;
      const counts = new Map<string, number>();
      rows.forEach((item: any) => {
        const key = groupBy === "source" ? item.source ?? "Unknown" : item.status ?? "Unknown";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
      return [...counts.entries()].map(([group, value]) => ({ group, value }));
    }

    if (moduleName === "OPPORTUNITIES") {
      // Computed inline (rather than delegating to getOpportunityStatsForTenant, which BAR used
      // before) so the active cross-filter can narrow the same raw rows STAT uses -- the result
      // is identical to before when no filter is active, since BAR only ever consumed `.count`.
      const opportunities = await listOpportunitiesForTenant(user, 500);
      const rows = activeFilter ? opportunities.data.filter((item: any) => String(item.stage?.name ?? "Unassigned") === activeFilter.value) : opportunities.data;
      const counts = new Map<string, number>();
      const order = new Map<string, number>();
      rows.forEach((item: any) => {
        const key = item.stage?.name ?? "Unassigned";
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (!order.has(key)) order.set(key, item.stage?.order ?? Number.MAX_SAFE_INTEGER);
      });
      return [...counts.entries()]
        .sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
        .map(([group, value]) => ({ group, value }));
    }

    if (moduleName === "ACTIVITIES") {
      const activityStats = await getActivityStatsForTenant(user);
      return activityStats.byType.map((item) => ({ group: item.type, value: item.count }));
    }
  }

  return [];
}

// Gap checklist Module 16's app-backed reports, "expose ... through ... widgets" half -- reuses
// getAppReportData's own permission check (install status + "reports":"read"/"write" grant) and
// TTL cache entirely; this only reshapes its {rows, columnSchema} into whatever the widget's own
// chart type expects. Dynamic import to avoid a circular import (marketplace-postgres.ts imports
// createAuditLog from this file), same pattern the call_app_action node's invokeAppAction import
// already uses.
async function getAppReportBackedWidgetData(user: TenantUser, widget: any) {
  const marketplace = await import("@/lib/repositories/marketplace-postgres");
  const appId = String(widget.config?.appReportAppId ?? "");
  const reportKey = String(widget.config?.appReportKey ?? "");
  const result = await marketplace.getAppReportData(user, appId, reportKey);
  const rows = Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];

  if (widget.type === "STAT") {
    const metric = String(widget.config?.metric ?? "__count__");
    if (metric === "__count__") return rows.length;
    return rows.reduce((sum, row) => sum + (Number(row[metric]) || 0), 0);
  }

  if (widget.type === "BAR") {
    const columns = Array.isArray(result.columnSchema) ? result.columnSchema : [];
    const groupField = String(widget.config?.groupField ?? columns[0]?.key ?? "");
    const valueField = String(widget.config?.valueField ?? columns[1]?.key ?? "");
    return rows.map((row) => ({ group: String(row[groupField] ?? "Unknown"), value: Number(row[valueField]) || 0 }));
  }

  // TABLE (and any other type this widget might be created as) -- raw rows, same shape
  // TableWidget already renders for every other data source (columns auto-derived from keys).
  return rows;
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

  // Gap checklist Module 17, item 4/25 (new chart types + embedded analytics surfaces): wires
  // real data from this session's new reports into the new PIE/STACKED_BAR/TABLE/HEATMAP widget
  // types, rather than leaving them reachable only with placeholder/empty data.
  if (reportKey === "marketing_attribution_summary") {
    const model = String(widget.config?.model ?? "LINEAR").toUpperCase() as any;
    const report = await reports.getMarketingAttributionSummaryReportForTenant(user, model);
    if (widget.type === "STAT") return report.bySource.length;
    return report.bySource.slice(0, Number(widget.config?.limit ?? 8)).map((row: any) => ({ group: row.source, value: row.credit }));
  }

  if (reportKey === "sender_reputation") {
    const report = await reports.getSenderReputationReportForTenant(user, Number(widget.config?.days ?? 30));
    if (widget.type === "STAT") return readPath(report, metric) ?? 0;
    return report.byChannel.map((row: any) => ({ group: row.channel, sent: row.sent, failed: row.failed, bounced: row.bounced }));
  }

  if (reportKey === "funnel_explorer") {
    const { getFunnelExplorerForTenant } = reports;
    const report = await getFunnelExplorerForTenant(user, String(widget.config?.segment ?? "SOURCE").toUpperCase() as any);
    if (widget.type === "STAT") return report.reEntryCount;
    if (widget.type === "TABLE") return report.segments;
    return report.stageAging.map((row: any) => ({ stage: row.stageName, count: row.openCount }));
  }

  if (reportKey === "campaign_roi") {
    const report = await reports.getCampaignRoiReportForTenant(user);
    if (widget.type === "STAT") return report.journeys.length;
    return report.journeys.slice(0, Number(widget.config?.limit ?? 10));
  }

  if (reportKey === "cohort_funnel_progression") {
    const report = await reports.getCohortReportForTenant(user, "month", String(widget.config?.dimension ?? "CREATED_DATE").toUpperCase() as any);
    if (widget.type === "STAT") return report.rows.length;
    // Heatmap grid: cohort (row) x stage (col), cell value = reach rate percent.
    return report.rows.flatMap((cohortRow: any) =>
      cohortRow.stages.map((stage: any) => ({
        row: cohortRow.cohortLabel,
        col: stage.stageName,
        value: Math.round((stage.reachRate ?? 0) * 100),
      })),
    );
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

// Gap checklist Module 17's advanced dashboard builder, "export/schedule for a whole dashboard"
// sub-item -- per explicit user direction, one combined PDF. A "dashboard" here is a
// DashboardTab -- exports every widget the viewer owns on that tab (never another user's shared
// widgets, matching the exact tab-membership rule the client itself already uses:
// `(widget.tabId ?? defaultTabId) === tabId`), rendering each widget's already-computed data
// through `getDashboardWidgetDataForTenant` unchanged -- no second data-fetching path.
export async function exportDashboardTabPdfForTenant(user: TenantUser, tabId: string): Promise<{ tabName: string; buffer: Buffer }> {
  const { listDashboardTabsForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
  const { renderDashboardTabPdf } = await import("@/lib/server/report-pdf");

  const tabs = await listDashboardTabsForTenant(user);
  const tab = tabs.find((item: any) => item.id === tabId);
  if (!tab) throw new Error("DASHBOARD_TAB_NOT_FOUND");
  const defaultTabId = tabs.find((item: any) => item.isDefault)?.id ?? tabs[0]?.id ?? null;

  const allWidgets = await listDashboardWidgetsForTenant(user);
  const tabWidgets = allWidgets.filter((widget: any) => widget.isOwner !== false && (widget.tabId ?? defaultTabId) === tabId);

  const widgets = await Promise.all(
    tabWidgets.map(async (widget: any) => ({
      title: widget.title,
      type: widget.type,
      data: await getDashboardWidgetDataForTenant(user, widget.id),
    })),
  );

  const buffer = await renderDashboardTabPdf({ tabName: tab.name, generatedAt: new Date().toISOString(), widgets });
  return { tabName: tab.name, buffer };
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

export async function recordFormProgressEvent(identifier: string, input: { sessionId: string; tabId: string; tabIndex: number }) {
  return pgForms.recordFormProgressEvent(identifier, input);
}

export async function getRecordShareForTenant(user: TenantUser, recordType: pgRecordShare.RecordShareType, recordId: string) {
  return pgRecordShare.getRecordShareForTenant(user, recordType, recordId);
}

export async function upsertRecordShareForTenant(user: TenantUser, recordType: pgRecordShare.RecordShareType, recordId: string, input: pgRecordShare.RecordShareInput) {
  return pgRecordShare.upsertRecordShareForTenant(user, recordType, recordId, input);
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

export async function recordSavedViewOpened(user: TenantUser, id: string) {
  return pgViews.recordSavedViewOpened(user, id);
}

export async function addSavedViewCommentForTenant(user: TenantUser, id: string, body: string) {
  return pgViews.addSavedViewCommentForTenant(user, id, body);
}

export async function requestSavedViewAccessForTenant(user: TenantUser, id: string) {
  return pgViews.requestSavedViewAccessForTenant(user, id);
}

export async function getSavedViewSummaryForTenant(user: TenantUser, id: string) {
  return pgViews.getSavedViewSummaryForTenant(user, id);
}

export async function previewSavedViewShareTargets(user: TenantUser, targets: pgViews.SavedViewShareTargets) {
  if (!user.tenantId) return [];
  return pgViews.resolveSavedViewShareTargets(user.tenantId, targets);
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

  // The tracking script (src/app/api/tracking/script/route.ts) has always sent these,
  // but until now nothing here read them -- captured UTM params were silently dropped
  // instead of ever reaching an attribution record.
  const utmSource = typeof input.utm_source === "string" ? input.utm_source : null;
  const utmMedium = typeof input.utm_medium === "string" ? input.utm_medium : null;
  const utmCampaign = typeof input.utm_campaign === "string" ? input.utm_campaign : null;
  if (utmSource || utmMedium || utmCampaign) {
    const { recordAttributionTouch } = await import("@/lib/server/marketing-journeys");
    await recordAttributionTouch(user, {
      recordType: "LEAD",
      recordId: lead.id,
      source: utmSource,
      medium: utmMedium,
      campaign: utmCampaign,
      channel: "WEBSITE_VISIT",
      metadata: { url: pageUrl },
    }).catch(() => undefined);
  }

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

const IMPORT_JOB_COLUMNS = 'id, module, "filePath", status, stats, errors, "createdAt", "userId"';

export async function listImportJobsForTenant(user: TenantUser) {
  return query(
    `select ${IMPORT_JOB_COLUMNS}
     from "ImportJob"
     where ${user.tenantId ? '"tenantId" = $1' : '"tenantId" is null'}
     order by "createdAt" desc
     limit 50`,
    user.tenantId ? [user.tenantId] : [],
  );
}

// Staged validation: classifies every row as would-create/would-update/would-skip/error
// against the exact same mapping + duplicate-detection logic the real run uses, without
// writing anything -- lets an admin catch a bad mapping or an unexpectedly large
// duplicateMode=UPDATE blast radius before committing to it.
export async function previewImportForTenant(user: TenantUser, input: ImportInput) {
  const importModule = normalizeImportModule(input.module);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const duplicateMode = input.duplicateMode === "UPDATE" || input.duplicateMode === "CREATE" ? input.duplicateMode : "SKIP";
  let wouldCreate = 0;
  let wouldUpdate = 0;
  let wouldSkip = 0;
  const rowErrors: Array<{ row: number; message: string }> = [];

  for (const [index, row] of rows.entries()) {
    try {
      const payload = mapImportRow(row, input.mappings);
      const duplicateId = await findDuplicateForImport(user, importModule, payload);
      if (duplicateId && duplicateMode === "SKIP") wouldSkip += 1;
      else if (duplicateId && duplicateMode === "UPDATE") wouldUpdate += 1;
      else wouldCreate += 1;
    } catch (error) {
      rowErrors.push({ row: index + 1, message: error instanceof Error ? error.message : "Row could not be evaluated" });
    }
  }

  return {
    total: rows.length,
    wouldCreate,
    wouldUpdate,
    wouldSkip,
    wouldFail: rowErrors.length,
    isDestructive: duplicateMode === "UPDATE" && wouldUpdate > 0,
    sampleErrors: rowErrors.slice(0, 10),
  };
}

// duplicateMode=UPDATE overwrites existing records in bulk -- the one genuinely destructive
// shape an import can take (CREATE-only and SKIP-duplicates are purely additive) -- so it
// starts life gated behind an explicit approval step instead of going straight to the queue.
export async function queueImportForTenant(user: TenantUser, input: ImportInput) {
  const importModule = normalizeImportModule(input.module);
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const duplicateMode = input.duplicateMode === "UPDATE" || input.duplicateMode === "CREATE" ? input.duplicateMode : "SKIP";
  const now = new Date().toISOString();
  const jobId = randomUUID();
  const isDestructive = duplicateMode === "UPDATE";
  const initialStatus = isDestructive ? "PENDING_APPROVAL" : "QUEUED";

  await execute(
    `insert into "ImportJob" (
       id, "tenantId", "userId", module, "filePath", status, mapping, rows, stats, errors, "cancelRequested", "createdAt", "updatedAt"
     ) values ($1, $2, $3, $4, null, $5, $6, $7, $8, $9, false, $10, $10)`,
    [
      jobId,
      user.tenantId,
      user.id,
      importModule,
      initialStatus,
      { fields: input.mappings ?? [], duplicateMode },
      rows,
      { total: rows.length, processed: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
      [],
      now,
    ],
  );
  await createAuditLog(user, "CREATE", "IMPORT_JOB", jobId, null, { module: importModule, duplicateMode, rowCount: rows.length, status: initialStatus }, null);

  if (!isDestructive) await enqueueImportJob(jobId).catch(() => undefined);

  return queryOne<any>(`select ${IMPORT_JOB_COLUMNS} from "ImportJob" where id = $1`, [jobId]);
}

export async function approveImportJob(user: TenantUser, jobId: string) {
  const job = await queryOne<any>(
    `update "ImportJob"
     set status = 'QUEUED', "updatedAt" = $1
     where id = $2 and status = 'PENDING_APPROVAL' and ${user.tenantId ? '"tenantId" = $3' : '"tenantId" is null'}
     returning ${IMPORT_JOB_COLUMNS}`,
    user.tenantId ? [new Date().toISOString(), jobId, user.tenantId] : [new Date().toISOString(), jobId],
  );
  if (!job) throw new Error("IMPORT_JOB_NOT_PENDING_APPROVAL");
  await createAuditLog(user, "UPDATE", "IMPORT_JOB", jobId, null, null, { status: { before: "PENDING_APPROVAL", after: "QUEUED" } });
  await enqueueImportJob(jobId).catch(() => undefined);
  return job;
}

export async function rejectImportJob(user: TenantUser, jobId: string) {
  const job = await queryOne<any>(
    `update "ImportJob"
     set status = 'REJECTED', "updatedAt" = $1
     where id = $2 and status = 'PENDING_APPROVAL' and ${user.tenantId ? '"tenantId" = $3' : '"tenantId" is null'}
     returning ${IMPORT_JOB_COLUMNS}`,
    user.tenantId ? [new Date().toISOString(), jobId, user.tenantId] : [new Date().toISOString(), jobId],
  );
  if (!job) throw new Error("IMPORT_JOB_NOT_PENDING_APPROVAL");
  await createAuditLog(user, "UPDATE", "IMPORT_JOB", jobId, null, null, { status: { before: "PENDING_APPROVAL", after: "REJECTED" } });
  return job;
}

// Cooperative cancel: a job still QUEUED (worker hasn't picked it up yet) can be cancelled
// outright; one already PROCESSING can only ask nicely via cancelRequested, checked between
// rows in processImportJob below -- there's no way to interrupt a row already mid-write.
export async function cancelImportJob(user: TenantUser, jobId: string) {
  const queuedCancel = await queryOne<any>(
    `update "ImportJob"
     set status = 'CANCELLED', "updatedAt" = $1
     where id = $2 and status = 'QUEUED' and ${user.tenantId ? '"tenantId" = $3' : '"tenantId" is null'}
     returning ${IMPORT_JOB_COLUMNS}`,
    user.tenantId ? [new Date().toISOString(), jobId, user.tenantId] : [new Date().toISOString(), jobId],
  );
  if (queuedCancel) {
    await createAuditLog(user, "UPDATE", "IMPORT_JOB", jobId, null, null, { status: { before: "QUEUED", after: "CANCELLED" } });
    return queuedCancel;
  }
  const flagged = await queryOne<any>(
    `update "ImportJob"
     set "cancelRequested" = true, "updatedAt" = $1
     where id = $2 and status = 'PROCESSING' and ${user.tenantId ? '"tenantId" = $3' : '"tenantId" is null'}
     returning ${IMPORT_JOB_COLUMNS}`,
    user.tenantId ? [new Date().toISOString(), jobId, user.tenantId] : [new Date().toISOString(), jobId],
  );
  if (!flagged) throw new Error("IMPORT_JOB_NOT_CANCELLABLE");
  await createAuditLog(user, "UPDATE", "IMPORT_JOB", jobId, null, null, { cancelRequested: { before: false, after: true } });
  return flagged;
}

// Worker-invoked: atomically claims the job (QUEUED -> PROCESSING) so a duplicate/retried
// job message can't double-process the same rows, then runs the same per-row mapping +
// duplicate-detection + create/update logic the old synchronous runImportForTenant used.
export async function processImportJob(importJobId: string) {
  const claimed = await queryOne<any>(
    `update "ImportJob"
     set status = 'PROCESSING', "updatedAt" = $1
     where id = $2 and status = 'QUEUED'
     returning id, "tenantId", "userId", module, mapping, rows`,
    [new Date().toISOString(), importJobId],
  );
  if (!claimed) return null;

  const requester = await getCurrentUserById(claimed.userId);
  const user: TenantUser = requester ? (requester as TenantUser) : { id: claimed.userId, tenantId: claimed.tenantId };
  const importModule = claimed.module as ImportModule;
  const rows: Record<string, unknown>[] = Array.isArray(claimed.rows) ? claimed.rows : [];
  const mappings: ImportMapping[] | undefined = claimed.mapping?.fields;
  const duplicateMode: "SKIP" | "UPDATE" | "CREATE" = claimed.mapping?.duplicateMode ?? "SKIP";

  const rowErrors: Array<{ row: number; message: string }> = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let cancelled = false;

  for (const [index, row] of rows.entries()) {
    if (index % 25 === 0) {
      const current = await queryOne<{ cancelRequested: boolean }>(`select "cancelRequested" from "ImportJob" where id = $1`, [importJobId]);
      if (current?.cancelRequested) {
        cancelled = true;
        break;
      }
    }
    try {
      const payload = mapImportRow(row, mappings);
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
      rowErrors.push({ row: index + 1, message: error instanceof Error ? error.message : "Import failed" });
    }
  }

  const processed = created + updated + skipped + rowErrors.length;
  const stats = { total: rows.length, processed, created, updated, skipped, failed: rowErrors.length };
  const finalStatus = cancelled ? "CANCELLED" : rowErrors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";

  const data = await queryOne<any>(
    `update "ImportJob"
     set status = $1, stats = $2, errors = $3, rows = null, "updatedAt" = $4
     where id = $5
     returning ${IMPORT_JOB_COLUMNS}`,
    [finalStatus, stats, rowErrors, new Date().toISOString(), importJobId],
  );
  if (!data) throw new Error("IMPORT_JOB_NOT_FOUND");
  await createAuditLog(user, "UPDATE", "IMPORT_JOB", importJobId, null, data, stats);
  await createUserNotification({
    tenantId: claimed.tenantId,
    userId: claimed.userId,
    title: cancelled ? "Import cancelled" : rowErrors.length > 0 ? "Import completed with errors" : "Import completed",
    message: `${importModule} import: ${created} created, ${updated} updated, ${skipped} skipped, ${rowErrors.length} failed.`,
    data: { type: "imports.process", importJobId, stats },
  }).catch(() => undefined);
  return data;
}

export async function listImportTemplatesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, name, module, mapping, "duplicateMode", "createdAt", "updatedAt"
     from "ImportTemplate" where "tenantId" = $1 order by name asc`,
    [user.tenantId],
  );
}

export async function createImportTemplateForTenant(
  user: TenantUser,
  input: { name?: string; module?: string; mappings?: ImportMapping[]; duplicateMode?: "SKIP" | "UPDATE" | "CREATE" }
) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("IMPORT_TEMPLATE_NAME_REQUIRED");
  const importModule = normalizeImportModule(input.module);
  const now = new Date().toISOString();
  try {
    const template = await queryOne<any>(
      `insert into "ImportTemplate" (id, "tenantId", name, module, mapping, "duplicateMode", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       returning id, name, module, mapping, "duplicateMode", "createdAt", "updatedAt"`,
      [randomUUID(), user.tenantId, name, importModule, input.mappings ?? [], input.duplicateMode ?? "SKIP", user.id, now],
    );
    if (!template) throw new Error("IMPORT_TEMPLATE_INSERT_FAILED");
    return template;
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") throw new Error("DUPLICATE_IMPORT_TEMPLATE_NAME");
    throw error;
  }
}

export async function deleteImportTemplateForTenant(user: TenantUser, templateId: string) {
  await execute(
    `delete from "ImportTemplate" where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
    user.tenantId ? [templateId, user.tenantId] : [templateId],
  );
}

export async function listWebhooksForTenant(user: TenantUser) {
  return query(
    `select id,
            coalesce(nullif(url, ''), 'Webhook') as name,
            url,
            events,
            "isActive",
            secret,
            "rateLimitPerMinute",
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
  const rateLimitPerMinute = Number.isFinite(input.rateLimitPerMinute) && Number(input.rateLimitPerMinute) > 0 ? Math.round(Number(input.rateLimitPerMinute)) : 60;
  const webhook = await queryOne<any>(
    `insert into "WebhookSubscription" (
       id, "tenantId", url, events, secret, "isActive", "rateLimitPerMinute", "createdAt", "updatedAt"
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     returning id, coalesce(nullif(url, ''), 'Webhook') as name, url, events, "isActive", secret, "rateLimitPerMinute", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      url,
      JSON.stringify(Array.isArray(input.events) && input.events.length > 0 ? input.events : ["LEAD_CREATED"]),
      input.secret ? String(input.secret) : null,
      input.isActive !== false,
      rateLimitPerMinute,
      now,
    ],
  );
  if (!webhook) throw new Error("WEBHOOK_CREATE_FAILED");
  await createAuditLog(user, "CREATE", "WEBHOOK", webhook.id, null, webhook, null);
  return webhook;
}

// Covers both editing the event subscription list and pause/resume (isActive) -- there was
// previously no update path at all for a WebhookSubscription (create/delete only), so a
// subscription's events could never actually be changed once created.
export async function updateWebhookForTenant(user: TenantUser, id: string, input: Partial<WebhookInput>) {
  const existing = await queryOne<any>(
    `select id, url, events, "isActive", secret, "rateLimitPerMinute" from "WebhookSubscription" where id = $1 and ${user.tenantId ? '"tenantId" = $2' : '"tenantId" is null'}`,
    user.tenantId ? [id, user.tenantId] : [id],
  );
  if (!existing) throw new Error("WEBHOOK_NOT_FOUND");

  const nextUrl = input.url !== undefined ? String(input.url).trim() : existing.url;
  const nextEvents = Array.isArray(input.events) && input.events.length > 0 ? input.events : existing.events;
  const nextIsActive = input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive;
  const nextSecret = input.secret !== undefined ? (input.secret ? String(input.secret) : null) : existing.secret;
  const nextRateLimit = Number.isFinite(input.rateLimitPerMinute) && Number(input.rateLimitPerMinute) > 0 ? Math.round(Number(input.rateLimitPerMinute)) : existing.rateLimitPerMinute;

  const webhook = await queryOne<any>(
    `update "WebhookSubscription"
     set url = $1, events = $2, "isActive" = $3, secret = $4, "rateLimitPerMinute" = $5, "updatedAt" = $6
     where id = $7 and ${user.tenantId ? '"tenantId" = $8' : '"tenantId" is null'}
     returning id, coalesce(nullif(url, ''), 'Webhook') as name, url, events, "isActive", secret, "rateLimitPerMinute", "createdAt", "updatedAt"`,
    user.tenantId
      ? [nextUrl, JSON.stringify(nextEvents), nextIsActive, nextSecret, nextRateLimit, new Date().toISOString(), id, user.tenantId]
      : [nextUrl, JSON.stringify(nextEvents), nextIsActive, nextSecret, nextRateLimit, new Date().toISOString(), id],
  );
  if (!webhook) throw new Error("WEBHOOK_UPDATE_FAILED");
  await createAuditLog(user, "UPDATE", "WEBHOOK", id, existing, webhook, { isActive: { before: existing.isActive, after: nextIsActive } });
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
  const existing = await getTelephonySettingsForTenant(user) as { id?: string; config?: Record<string, unknown> };
  // The webhook secret (and its rotation-grace-window fields) are managed exclusively via
  // rotateTelephonyWebhookSecret -- always preserved here regardless of what the client sends,
  // so a general settings save (e.g. changing the Provider field) can never blow away the
  // live secret with a stale or absent value.
  const mergedConfig = {
    ...config,
    webhookSecret: existing.config?.webhookSecret ?? null,
    previousWebhookSecret: existing.config?.previousWebhookSecret ?? null,
    previousWebhookSecretExpiresAt: existing.config?.previousWebhookSecretExpiresAt ?? null,
  };
  const data = existing.id
    ? await queryOne<any>(
        `update "IntegrationSetting"
         set config = $1, "isActive" = $2, "updatedBy" = $3, "updatedAt" = $4
         where id = $5 and ${user.tenantId ? '"tenantId" = $6' : '"tenantId" is null'}
         returning id, type, config, "isActive", "updatedAt"`,
        user.tenantId
          ? [mergedConfig, Boolean(config.isActive), asUuidOrNull(user.id), now, existing.id, user.tenantId]
          : [mergedConfig, Boolean(config.isActive), asUuidOrNull(user.id), now, existing.id],
      )
    : await queryOne<any>(
        `insert into "IntegrationSetting" (
           id, "tenantId", type, config, "isActive", "updatedBy", "createdAt", "updatedAt"
         ) values ($1, $2, 'TELEPHONY', $3, $4, $5, $6, $6)
         returning id, type, config, "isActive", "updatedAt"`,
        [randomUUID(), user.tenantId, mergedConfig, Boolean(config.isActive), asUuidOrNull(user.id), now],
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
  const opportunityId = input.opportunityId ? String(input.opportunityId) : null;
  // Reuses the same record-access-scoped lookups every other surface uses (OWN-scoped reps
  // only see their own records) -- the previous raw tenant-only query let a rep click-to-call
  // any lead in the tenant regardless of ownership, bypassing the access model everywhere
  // else in the app enforces.
  let lead: any = null;
  if (leadId) lead = await getLeadForTenant(user, leadId);
  if (!lead && opportunityId) {
    const opportunity = await getOpportunityForTenant(user, opportunityId);
    if (opportunity?.lead) lead = opportunity.lead;
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

  // Compliance gate: DND suppression, per-record consent opt-out, and tenant-configured
  // quiet hours -- checked immediately before dialing, never after, so a blocked number never
  // reaches the provider at all. Reuses the same CommunicationSuppression/CommunicationConsent
  // tables the EMAIL/WHATSAPP/SMS channels already use (their channel CHECK constraint was
  // widened to accept PHONE for exactly this reuse) rather than a parallel do-not-call list.
  let complianceBlockReason: "SUPPRESSED" | "OPTED_OUT" | "QUIET_HOURS" | null = null;
  if (user.tenantId) {
    const { checkTelephonyComplianceForCall } = await import("@/lib/server/telephony-webhook");
    const compliance = await checkTelephonyComplianceForCall(user.tenantId, phoneNumber, {
      entityType: leadId ? "LEAD" : opportunityId ? "OPPORTUNITY" : undefined,
      entityId: leadId ?? opportunityId,
    });
    if (!compliance.allowed) complianceBlockReason = compliance.reason;
  }

  if (complianceBlockReason) {
    providerResponse = { blocked: true, reason: complianceBlockReason };
  } else if (url && input.execute !== false) {
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

  // Call-attempt audit log: previously a click-to-call dial left zero record of the call ever
  // happening -- no TelephonyCallLog row, no Activity -- unless the provider's own webhook
  // later fired (and given how weak that webhook's auth was before this pass, a
  // misconfigured/absent webhook silently lost that history entirely). Every click-to-call
  // invocation now logs a real attempt row immediately, regardless of whether the provider
  // request itself succeeded, so "a rep tried to call this number at this time" is always
  // answerable. A later webhook event for the same callId (if the provider sends one) updates
  // this same row via recordTelephonyCallEvent's upsert instead of creating a second one.
  let callLogId: string | null = null;
  try {
    if (!user.tenantId) throw new Error("TENANT_REQUIRED");
    const { recordTelephonyCallEvent } = await import("@/lib/server/telephony-webhook");
    const log = await recordTelephonyCallEvent(
      user.tenantId,
      {
        provider: config.provider || "click-to-call",
        callId: `manual-${randomUUID()}`,
        direction: "OUTBOUND",
        toNumber: phoneNumber,
        status: complianceBlockReason ? "blocked" : executed && success ? "dialing" : executed ? "failed" : "not-attempted",
        leadId,
        opportunityId,
        agentId: user.id,
        metadata: { source: "click-to-call", triggeredBy: user.id },
      },
      user,
    );
    callLogId = log?.id ?? null;
  } catch {
    // Never let audit-log failure block the actual call attempt from reaching the provider.
  }

  return {
    provider: config.provider ?? "",
    clickToCallUrl: url,
    agentPopupUrl: config.agentPopupUrl ?? "",
    executed,
    success,
    blocked: !!complianceBlockReason,
    blockReason: complianceBlockReason,
    providerResponse,
    callLogId,
    request: { method, headers, body },
    payload: {
      agentId: input.agentId ?? user.id,
      phoneNumber,
      leadId,
      opportunityId,
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
    return { leads: [], opportunities: [], activities: [], tasks: [], partners: [] };
  }

  const pattern = `%${normalized}%`;
  const tenantWhere = user.tenantId ? '"tenantId" = $2' : '"tenantId" is null';
  const partnerTenantWhere = user.tenantId ? '"PartnerProfile"."tenantId" = $2' : '"PartnerProfile"."tenantId" is null';
  const values = user.tenantId ? [pattern, user.tenantId] : [pattern];
  const [leads, opportunities, activities, tasks, partners] = await Promise.all([
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
    query<any>(
      `select id, title
       from "Task"
       where title ilike $1 and ${tenantWhere}
       order by "updatedAt" desc
       limit 8`,
      values,
    ),
    query<any>(
      `select "PartnerProfile".id, "PartnerProfile"."legalBusinessName", "User".name, "User".email
       from "PartnerProfile"
       join "User" on "User".id = "PartnerProfile"."userId"
       where (
         "PartnerProfile"."legalBusinessName" ilike $1
         or "User".name ilike $1
         or "User".email ilike $1
       ) and ${partnerTenantWhere}
       order by "PartnerProfile"."updatedAt" desc
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
    tasks: tasks.map((item: any) => ({
      id: item.id,
      type: "task" as const,
      title: item.title,
    })),
    partners: partners.map((item: any) => ({
      id: item.id,
      type: "partner" as const,
      name: item.name ?? item.legalBusinessName,
      company: item.legalBusinessName ?? null,
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

export async function enrollRecordsInAutomation(
  user: TenantUser,
  automationId: string,
  entityType: "LEAD" | "OPPORTUNITY",
  recordIds: string[]
) {
  return pgAutomations.enrollRecordsInAutomation(user, automationId, entityType, recordIds);
}

export async function listAutomationEnrollmentJobsForTenant(user: TenantUser, automationId: string) {
  return pgAutomations.listAutomationEnrollmentJobsForTenant(user, automationId);
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
