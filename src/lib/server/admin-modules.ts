import { archiveItemForTenant } from "@/lib/server/archive-items";
import { assertModuleEnabled, assertTenantModule } from "@/lib/server/module-entitlements";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { randomUUID } from "crypto";
import { seedDefaultStages } from "@/lib/repositories/stages-postgres";
import { execute, query, queryOne, jsonbParam, queryAsSystem, executeAsSystem, type Queryable } from "@/lib/db/query";
import { withTransaction } from "@/lib/db/transaction";
import * as pgAdminModules from "@/lib/repositories/admin-modules-postgres";
import { requireTenantId } from "@/lib/server/tenant-guard";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  isPlatformAdmin?: boolean;
};

type GeneralSettings = {
  companyName: string;
  timezone: string;
  currency: string;
  language: string;
  dateFormat: string;
};


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

export async function getTeamForTenant(user: TenantUser, id: string) {
  return pgAdminModules.getTeamForTenant(user, id);
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

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Normalized schema (migration 0082) -- see distribution-engine.ts's own RuleBundle type for
// the read-side counterpart. Builds the UI-facing `config` shape from the 4 child tables
// instead of unpacking a single conditions jsonb blob.
async function loadAssignmentRuleConfigs(tenantId: string, ruleIds: string[], client?: Queryable) {
  const configs = new Map<string, Record<string, unknown>>(ruleIds.map((id) => [id, {
    userPool: [] as string[],
    fallbackUserId: undefined as string | undefined,
    conditions: [] as Array<{ field: string; operator: string; value: unknown }>,
    userWeights: {} as Record<string, number>,
    maxAssignmentsPerUser: undefined as number | undefined,
    maxAssignmentsPerWindow: undefined as number | undefined,
    windowPeriod: "DAY",
    activeFrom: undefined as string | undefined,
    activeUntil: undefined as string | undefined,
    requiredSkills: [] as string[],
  }]));
  if (ruleIds.length === 0) return configs;

  // A shared TransactionClient wraps a single pg connection (can't run overlapping queries),
  // and -- more importantly here -- must be used so a caller mid-transaction (create/update,
  // just below) reads back the child rows it just wrote before they've committed. Without a
  // client (the plain list/read path), the pool lets these run concurrently.
  const conditions = await query<any>('select "ruleId", field, operator, value, "order" from "DistributionCondition" where "tenantId" = $1 and "ruleId" = any($2::text[]) order by "ruleId", "order"', [tenantId, ruleIds], client);
  const targets = await query<any>('select "ruleId", "userId", "isPoolMember", "isFallback", weight from "DistributionTarget" where "tenantId" = $1 and "ruleId" = any($2::text[])', [tenantId, ruleIds], client);
  const quotas = await query<any>('select "ruleId", "maxAssignmentsPerUser", "maxAssignmentsPerWindow", "windowPeriod" from "DistributionQuota" where "tenantId" = $1 and "ruleId" = any($2::text[])', [tenantId, ruleIds], client);
  const availabilities = await query<any>('select "ruleId", "activeFrom", "activeUntil", "requiredSkills" from "DistributionAvailability" where "tenantId" = $1 and "ruleId" = any($2::text[])', [tenantId, ruleIds], client);

  for (const row of conditions) {
    const config = configs.get(row.ruleId);
    if (config) (config.conditions as unknown[]).push({ field: row.field, operator: row.operator, value: row.value });
  }
  for (const row of targets) {
    const config = configs.get(row.ruleId);
    if (!config) continue;
    if (row.isPoolMember) (config.userPool as string[]).push(row.userId);
    if (row.isFallback) config.fallbackUserId = row.userId;
    if (row.isPoolMember && row.weight !== null) (config.userWeights as Record<string, number>)[row.userId] = Number(row.weight);
  }
  for (const row of quotas) {
    const config = configs.get(row.ruleId);
    if (!config) continue;
    config.maxAssignmentsPerUser = row.maxAssignmentsPerUser ?? undefined;
    config.maxAssignmentsPerWindow = row.maxAssignmentsPerWindow ?? undefined;
    config.windowPeriod = row.windowPeriod ?? "DAY";
  }
  for (const row of availabilities) {
    const config = configs.get(row.ruleId);
    if (!config) continue;
    config.activeFrom = row.activeFrom ?? undefined;
    config.activeUntil = row.activeUntil ?? undefined;
    config.requiredSkills = Array.isArray(row.requiredSkills) ? row.requiredSkills : [];
  }

  return configs;
}

export async function listAssignmentRulesForTenant(user: TenantUser) {
  await assertTenantModule(user, "DISTRIBUTION");
  const tenantId = requireTenantId(user);
  const rows = await query<any>(
    // An archived rule set's rules show as ungrouped until it's restored.
    `select id, name, description, "entityType", priority, "isActive", strategy, "targetGroupId", "territoryField",
            case when exists (select 1 from "DistributionRuleSet" s where s.id = "AssignmentRule"."ruleSetId" and s."deletedAt" is null) then "ruleSetId" end as "ruleSetId",
            "isDefault", "createdAt", "updatedAt"
     from "AssignmentRule"
     where "tenantId" = $1 and "deletedAt" is null
     order by priority desc`,
    [tenantId],
  );

  const configs = await loadAssignmentRuleConfigs(tenantId, rows.map((rule) => rule.id));

  return rows.map((rule) => ({
    ...rule,
    type: rule.strategy,
    config: { ...configs.get(rule.id), salesGroupId: rule.targetGroupId ?? undefined, territoryField: rule.territoryField ?? undefined },
  }));
}

// Writes the 4 child tables for a rule from the builder's submitted `config`, replacing
// whatever was there before -- except DistributionTarget.fairnessCredit, which is carried
// forward for any user who remains in the pool/fallback slot after the edit (the normalized-
// schema equivalent of the old jsonb rebuild's careful __weightedState preservation: an
// unrelated edit, like renaming the rule, must not reset a user's accumulated weighted-fairness
// credit). DistributionCondition ordering and DistributionQuota/DistributionAvailability have
// no persisted state of their own, so those are a plain delete-and-reinsert.
async function writeAssignmentRuleChildRows(tenantId: string, ruleId: string, config: Record<string, unknown>, isDefault: boolean, client: Queryable) {
  const now = new Date().toISOString();

  await execute('delete from "DistributionCondition" where "tenantId" = $1 and "ruleId" = $2', [tenantId, ruleId], client);
  const conditions = isDefault ? [] : Array.isArray(config.conditions) ? config.conditions : [];
  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index] as Record<string, unknown>;
    if (!condition || !condition.field) continue;
    await execute(
      `insert into "DistributionCondition" (id, "tenantId", "ruleId", field, operator, value, "order", "createdAt", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
      [randomUUID(), tenantId, ruleId, String(condition.field), String(condition.operator ?? "equals"), jsonbParam(condition.value), index, now],
      client,
    );
  }

  const existingTargets = await query<{ userId: string; fairnessCredit: number }>(
    'select "userId", "fairnessCredit" from "DistributionTarget" where "tenantId" = $1 and "ruleId" = $2',
    [tenantId, ruleId],
    client,
  );
  const creditByUserId = new Map(existingTargets.map((target) => [target.userId, Number(target.fairnessCredit) || 0]));
  await execute('delete from "DistributionTarget" where "tenantId" = $1 and "ruleId" = $2', [tenantId, ruleId], client);

  const poolIds: string[] = Array.isArray(config.userPool) ? config.userPool.map(String) : [];
  const fallbackUserId = config.fallbackUserId ? String(config.fallbackUserId) : null;
  const weights = config.userWeights && typeof config.userWeights === "object" ? (config.userWeights as Record<string, unknown>) : {};
  const targetUserIds = new Set([...poolIds, ...(fallbackUserId ? [fallbackUserId] : [])]);
  for (const userId of targetUserIds) {
    const isPoolMember = poolIds.includes(userId);
    const isFallback = userId === fallbackUserId;
    const weight = isPoolMember && weights[userId] !== undefined && weights[userId] !== null && weights[userId] !== "" ? Number(weights[userId]) || null : null;
    await execute(
      `insert into "DistributionTarget" (id, "tenantId", "ruleId", "userId", "isPoolMember", "isFallback", weight, "fairnessCredit", "createdAt", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [randomUUID(), tenantId, ruleId, userId, isPoolMember, isFallback, weight, creditByUserId.get(userId) ?? 0, now],
      client,
    );
  }

  await execute('delete from "DistributionQuota" where "tenantId" = $1 and "ruleId" = $2', [tenantId, ruleId], client);
  const maxAssignmentsPerUser = Number(config.maxAssignmentsPerUser) > 0 ? Number(config.maxAssignmentsPerUser) : null;
  const maxAssignmentsPerWindow = Number(config.maxAssignmentsPerWindow) > 0 ? Number(config.maxAssignmentsPerWindow) : null;
  if (maxAssignmentsPerUser || maxAssignmentsPerWindow) {
    await execute(
      `insert into "DistributionQuota" (id, "tenantId", "ruleId", "maxAssignmentsPerUser", "maxAssignmentsPerWindow", "windowPeriod", "createdAt", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [randomUUID(), tenantId, ruleId, maxAssignmentsPerUser, maxAssignmentsPerWindow, maxAssignmentsPerWindow ? (config.windowPeriod === "WEEK" ? "WEEK" : "DAY") : null, now],
      client,
    );
  }

  await execute('delete from "DistributionAvailability" where "tenantId" = $1 and "ruleId" = $2', [tenantId, ruleId], client);
  const activeFrom = isValidDateString(config.activeFrom) ? (config.activeFrom as string) : null;
  const activeUntil = isValidDateString(config.activeUntil) ? (config.activeUntil as string) : null;
  const requiredSkills = Array.isArray(config.requiredSkills) && config.requiredSkills.length > 0 ? config.requiredSkills.map(String) : null;
  if (activeFrom || activeUntil || requiredSkills) {
    await execute(
      `insert into "DistributionAvailability" (id, "tenantId", "ruleId", "activeFrom", "activeUntil", "requiredSkills", "createdAt", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [randomUUID(), tenantId, ruleId, activeFrom, activeUntil, requiredSkills, now],
      client,
    );
  }
}

async function loadAssignmentRuleForTenant(tenantId: string, ruleId: string, client: Queryable) {
  const rule = await queryOne<any>(
    `select id, name, description, "entityType", priority, "isActive", strategy, "targetGroupId", "territoryField", "ruleSetId", "isDefault", "createdAt", "updatedAt"
     from "AssignmentRule" where "tenantId" = $1 and id = $2 and "deletedAt" is null`,
    [tenantId, ruleId],
    client,
  );
  if (!rule) throw new Error("ASSIGNMENTRULE_NOT_FOUND");
  const configs = await loadAssignmentRuleConfigs(tenantId, [ruleId], client);
  return { ...rule, type: rule.strategy, config: { ...configs.get(ruleId), salesGroupId: rule.targetGroupId ?? undefined, territoryField: rule.territoryField ?? undefined } };
}

// A default (catch-all) rule always matches -- its conditions are forced empty regardless
// of what's passed in, and only one may exist per tenant+entityType, so marking a new rule
// default silently un-defaults whichever rule previously held that slot rather than leaving
// two catch-alls to race on priority order.
async function clearOtherDefaultRules(tenantId: string, entityType: string, exceptId?: string) {
  const clauses = ['"tenantId" = $1', '"entityType" = $2', '"isDefault" = true'];
  const values: unknown[] = [tenantId, entityType];
  if (exceptId) {
    values.push(exceptId);
    clauses.push(`id <> $${values.length}`);
  }
  await execute(`update "AssignmentRule" set "isDefault" = false where ${clauses.join(" and ")}`, values);
}

export async function createAssignmentRuleForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "DISTRIBUTION", { isPlatformAdmin: user.isPlatformAdmin });
  const config = (input.config as Record<string, unknown>) ?? {};
  const isDefault = input.isDefault === true;
  const entityType = input.entityType ? String(input.entityType) : "LEAD";
  const now = new Date().toISOString();
  const ruleId = randomUUID();

  if (isDefault) await clearOtherDefaultRules(tenantId, entityType);

  return withTransaction(user, async (client) => {
    await execute(
      `insert into "AssignmentRule"
         (id, "tenantId", name, description, "entityType", priority, "isActive", "isDefault", strategy, "targetGroupId", "territoryField", "ruleSetId", "roundRobinCursor", "createdAt", "updatedAt")
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,-1,$13,$13)`,
      [
        ruleId,
        tenantId,
        String(input.name ?? "").trim(),
        input.description ? String(input.description) : null,
        entityType,
        Number(input.priority ?? 0),
        input.isActive !== false,
        isDefault,
        input.type ? String(input.type) : "ROUND_ROBIN",
        config.salesGroupId ? String(config.salesGroupId) : null,
        config.territoryField ? String(config.territoryField) : null,
        input.ruleSetId ? String(input.ruleSetId) : null,
        now,
      ],
      client,
    );

    await writeAssignmentRuleChildRows(tenantId, ruleId, config, isDefault, client);

    return loadAssignmentRuleForTenant(tenantId, ruleId, client);
  });
}

