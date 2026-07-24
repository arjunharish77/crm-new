import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
};

type EntityType = "LEAD" | "OPPORTUNITY";

type DistributionResult = {
  assignedUserId: string | null;
  ruleId: string | null;
  strategy: string | null;
  reason: string;
};

function tenantIdFor(user: TenantUser) {
  if (!user.tenantId) {
    throw new Error("Tenant context required for distribution");
  }

  return user.tenantId;
}

function normalizeEntityType(entityType: string): EntityType {
  return entityType.toUpperCase() === "OPPORTUNITY" ? "OPPORTUNITY" : "LEAD";
}

function valueAt(record: Record<string, unknown>, field: string) {
  if (field.includes(".")) {
    return field.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, record);
  }

  return record[field];
}

function conditionMatches(actual: unknown, expected: unknown) {
  if (expected === undefined || expected === null || expected === "") return true;

  if (typeof expected === "object" && !Array.isArray(expected)) {
    const config = expected as Record<string, unknown>;
    const operator = String(config.operator ?? "equals");
    const value = config.value;
    const values = Array.isArray(value) ? value.map(String) : [];

    if ((operator === "equals" || operator === "in") && values.length > 0) return values.includes(String(actual ?? ""));
    if ((operator === "not_equals" || operator === "not_in") && values.length > 0) return !values.includes(String(actual ?? ""));
    if (operator === "not_equals") return String(actual ?? "") !== String(value ?? "");
    if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
    if (operator === "greater_than") return Number(actual) > Number(value);
    if (operator === "less_than") return Number(actual) < Number(value);
    if (operator === "in" && Array.isArray(value)) return value.map(String).includes(String(actual));

    return String(actual ?? "") === String(value ?? "");
  }

  if (Array.isArray(expected)) return expected.map(String).includes(String(actual));

  return String(actual ?? "").toLowerCase() === String(expected).toLowerCase();
}

function ruleMatches(rule: any, record: Record<string, unknown>) {
  const conditions = rule.conditions && typeof rule.conditions === "object" ? rule.conditions : {};
  const entries = Object.entries(conditions).filter(([key]) => !key.startsWith("__"));

  return entries.every(([field, expected]) => conditionMatches(valueAt(record, field), expected));
}

async function getUsersForRule(tenantId: string, rule: any) {
  let userIds = Array.isArray(rule.targetUserIds) ? rule.targetUserIds.map(String) : [];

  if (userIds.length === 0 && rule.targetGroupId) {
    const members = await query<{ userId: string }>(
      'select "userId" from "SalesGroupMember" where "tenantId" = $1 and "groupId" = $2',
      [tenantId, rule.targetGroupId],
    );
    userIds = members.map((member) => member.userId).filter(Boolean);
  }

  if (userIds.length === 0) return [];

  const users = await query<any>(
    'select id, name, email from "User" where "tenantId" = $1 and id = any($2::text[])',
    [tenantId, userIds],
  );
  const userMap = new Map(users.map((user) => [user.id, user]));
  return userIds.map((id: string) => userMap.get(id)).filter(Boolean);
}

async function countOpenAssignments(tenantId: string, entityType: EntityType, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, number>();

  const table = entityType === "OPPORTUNITY" ? '"Opportunity"' : '"Lead"';
  const rows = await query<{ ownerId: string | null }>(
    `select "ownerId" from ${table} where "tenantId" = $1 and "ownerId" = any($2::text[])`,
    [tenantId, userIds],
  );

  const counts = new Map(userIds.map((id) => [id, 0]));
  for (const record of rows) {
    if (record.ownerId) counts.set(record.ownerId, (counts.get(record.ownerId) ?? 0) + 1);
  }

  return counts;
}

async function chooseUser(tenantId: string, entityType: EntityType, rule: any, users: any[]) {
  if (users.length === 0) return null;

  const strategy = String(rule.strategy ?? "ROUND_ROBIN").toUpperCase();
  const userIds = users.map((user) => user.id);

  if (strategy === "LOAD_BASED") {
    const counts = await countOpenAssignments(tenantId, entityType, userIds);
    return users
      .slice()
      .sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0))[0];
  }

  const conditions = rule.conditions && typeof rule.conditions === "object" ? { ...rule.conditions } : {};
  const cursor = Number(conditions.__roundRobinCursor ?? -1);
  const nextIndex = (cursor + 1) % users.length;
  conditions.__roundRobinCursor = nextIndex;

  await execute(
    'update "AssignmentRule" set conditions = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4',
    [conditions, new Date().toISOString(), tenantId, rule.id],
  );

  return users[nextIndex];
}

async function getFallbackUser(tenantId: string, rule: any) {
  const fallbackUserId = rule.conditions?.__fallbackUserId;
  if (!fallbackUserId) return null;

  return queryOne<any>(
    'select id, name, email from "User" where "tenantId" = $1 and id = $2',
    [tenantId, String(fallbackUserId)],
  );
}

async function writeAssignmentLog(input: {
  tenantId: string;
  ruleId: string | null;
  entityType: EntityType;
  entityId: string;
  assignedUserId: string | null;
  strategy: string | null;
  reason: string;
}) {
  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, 'ASSIGN', $4, $5, $6, $7, $8, $9, $10)`,
    [
      randomUUID(),
      input.tenantId,
      input.assignedUserId,
      input.entityType,
      input.entityId,
      null,
      { ownerId: input.assignedUserId },
      {
        ruleId: input.ruleId,
        strategy: input.strategy,
        reason: input.reason,
      },
      { source: "distribution_engine" },
      new Date().toISOString(),
    ],
  );
}

export async function distributeRecord(
  user: TenantUser,
  entityTypeInput: string,
  entityId: string,
  record: Record<string, unknown>,
): Promise<DistributionResult> {
  const tenantId = tenantIdFor(user);
  const entityType = normalizeEntityType(entityTypeInput);
  const rules = await query<any>(
    `select id, name, "entityType", priority, "isActive", conditions, strategy, "targetGroupId", "targetUserIds"
     from "AssignmentRule"
     where "tenantId" = $1 and "entityType" = $2 and "isActive" = true
     order by priority desc`,
    [tenantId, entityType],
  );

  for (const rule of rules) {
    if (!ruleMatches(rule, record)) continue;

    const users = await getUsersForRule(tenantId, rule);
    const selectedUser = await chooseUser(tenantId, entityType, rule, users);
    const assignee = selectedUser?.id ? selectedUser : await getFallbackUser(tenantId, rule);
    if (!assignee?.id) continue;

    const table = entityType === "OPPORTUNITY" ? '"Opportunity"' : '"Lead"';
    await execute(
      `update ${table} set "ownerId" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4`,
      [assignee.id, new Date().toISOString(), tenantId, entityId],
    );

    const result = {
      assignedUserId: assignee.id,
      ruleId: rule.id,
      strategy: rule.strategy,
      reason: selectedUser?.id ? `Matched ${rule.name}` : `Matched ${rule.name}; used fallback owner`,
    };

    await writeAssignmentLog({
      tenantId,
      ruleId: rule.id,
      entityType,
      entityId,
      assignedUserId: assignee.id,
      strategy: rule.strategy,
      reason: result.reason,
    });

    return result;
  }

  return {
    assignedUserId: null,
    ruleId: null,
    strategy: null,
    reason: "No active matching distribution rule",
  };
}
