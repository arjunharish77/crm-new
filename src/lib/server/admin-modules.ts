import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import * as pgAdminModules from "@/lib/repositories/admin-modules-postgres";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
};

type GeneralSettings = {
  companyName: string;
  timezone: string;
  currency: string;
  language: string;
  dateFormat: string;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }
  return user.tenantId;
}

function asUuidOrNull(value: unknown) {
  const text = typeof value === "string" ? value : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function cleanPatch(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

async function insertReturning<T>(table: string, row: Record<string, unknown>, returning: string) {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const result = await queryOne<T & Record<string, unknown>>(
    `insert into "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")}) returning ${returning}`,
    values,
  );
  if (!result) throw new Error(`${table.toUpperCase()}_INSERT_FAILED`);
  return result as T;
}

async function updateReturning<T>(
  table: string,
  patch: Record<string, unknown>,
  whereSql: string,
  whereValues: unknown[],
  returning: string,
) {
  const cleaned = cleanPatch(patch);
  const columns = Object.keys(cleaned);
  if (!columns.length) throw new Error(`${table.toUpperCase()}_EMPTY_UPDATE`);
  const values = columns.map((column) => cleaned[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const shiftedWhere = whereSql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + values.length}`);
  const result = await queryOne<T & Record<string, unknown>>(
    `update "${table}" set ${assignments} ${shiftedWhere} returning ${returning}`,
    values.concat(whereValues),
  );
  if (!result) throw new Error(`${table.toUpperCase()}_NOT_FOUND`);
  return result as T;
}

async function getObjectDefinitionId(tenantId: string, objectType: string) {
  const objectNameMap: Record<string, string> = {
    LEAD: "lead",
    OPPORTUNITY: "opportunity",
    ACTIVITY: "activity",
  };
  const objectName = objectNameMap[objectType.toUpperCase()];
  if (!objectName) throw new Error(`Unsupported object type: ${objectType}`);

  const row = await queryOne<{ id: string }>(
    'select id from "ObjectDefinition" where "tenantId" = $1 and name = $2 limit 1',
    [tenantId, objectName],
  );
  if (!row?.id) throw new Error(`Missing object definition for ${objectType}`);
  return row.id;
}

function normalizeFieldType(type?: string) {
  if (!type) return "TEXT";
  if (type === "SELECT") return "DROPDOWN";
  if (type === "CHECKBOX") return "BOOLEAN";
  if (type === "TEXTAREA") return "TEXT";
  return type;
}

function denormalizeFieldType(type?: string) {
  if (!type) return "TEXT";
  if (type === "DROPDOWN") return "SELECT";
  if (type === "BOOLEAN") return "CHECKBOX";
  return type;
}

function getFieldOptions(type: string, options: unknown) {
  if (type !== "SELECT" && type !== "DROPDOWN" && type !== "MULTI_SELECT") return [];
  return Array.isArray(options) ? options.map((item) => String(item)) : [];
}

function evaluateRuleAgainstLead(rule: any, lead: any) {
  const fieldValue = lead[rule.fieldKey];
  const compareValue = rule.value;

  switch (rule.operator) {
    case "EQUALS":
      return String(fieldValue ?? "") === String(compareValue ?? "");
    case "NOT_EQUALS":
      return String(fieldValue ?? "") !== String(compareValue ?? "");
    case "CONTAINS":
      return String(fieldValue ?? "").toLowerCase().includes(String(compareValue ?? "").toLowerCase());
    case "GT":
      return Number(fieldValue ?? 0) > Number(compareValue ?? 0);
    case "LT":
      return Number(fieldValue ?? 0) < Number(compareValue ?? 0);
    case "IS_SET":
      return fieldValue !== null && fieldValue !== undefined && String(fieldValue) !== "";
    case "IS_NOT_SET":
      return fieldValue === null || fieldValue === undefined || String(fieldValue) === "";
    default:
      return false;
  }
}

export async function listSalesGroupsForTenant(user: TenantUser) {
  return pgAdminModules.listSalesGroupsForTenant(user);
}

export async function listTeamsForTenant(user: TenantUser) {
  return pgAdminModules.listTeamsForTenant(user);
}

export async function createTeamForTenant(user: TenantUser, input: Record<string, unknown>) {
  return pgAdminModules.createTeamForTenant(user, input);
}

export async function updateTeamForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  return pgAdminModules.updateTeamForTenant(user, id, input);
}

export async function deleteTeamForTenant(user: TenantUser, id: string) {
  return pgAdminModules.deleteTeamForTenant(user, id);
}

export async function addTeamMemberForTenant(user: TenantUser, teamId: string, memberInput: { userId: string; role?: string }) {
  return pgAdminModules.addTeamMemberForTenant(user, teamId, memberInput);
}

export async function removeTeamMemberForTenant(user: TenantUser, teamId: string, userId: string) {
  return pgAdminModules.removeTeamMemberForTenant(user, teamId, userId);
}

export async function createSalesGroupForTenant(user: TenantUser, input: Record<string, unknown>) {
  return pgAdminModules.createSalesGroupForTenant(user, input);
}

export async function updateSalesGroupForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  return pgAdminModules.updateSalesGroupForTenant(user, id, input);
}

export async function deleteSalesGroupForTenant(user: TenantUser, id: string) {
  return pgAdminModules.deleteSalesGroupForTenant(user, id);
}

export async function addSalesGroupMemberForTenant(
  user: TenantUser,
  groupId: string,
  memberInput: { userId: string; role?: string },
) {
  return pgAdminModules.addSalesGroupMemberForTenant(user, groupId, memberInput);
}

export async function removeSalesGroupMemberForTenant(user: TenantUser, groupId: string, userId: string) {
  return pgAdminModules.removeSalesGroupMemberForTenant(user, groupId, userId);
}

export async function listAssignmentRulesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const rows = await query<any>(
    `select id, name, description, "entityType", priority, "isActive", conditions, strategy, "targetGroupId", "targetUserIds", "createdAt", "updatedAt"
     from "AssignmentRule"
     where "tenantId" = $1
     order by priority desc`,
    [tenantId],
  );

  return rows.map((rule) => ({
    ...rule,
    type: rule.strategy,
    config: {
      salesGroupId: rule.targetGroupId ?? undefined,
      userPool: rule.targetUserIds ?? [],
      matchingKeys:
        rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions)
          ? Object.fromEntries(Object.entries(rule.conditions as Record<string, unknown>).filter(([key]) => !key.startsWith("__")))
          : {},
      fallbackUserId:
        rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions)
          ? (rule.conditions as Record<string, unknown>).__fallbackUserId
          : undefined,
    },
  }));
}

export async function createAssignmentRuleForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const config = (input.config as Record<string, unknown>) ?? {};
  const conditions = {
    ...((config.matchingKeys as Record<string, unknown>) ?? {}),
    ...(config.fallbackUserId ? { __fallbackUserId: String(config.fallbackUserId) } : {}),
  };
  const now = new Date().toISOString();

  return insertReturning<any>("AssignmentRule", {
    id: randomUUID(),
    tenantId,
    name: String(input.name ?? "").trim(),
    description: input.description ? String(input.description) : null,
    entityType: input.entityType ? String(input.entityType) : "LEAD",
    priority: Number(input.priority ?? 0),
    isActive: input.isActive !== false,
    conditions,
    strategy: input.type ? String(input.type) : "ROUND_ROBIN",
    targetGroupId: config.salesGroupId ? String(config.salesGroupId) : null,
    targetUserIds: Array.isArray(config.userPool) ? config.userPool.map(String) : [],
    createdAt: now,
    updatedAt: now,
  }, 'id, name, description, "entityType", priority, "isActive", conditions, strategy, "targetGroupId", "targetUserIds", "createdAt", "updatedAt"');
}

export async function updateAssignmentRuleForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const config = (input.config as Record<string, unknown>) ?? {};
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if ("name" in input) payload.name = String(input.name ?? "").trim();
  if ("description" in input) payload.description = input.description ? String(input.description) : null;
  if ("entityType" in input) payload.entityType = String(input.entityType ?? "LEAD");
  if ("priority" in input) payload.priority = Number(input.priority ?? 0);
  if ("isActive" in input) payload.isActive = input.isActive !== false;
  if ("type" in input) payload.strategy = String(input.type ?? "ROUND_ROBIN");
  if ("config" in input) {
    payload.conditions = {
      ...((config.matchingKeys as Record<string, unknown>) ?? {}),
      ...(config.fallbackUserId ? { __fallbackUserId: String(config.fallbackUserId) } : {}),
    };
    payload.targetGroupId = config.salesGroupId ? String(config.salesGroupId) : null;
    payload.targetUserIds = Array.isArray(config.userPool) ? config.userPool.map(String) : [];
  }

  return updateReturning<any>(
    "AssignmentRule",
    payload,
    'where "tenantId" = $1 and id = $2',
    [tenantId, id],
    'id, name, description, "entityType", priority, "isActive", conditions, strategy, "targetGroupId", "targetUserIds", "createdAt", "updatedAt"',
  );
}

export async function deleteAssignmentRuleForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await execute('delete from "AssignmentRule" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

export async function listLeadScoringRulesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    'select id, name, description, "fieldKey", operator, value, "scoreChange", "isActive", "order", "createdAt", "updatedAt" from "LeadScoringRule" where "tenantId" = $1 order by "order" asc',
    [tenantId],
  );
}

export async function createLeadScoringRuleForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  return insertReturning<any>("LeadScoringRule", {
    id: randomUUID(),
    tenantId,
    name: String(input.name ?? "").trim(),
    description: input.description ? String(input.description) : null,
    fieldKey: String(input.fieldKey ?? ""),
    operator: String(input.operator ?? "EQUALS"),
    value: input.value ? String(input.value) : null,
    scoreChange: Number(input.scoreChange ?? 0),
    isActive: input.isActive !== false,
    order: Number(input.order ?? 0),
    createdAt: now,
    updatedAt: now,
  }, 'id, name, description, "fieldKey", operator, value, "scoreChange", "isActive", "order", "createdAt", "updatedAt"');
}

export async function updateLeadScoringRuleForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "description", "fieldKey", "operator", "value"]) {
    if (key in input) payload[key] = input[key] === "" ? null : input[key];
  }
  if ("scoreChange" in input) payload.scoreChange = Number(input.scoreChange ?? 0);
  if ("isActive" in input) payload.isActive = input.isActive !== false;
  if ("order" in input) payload.order = Number(input.order ?? 0);

  return updateReturning<any>(
    "LeadScoringRule",
    payload,
    'where "tenantId" = $1 and id = $2',
    [tenantId, id],
    'id, name, description, "fieldKey", operator, value, "scoreChange", "isActive", "order", "createdAt", "updatedAt"',
  );
}

export async function deleteLeadScoringRuleForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await execute('delete from "LeadScoringRule" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

export async function recomputeLeadScoresForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const [rules, leads] = await Promise.all([
    listLeadScoringRulesForTenant(user),
    query<any>('select id, name, email, phone, company, status, source, score from "Lead" where "tenantId" = $1', [tenantId]),
  ]);
  const activeRules = rules.filter((rule) => rule.isActive).sort((a, b) => a.order - b.order);
  const now = new Date().toISOString();

  await Promise.all(leads.map(async (lead) => {
    let score = 0;
    for (const rule of activeRules) {
      if (evaluateRuleAgainstLead(rule, lead)) score += Number(rule.scoreChange ?? 0);
    }
    const nextScore = Math.max(0, Math.min(100, score));
    await execute('update "Lead" set score = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4', [nextScore, now, tenantId, lead.id]);
  }));

  return { count: leads.length };
}

export async function listCustomFieldsForTenant(user: TenantUser, objectType?: string | null) {
  const tenantId = requireTenantId(user);
  const objectId = objectType ? await getObjectDefinitionId(tenantId, objectType) : null;
  const fields = await query<any>(
    `select id, "objectId", key, label, type, "isRequired", "isUnique", "isImmutable", "defaultValue", options, "order",
            "isActive", "createdAt", "updatedAt", "isCustom", "entityType", "entityTypeId"
     from "FieldDefinition"
     where "tenantId" = $1 and "isCustom" = true and "deletedAt" is null
       and ($2::text is null or "objectId" = $2)
     order by "order" asc`,
    [tenantId, objectId],
  );
  const objects = await query<any>('select id, name from "ObjectDefinition" where "tenantId" = $1', [tenantId]);
  const objectNameMap = new Map(objects.map((object) => [object.id, object.name.toUpperCase()]));

  return fields.map((field) => ({
    id: field.id,
    key: field.key,
    label: field.label,
    objectType: objectNameMap.get(field.objectId) ?? "LEAD",
    fieldType: denormalizeFieldType(field.type),
    type: field.type,
    required: field.isRequired ?? false,
    isRequired: field.isRequired ?? false,
    isSystem: !field.isCustom,
    metadata: { options: getFieldOptions(field.type, field.options) },
    options: getFieldOptions(field.type, field.options),
    entityType: field.entityType ?? null,
    entityTypeId: field.entityTypeId ?? null,
    order: field.order ?? 0,
    isActive: field.isActive ?? true,
  }));
}

export async function reorderCustomFieldsForTenant(user: TenantUser, ids: string[]) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  await Promise.all(ids.map((id, index) => (
    execute('update "FieldDefinition" set "order" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4', [index + 1, now, tenantId, id])
  )));
}

export async function createCustomFieldForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const objectType = String(input.objectType ?? "LEAD");
  const objectId = await getObjectDefinitionId(tenantId, objectType);
  const now = new Date().toISOString();
  const normalizedType = normalizeFieldType(String(input.type ?? input.fieldType ?? "TEXT"));

  return insertReturning<any>("FieldDefinition", {
    id: randomUUID(),
    tenantId,
    objectId,
    key: String(input.key ?? ""),
    label: String(input.label ?? ""),
    type: normalizedType,
    storageStrategy: "HYBRID",
    isCustom: true,
    isRequired: input.required === true || input.isRequired === true,
    isUnique: false,
    isImmutable: false,
    defaultValue: null,
    options: Array.isArray(input.options) ? input.options : null,
    entityType: input.entityType ? String(input.entityType) : null,
    entityTypeId: input.entityTypeId ? String(input.entityTypeId) : null,
    order: Number(input.order ?? 0),
    isActive: input.isActive !== false,
    createdAt: now,
    updatedAt: now,
  }, 'id, "objectId", key, label, type, "isRequired", options, "order", "isActive", "isCustom", "entityType", "entityTypeId"');
}

export async function updateCustomFieldForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if ("label" in input) payload.label = String(input.label ?? "");
  if ("key" in input) payload.key = String(input.key ?? "");
  if ("type" in input || "fieldType" in input) payload.type = normalizeFieldType(String(input.type ?? input.fieldType ?? "TEXT"));
  if ("required" in input || "isRequired" in input) payload.isRequired = input.required === true || input.isRequired === true;
  if ("options" in input) payload.options = Array.isArray(input.options) ? input.options : null;
  if ("entityType" in input) payload.entityType = input.entityType ? String(input.entityType) : null;
  if ("entityTypeId" in input) payload.entityTypeId = input.entityTypeId ? String(input.entityTypeId) : null;
  if ("order" in input) payload.order = Number(input.order ?? 0);
  if ("isActive" in input) payload.isActive = input.isActive !== false;

  return updateReturning<any>(
    "FieldDefinition",
    payload,
    'where "tenantId" = $1 and id = $2',
    [tenantId, id],
    'id, "objectId", key, label, type, "isRequired", options, "order", "isActive", "isCustom", "entityType", "entityTypeId"',
  );
}

export async function deleteCustomFieldForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await execute('update "FieldDefinition" set "deletedAt" = $1, "isActive" = false where "tenantId" = $2 and id = $3', [
    new Date().toISOString(),
    tenantId,
    id,
  ]);
}

export async function listOpportunityTypeConfigsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const objectId = await getObjectDefinitionId(tenantId, "OPPORTUNITY");
  const [types, opportunityCounts, fields] = await Promise.all([
    query<any>(
      'select id, name, description, icon, color, "order", "isActive", "createdAt", "updatedAt" from "OpportunityType" where "tenantId" = $1 and "objectId" = $2 order by "order" asc',
      [tenantId, objectId],
    ),
    query<any>('select "opportunityTypeId", count(*)::int as count from "Opportunity" where "tenantId" = $1 group by "opportunityTypeId"', [tenantId]),
    query<any>('select id from "FieldDefinition" where "tenantId" = $1 and "objectId" = $2 and "isCustom" = true and "deletedAt" is null', [tenantId, objectId]),
  ]);
  const opportunityCountByType = new Map(opportunityCounts.map((item) => [item.opportunityTypeId, Number(item.count ?? 0)]));

  return types.map((type) => ({
    ...type,
    defaultStageId: null,
    _count: {
      opportunities: opportunityCountByType.get(type.id) ?? 0,
      customFields: fields.length,
    },
  }));
}

export async function createOpportunityTypeConfigForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const objectId = await getObjectDefinitionId(tenantId, "OPPORTUNITY");
  const now = new Date().toISOString();
  const last = await queryOne<{ order: number }>(
    'select "order" from "OpportunityType" where "tenantId" = $1 and "objectId" = $2 order by "order" desc limit 1',
    [tenantId, objectId],
  );
  const order = typeof input.order === "number" ? Number(input.order) : Number(last?.order ?? 0) + 1;

  return insertReturning<any>("OpportunityType", {
    id: randomUUID(),
    tenantId,
    objectId,
    name: String(input.name ?? "").trim(),
    description: input.description ? String(input.description) : null,
    icon: input.icon ? String(input.icon) : null,
    color: input.color ? String(input.color) : null,
    order,
    isActive: input.isActive !== false,
    createdAt: now,
    updatedAt: now,
  }, 'id, name, description, icon, color, "order", "isActive", "createdAt", "updatedAt"');
}

export async function updateOpportunityTypeConfigForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "description", "icon", "color"]) {
    if (key in input) payload[key] = input[key] === "" ? null : input[key];
  }
  if ("isActive" in input) payload.isActive = input.isActive !== false;
  if ("order" in input) payload.order = Number(input.order ?? 0);

  return updateReturning<any>(
    "OpportunityType",
    payload,
    'where "tenantId" = $1 and id = $2',
    [tenantId, id],
    'id, name, description, icon, color, "order", "isActive", "createdAt", "updatedAt"',
  );
}

export async function deleteOpportunityTypeConfigForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await execute('delete from "OpportunityType" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

export async function reorderOpportunityTypesForTenant(user: TenantUser, ids: string[]) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  await Promise.all(ids.map((id, index) => (
    execute('update "OpportunityType" set "order" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4', [index + 1, now, tenantId, id])
  )));
}

export async function getGeneralSettingsForTenant(user: TenantUser): Promise<GeneralSettings> {
  return pgAdminModules.getGeneralSettingsForTenant(user);
}

export async function updateGeneralSettingsForTenant(user: TenantUser, input: Record<string, unknown>) {
  return pgAdminModules.updateGeneralSettingsForTenant(user, input);
}