export async function updateAssignmentRuleForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "DISTRIBUTION", { isPlatformAdmin: user.isPlatformAdmin });
  const config = (input.config as Record<string, unknown>) ?? {};
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if ("name" in input) payload.name = String(input.name ?? "").trim();
  if ("description" in input) payload.description = input.description ? String(input.description) : null;
  if ("entityType" in input) payload.entityType = String(input.entityType ?? "LEAD");
  if ("priority" in input) payload.priority = Number(input.priority ?? 0);
  if ("isActive" in input) payload.isActive = input.isActive !== false;
  if ("type" in input) payload.strategy = String(input.type ?? "ROUND_ROBIN");
  if ("isDefault" in input) payload.isDefault = input.isDefault === true;
  if ("ruleSetId" in input) payload.ruleSetId = input.ruleSetId ? String(input.ruleSetId) : null;
  if ("config" in input) {
    payload.targetGroupId = config.salesGroupId ? String(config.salesGroupId) : null;
    payload.territoryField = config.territoryField ? String(config.territoryField) : null;
  }

  if (payload.isDefault === true) {
    const entityType = String(payload.entityType ?? (await queryOne<any>('select "entityType" from "AssignmentRule" where id = $1 and "tenantId" = $2', [id, tenantId]))?.entityType ?? "LEAD");
    await clearOtherDefaultRules(tenantId, entityType, id);
  }

  return withTransaction(user, async (client) => {
    // An archived rule can't be edited; restore it first.
    const updated = await updateReturning<any>("AssignmentRule", payload, 'where "tenantId" = $1 and id = $2 and "deletedAt" is null', [tenantId, id], "id");
    if (!updated) throw new Error("ASSIGNMENTRULE_NOT_FOUND");

    if ("config" in input) {
      // isDefault may not be part of THIS patch (e.g. only config changed) -- fall back to the
      // row's current isDefault so a config-only edit on an existing default rule still forces
      // its conditions empty, matching create's behavior.
      const isDefault = "isDefault" in payload
        ? payload.isDefault === true
        : Boolean((await queryOne<any>('select "isDefault" from "AssignmentRule" where "tenantId" = $1 and id = $2', [tenantId, id], client))?.isDefault);
      await writeAssignmentRuleChildRows(tenantId, id, config, isDefault, client);
    }

    return loadAssignmentRuleForTenant(tenantId, id, client);
  });
}

export async function deleteAssignmentRuleForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "DISTRIBUTION", { isPlatformAdmin: user.isPlatformAdmin });
  // Delete archives the rule (decision 31): it stops assigning at once and can be restored for 30
  // days; its conditions, targets, quota and availability are kept with it.
  return archiveItemForTenant(user, "assignment-rule", id);
}

// Drag/drop reordering: the dragged-into order becomes the new priority order top-to-bottom
// (index 0 = highest priority), matching distribution-engine's `order by priority desc`.
export async function reorderAssignmentRulesForTenant(user: TenantUser, orderedIds: string[]) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "DISTRIBUTION", { isPlatformAdmin: user.isPlatformAdmin });
  const total = orderedIds.length;
  await Promise.all(orderedIds.map((id, index) =>
    execute('update "AssignmentRule" set priority = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4', [total - index, new Date().toISOString(), tenantId, id])
  ));
}

// Distribution rule folders (DistributionRuleSet, migration 0082) -- purely organizational,
// grouping rules for display in the builder; AssignmentRule.ruleSetId is nullable (ungrouped is
// the default) and ON DELETE SET NULL, so deleting a folder never destroys the rules in it.
export async function listDistributionRuleSetsForTenant(user: TenantUser, entityType?: string) {
  await assertTenantModule(user, "DISTRIBUTION");
  const tenantId = requireTenantId(user);
  const clauses = ['"tenantId" = $1'];
  const params: unknown[] = [tenantId];
  if (entityType) {
    params.push(String(entityType).toUpperCase());
    clauses.push(`"entityType" = $${params.length}`);
  }
  return query<any>(
    `select id, "entityType", name, description, "order", "isActive", "createdAt", "updatedAt" from "DistributionRuleSet" where ${clauses.join(" and ")} and "deletedAt" is null order by "order" asc, name asc`,
    params,
  );
}

export async function createDistributionRuleSetForTenant(user: TenantUser, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "DISTRIBUTION", { isPlatformAdmin: user.isPlatformAdmin });
  const now = new Date().toISOString();
  return insertReturning<any>(
    "DistributionRuleSet",
    {
      id: randomUUID(),
      tenantId,
      entityType: input.entityType ? String(input.entityType).toUpperCase() : "LEAD",
      name: String(input.name ?? "").trim(),
      description: input.description ? String(input.description) : null,
      order: Number(input.order ?? 0),
      isActive: input.isActive !== false,
      createdAt: now,
      updatedAt: now,
    },
    'id, "entityType", name, description, "order", "isActive", "createdAt", "updatedAt"',
  );
}

export async function updateDistributionRuleSetForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "DISTRIBUTION", { isPlatformAdmin: user.isPlatformAdmin });
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if ("name" in input) payload.name = String(input.name ?? "").trim();
  if ("description" in input) payload.description = input.description ? String(input.description) : null;
  if ("order" in input) payload.order = Number(input.order ?? 0);
  if ("isActive" in input) payload.isActive = input.isActive !== false;
  return updateReturning<any>(
    "DistributionRuleSet",
    payload,
    'where "tenantId" = $1 and id = $2 and "deletedAt" is null',
    [tenantId, id],
    'id, "entityType", name, description, "order", "isActive", "createdAt", "updatedAt"',
  );
}

export async function deleteDistributionRuleSetForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "DISTRIBUTION", { isPlatformAdmin: user.isPlatformAdmin });
  // Delete archives the folder (decision 31); its rules keep working and show as ungrouped until
  // it's restored.
  return archiveItemForTenant(user, "assignment-rule-set", id);
}

export async function listLeadScoringRulesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    'select id, name, description, "fieldKey", operator, value, "scoreChange", "isActive", "order", "createdAt", "updatedAt" from "LeadScoringRule" where "tenantId" = $1 and "deletedAt" is null order by "order" asc',
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
    'where "tenantId" = $1 and id = $2 and "deletedAt" is null',
    [tenantId, id],
    'id, name, description, "fieldKey", operator, value, "scoreChange", "isActive", "order", "createdAt", "updatedAt"',
  );
}

export async function deleteLeadScoringRuleForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  // Delete archives the rule (decision 31): it stops scoring at once; restore within 30 days.
  return archiveItemForTenant(user, "lead-scoring-rule", id);
}

// WP07 (F04): BACKGROUND_JOB, disposition B -- its one caller is the worker's own
// "scoring.recomputeRules" dynamic job, dispatched with tenantId in job data but no ambient
// tenant context (it's a headless worker process, not a request).
export async function recomputeLeadScoresForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const rules = await listLeadScoringRulesForTenant(user);
  const activeRules = rules.filter((rule) => rule.isActive).sort((a, b) => a.order - b.order);
  const now = new Date().toISOString();

  // Round-2 plan B5: it used to load every lead and fire one update per lead all at once, which
  // could use up the database connections. Leads are now read 1,000 at a time in id order, and
  // each batch's changed scores are written in one statement.
  let count = 0;
  let changed = 0;
  let afterId = "";
  for (;;) {
    const leads = await queryAsSystem<any>(
      'select id, name, email, phone, company, status, source, score from "Lead" where "tenantId" = $1 and id > $2 order by id limit 1000',
      [tenantId, afterId],
    );
    if (!leads.length || leads[leads.length - 1].id === afterId) break;
    afterId = leads[leads.length - 1].id;
    count += leads.length;
    const ids: string[] = [];
    const scores: number[] = [];
    for (const lead of leads) {
      let score = 0;
      for (const rule of activeRules) {
        if (evaluateRuleAgainstLead(rule, lead)) score += Number(rule.scoreChange ?? 0);
      }
      const nextScore = Math.max(0, Math.min(100, score));
      if (Number(lead.score) !== nextScore) {
        ids.push(lead.id);
        scores.push(nextScore);
      }
    }
    if (ids.length) {
      changed += ids.length;
      await executeAsSystem(
        `update "Lead" l set score = v.score, "updatedAt" = $3
         from unnest($1::text[], $2::int[]) as v(id, score)
         where l."tenantId" = $4 and l.id = v.id`,
        [ids, scores, now, tenantId],
      );
    }
    if (leads.length < 1000) break;
  }

  return { count, changed };
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
    // jsonbParam: a bare array would be sent as a Postgres array literal.
    options: Array.isArray(input.options) ? jsonbParam(input.options) : null,
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
  if ("options" in input) payload.options = Array.isArray(input.options) ? jsonbParam(input.options) : null;
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

// Priority Module 12's "product catalog" item 3 -- an OpportunityType (e.g. "University 1")
// can optionally link to a catalog Program, so future course-dropdown/fee-plan/document-checklist
// UI (separate, later items) can resolve the right catalog data through this one FK. `Program.id`
// alone has no composite (tenantId, id) constraint, so a cross-tenant id could otherwise slip
// through -- verified here at the application layer instead.
async function assertProgramBelongsToTenant(tenantId: string, programId: string) {
  const row = await queryOne<{ id: string }>('select id from "Program" where id = $1 and "tenantId" = $2', [programId, tenantId]);
  if (!row) throw new Error("PROGRAM_NOT_FOUND");
}

export async function listOpportunityTypeConfigsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const objectId = await getObjectDefinitionId(tenantId, "OPPORTUNITY");
  const [types, opportunityCounts, fields] = await Promise.all([
    query<any>(
      'select id, name, description, icon, color, "order", "isActive", "programId", "createdAt", "updatedAt" from "OpportunityType" where "tenantId" = $1 and "objectId" = $2 order by "order" asc',
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
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const tenantId = requireTenantId(user);
  const objectId = await getObjectDefinitionId(tenantId, "OPPORTUNITY");
  const now = new Date().toISOString();
  const last = await queryOne<{ order: number }>(
    'select "order" from "OpportunityType" where "tenantId" = $1 and "objectId" = $2 order by "order" desc limit 1',
    [tenantId, objectId],
  );
  const order = typeof input.order === "number" ? Number(input.order) : Number(last?.order ?? 0) + 1;
  const programId = input.programId ? String(input.programId) : null;
  if (programId) await assertProgramBelongsToTenant(tenantId, programId);

  const created = await insertReturning<any>("OpportunityType", {
    id: randomUUID(),
    tenantId,
    objectId,
    name: String(input.name ?? "").trim(),
    description: input.description ? String(input.description) : null,
    icon: input.icon ? String(input.icon) : null,
    color: input.color ? String(input.color) : null,
    order,
    isActive: input.isActive !== false,
    programId,
    createdAt: now,
    updatedAt: now,
  }, 'id, name, description, icon, color, "order", "isActive", "programId", "createdAt", "updatedAt"');
  // A new type starts with an open, a Won and a Lost stage, so opportunities can be created in it
  // straight away; the stage editor changes them (decision 34).
  await seedDefaultStages(tenantId, created.id);
  return created;
}

export async function updateOpportunityTypeConfigForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const tenantId = requireTenantId(user);
  const payload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const key of ["name", "description", "icon", "color"]) {
    if (key in input) payload[key] = input[key] === "" ? null : input[key];
  }
  if ("isActive" in input) payload.isActive = input.isActive !== false;
  if ("order" in input) payload.order = Number(input.order ?? 0);
  if ("programId" in input) {
    const programId = input.programId ? String(input.programId) : null;
    if (programId) await assertProgramBelongsToTenant(tenantId, programId);
    payload.programId = programId;
  }

  return updateReturning<any>(
    "OpportunityType",
    payload,
    'where "tenantId" = $1 and id = $2',
    [tenantId, id],
    'id, name, description, icon, color, "order", "isActive", "programId", "createdAt", "updatedAt"',
  );
}

export async function deleteOpportunityTypeConfigForTenant(user: TenantUser, id: string) {
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
  const tenantId = requireTenantId(user);
  await execute('delete from "OpportunityType" where "tenantId" = $1 and id = $2', [tenantId, id]);
}

export async function reorderOpportunityTypesForTenant(user: TenantUser, ids: string[]) {
  await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
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
