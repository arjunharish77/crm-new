import { randomUUID } from "crypto";
import { execute, query, queryOne, jsonbParam, type Queryable } from "@/lib/db/query";
import { withTransaction, type TransactionClient } from "@/lib/db/transaction";
import { isModuleEnabledForTenant } from "@/lib/server/module-entitlements";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { createUserNotification } from "@/lib/server/notifications";
import { zonedWallClockParts } from "@/lib/server/date-format";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { applyRecordScopeClause } from "@/lib/server/record-scope";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
};

// Widened variant for the manual-reassignment call chain only (reassignRecordOwner,
// bulkReassignRecordOwners, executeReassignment, previewReassignmentImpact) -- these need
// role/teamId to enforce record-access scope (see record-scope.ts); the base TenantUser stays
// narrow because withTransaction elsewhere expects its own AppUserContext shape, whose `role`
// is a plain string (an unrelated concept), and widening the shared type would conflict with it.
type ScopedActor = TenantUser & {
  teamId?: string | null;
  role?: { permissions?: any } | string | null;
};

type EntityType = "LEAD" | "OPPORTUNITY";

type DistributionResult = {
  assignedUserId: string | null;
  ruleId: string | null;
  strategy: string | null;
  reason: string;
};

type Candidate = {
  id: string;
  name?: string | null;
  email?: string | null;
  skills?: unknown;
  isAvailableForAssignment?: boolean;
  teamId?: string | null;
};

// --------------------------------------------------------------------------------------------
// Normalized rule config -- see migration 0082. A "RuleRow" is the base AssignmentRule columns;
// a "RuleBundle" adds its child-table config (conditions/targets/quota/availability), loaded
// either from the database (real rules) or synthesized in memory (an unsaved draft rule from
// the rule builder's in-builder simulation -- see toDraftBundle below).
// --------------------------------------------------------------------------------------------

type DistributionCondition = { field: string; operator: string; value: unknown };
type DistributionTargetRow = { userId: string; isPoolMember: boolean; isFallback: boolean; weight: number | null; fairnessCredit: number };
type DistributionQuotaRow = { maxAssignmentsPerUser: number | null; maxAssignmentsPerWindow: number | null; windowPeriod: string | null };
type DistributionAvailabilityRow = { activeFrom: string | null; activeUntil: string | null; requiredSkills: string[] };

type RuleRow = {
  id: string;
  name: string;
  entityType: string;
  priority: number;
  isActive: boolean;
  strategy: string;
  targetGroupId: string | null;
  isDefault: boolean;
  roundRobinCursor: number;
  territoryField: string | null;
  ruleSetId?: string | null;
};

type RuleBundle = {
  conditions: DistributionCondition[];
  targets: DistributionTargetRow[];
  quota: DistributionQuotaRow | null;
  availability: DistributionAvailabilityRow | null;
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

// Real field/operator/value triples now (DistributionCondition), replacing the old dual-shape
// jsonb value (a bare string OR an {operator,value} object) -- operator is always explicit,
// defaulting to "equals" at the column level. The operator vocabulary matches
// src/components/common/condition-builder.tsx's ConditionFieldOption-driven picker exactly,
// since that's what the rule builder now authors these rows with.
function conditionMatches(actual: unknown, operator: string, expected: unknown): boolean {
  // "Has any value" / "Is empty" don't compare against `expected` at all -- handled before the
  // usual "empty expected means always match" short-circuit below, since for these two an empty
  // `expected` is the normal, valid case (the value column is unused for them).
  if (operator === "contains_data") return actual !== undefined && actual !== null && String(actual) !== "";
  if (operator === "not_contains_data") return actual === undefined || actual === null || String(actual) === "";

  if (expected === undefined || expected === null || expected === "") return true;
  const expectedList = Array.isArray(expected) ? expected.map(String) : null;

  switch (operator) {
    case "in":
      return expectedList ? expectedList.includes(String(actual ?? "")) : String(actual ?? "").toLowerCase() === String(expected).toLowerCase();
    case "not_in":
    case "not_equals":
      return expectedList ? !expectedList.includes(String(actual ?? "")) : String(actual ?? "").toLowerCase() !== String(expected).toLowerCase();
    case "contains":
      return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "greater_than":
      return Number(actual) > Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "greater_than_or_equal":
      return Number(actual) >= Number(expected);
    case "less_than_or_equal":
      return Number(actual) <= Number(expected);
    case "after":
      return new Date(String(actual ?? "")).getTime() > new Date(String(expected)).getTime();
    case "before":
      return new Date(String(actual ?? "")).getTime() < new Date(String(expected)).getTime();
    case "equals":
    default:
      return expectedList ? expectedList.includes(String(actual ?? "")) : String(actual ?? "").toLowerCase() === String(expected).toLowerCase();
  }
}

function ruleMatches(bundle: RuleBundle, record: Record<string, unknown>) {
  return bundle.conditions.every((condition) => conditionMatches(valueAt(record, condition.field), condition.operator, condition.value));
}

// Optional activation window (DistributionAvailability.activeFrom/activeUntil, plain dates) --
// a rule with neither set is always active, the existing default, unaffected. Compared as plain
// calendar dates in UTC rather than a tenant/team local timezone, matching this engine's general
// preference to keep every non-"working hours" concept timezone-agnostic. activeUntil is
// inclusive of the entire day, not just up to its midnight boundary, so an admin setting "active
// until the 30th" gets the whole 30th rather than losing it to a UTC-midnight off-by-one.
function isRuleCurrentlyActive(bundle: RuleBundle, now: Date): boolean {
  const activeFrom = bundle.availability?.activeFrom;
  const activeUntil = bundle.availability?.activeUntil;
  if (activeFrom && now < new Date(activeFrom)) return false;
  if (activeUntil) {
    const until = new Date(activeUntil);
    until.setUTCHours(23, 59, 59, 999);
    if (now > until) return false;
  }
  return true;
}

// Batch-loads every active rule's child-table config in 4 queries total (regardless of rule
// count) rather than one query per rule per table -- the read-side cost of moving off a single
// jsonb blob per rule. Sequential, not Promise.all: a TransactionClient wraps a single pg
// connection, which can't run overlapping queries concurrently.
async function loadRuleBundles(tenantId: string, rules: RuleRow[], client?: Queryable): Promise<Map<string, RuleBundle>> {
  const bundles = new Map<string, RuleBundle>(rules.map((rule) => [rule.id, { conditions: [], targets: [], quota: null, availability: null }]));
  const ruleIds = rules.map((rule) => rule.id);
  if (ruleIds.length === 0) return bundles;

  const conditions = await query<{ ruleId: string; field: string; operator: string; value: unknown }>(
    'select "ruleId", field, operator, value from "DistributionCondition" where "tenantId" = $1 and "ruleId" = any($2::text[]) order by "ruleId", "order"',
    [tenantId, ruleIds],
    client,
  );
  const targets = await query<{ ruleId: string; userId: string; isPoolMember: boolean; isFallback: boolean; weight: number | null; fairnessCredit: number }>(
    'select "ruleId", "userId", "isPoolMember", "isFallback", weight, "fairnessCredit" from "DistributionTarget" where "tenantId" = $1 and "ruleId" = any($2::text[])',
    [tenantId, ruleIds],
    client,
  );
  const quotas = await query<{ ruleId: string; maxAssignmentsPerUser: number | null; maxAssignmentsPerWindow: number | null; windowPeriod: string | null }>(
    'select "ruleId", "maxAssignmentsPerUser", "maxAssignmentsPerWindow", "windowPeriod" from "DistributionQuota" where "tenantId" = $1 and "ruleId" = any($2::text[])',
    [tenantId, ruleIds],
    client,
  );
  const availabilities = await query<{ ruleId: string; activeFrom: string | null; activeUntil: string | null; requiredSkills: string[] | null }>(
    'select "ruleId", "activeFrom", "activeUntil", "requiredSkills" from "DistributionAvailability" where "tenantId" = $1 and "ruleId" = any($2::text[])',
    [tenantId, ruleIds],
    client,
  );

  for (const row of conditions) bundles.get(row.ruleId)?.conditions.push({ field: row.field, operator: row.operator, value: row.value });
  for (const row of targets) {
    bundles.get(row.ruleId)?.targets.push({
      userId: row.userId,
      isPoolMember: row.isPoolMember,
      isFallback: row.isFallback,
      weight: row.weight === null ? null : Number(row.weight),
      fairnessCredit: Number(row.fairnessCredit) || 0,
    });
  }
  for (const row of quotas) {
    const bundle = bundles.get(row.ruleId);
    if (bundle) bundle.quota = { maxAssignmentsPerUser: row.maxAssignmentsPerUser, maxAssignmentsPerWindow: row.maxAssignmentsPerWindow, windowPeriod: row.windowPeriod };
  }
  for (const row of availabilities) {
    const bundle = bundles.get(row.ruleId);
    if (bundle) bundle.availability = { activeFrom: row.activeFrom, activeUntil: row.activeUntil, requiredSkills: Array.isArray(row.requiredSkills) ? row.requiredSkills : [] };
  }

  return bundles;
}

// TERRITORY_BASED: no explicit target pool/group -- eligible candidates are every member of
// every SalesGroup whose territories/states/countries/zipCodes list contains the record's value
// at rule.territoryField (case-insensitive). No Lead/Opportunity address columns exist anywhere
// in this schema, so territoryField is deliberately a generic dotted-path lookup -- an admin
// points it at whatever field actually carries the territory-ish value for their data (a custom
// field, source, company, etc.), and SalesGroup.territories doubles as a free-form tag list
// rather than requiring a structured geography model this schema has no other use for.
async function getUsersForTerritoryRule(tenantId: string, rule: RuleRow, record: Record<string, unknown>, client?: Queryable): Promise<Candidate[]> {
  const territoryValue = rule.territoryField ? valueAt(record, rule.territoryField) : undefined;
  const normalized = territoryValue === undefined || territoryValue === null ? "" : String(territoryValue).trim().toLowerCase();
  if (!normalized) return [];

  const groups = await query<{ id: string; territories: unknown; states: unknown; countries: unknown; zipCodes: unknown }>(
    'select id, territories, states, countries, "zipCodes" from "SalesGroup" where "tenantId" = $1 and "isActive" = true',
    [tenantId],
    client,
  );

  const matchesList = (list: unknown) => Array.isArray(list) && list.some((entry) => String(entry).trim().toLowerCase() === normalized);
  const matchingGroupIds = groups
    .filter((group) => matchesList(group.territories) || matchesList(group.states) || matchesList(group.countries) || matchesList(group.zipCodes))
    .map((group) => group.id);
  if (matchingGroupIds.length === 0) return [];

  const members = await query<{ userId: string }>(
    'select distinct "userId" from "SalesGroupMember" where "tenantId" = $1 and "groupId" = any($2::text[])',
    [tenantId, matchingGroupIds],
    client,
  );
  const userIds = [...new Set(members.map((member) => member.userId).filter(Boolean))];
  if (userIds.length === 0) return [];

  return query<Candidate>(
    'select id, name, email, skills, "isAvailableForAssignment", "teamId" from "User" where "tenantId" = $1 and id = any($2::text[])',
    [tenantId, userIds],
    client,
  );
}

async function getUsersForRule(tenantId: string, rule: RuleRow, bundle: RuleBundle, record: Record<string, unknown>, client?: Queryable): Promise<Candidate[]> {
  if (String(rule.strategy ?? "").toUpperCase() === "TERRITORY_BASED") {
    return getUsersForTerritoryRule(tenantId, rule, record, client);
  }

  let userIds = bundle.targets.filter((target) => target.isPoolMember).map((target) => target.userId);

  if (userIds.length === 0 && rule.targetGroupId) {
    const members = await query<{ userId: string }>(
      'select "userId" from "SalesGroupMember" where "tenantId" = $1 and "groupId" = $2',
      [tenantId, rule.targetGroupId],
      client,
    );
    userIds = members.map((member) => member.userId).filter(Boolean);
  }

  if (userIds.length === 0) return [];

  const users = await query<any>(
    'select id, name, email, skills, "isAvailableForAssignment", "teamId" from "User" where "tenantId" = $1 and id = any($2::text[])',
    [tenantId, userIds],
    client,
  );
  const userMap = new Map(users.map((user) => [user.id, user]));
  return userIds.map((id: string) => userMap.get(id)).filter(Boolean);
}

// Manual "away"/check-in toggle (User.isAvailableForAssignment) -- a hard filter, since the
// whole point is "don't route to someone who's told the system they're unavailable." See
// filterByWorkingHours below for the separate, schedule-based (Team/SalesGroup workingHours)
// filter.
function filterByAvailability(users: Candidate[]) {
  return users.filter((user) => user.isAvailableForAssignment !== false);
}

// User.skills is stored as {category: string[]} (see edit-user-dialog.tsx) -- flatten every
// category's tags into one set and require the candidate to have ALL of the rule's required
// skills, not just one.
function filterBySkills(users: Candidate[], requiredSkills: string[] | undefined) {
  if (!requiredSkills || requiredSkills.length === 0) return users;
  return users.filter((user) => {
    const skills = user.skills && typeof user.skills === "object" ? user.skills as Record<string, string[]> : {};
    const flat = new Set(Object.values(skills).flat().map(String));
    return requiredSkills.every((skill) => flat.has(skill));
  });
}

// Team.workingHours shape (jsonb): { days?: number[] (0=Sun..6=Sat, omitted/empty = every day),
// start: "HH:MM", end: "HH:MM" }, interpreted in the owning row's own timezone column. A team
// with no workingHours configured (the default) imposes no restriction at all, so this filter
// is a no-op for every tenant until an admin actually opts a team into scheduled hours.
function isWithinConfiguredWorkingHours(workingHours: unknown, timeZone: string, now: Date): boolean {
  if (!workingHours || typeof workingHours !== "object") return true;
  const config = workingHours as { days?: unknown; start?: unknown; end?: unknown };
  const start = typeof config.start === "string" && /^\d{2}:\d{2}$/.test(config.start) ? config.start : null;
  const end = typeof config.end === "string" && /^\d{2}:\d{2}$/.test(config.end) ? config.end : null;
  if (!start || !end) return true;

  const { dayOfWeek, hour, minute } = zonedWallClockParts(now, timeZone);
  const days = Array.isArray(config.days) ? config.days.map(Number) : [];
  if (days.length > 0 && !days.includes(dayOfWeek)) return false;

  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const currentMinutes = hour * 60 + minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return startMinutes <= endMinutes
    ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
    : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

// SalesGroup has the exact same workingHours/timezone shape as Team. A rule that targets a
// SalesGroup (rule.targetGroupId, no explicit pool) applies that group's own hours uniformly to
// every member; a rule that targets individual users falls back to each candidate's own Team.
// Deliberately a HARD filter, unlike filterByQuota's graceful degrade-to-full-pool below --
// quota is an explicitly documented soft preference, but "is this person actually on the clock
// right now" is a real constraint the same way availability/skills are.
async function filterByWorkingHours(tenantId: string, rule: RuleRow, bundle: RuleBundle, users: Candidate[], client?: Queryable): Promise<Candidate[]> {
  if (users.length === 0) return users;
  const now = new Date();
  const hasExplicitUserTargets = bundle.targets.some((target) => target.isPoolMember);

  if (!hasExplicitUserTargets && rule.targetGroupId) {
    const group = await queryOne<{ workingHours: unknown; timezone: string }>(
      'select "workingHours", timezone from "SalesGroup" where "tenantId" = $1 and id = $2 limit 1',
      [tenantId, rule.targetGroupId],
      client,
    );
    if (!group) return users;
    return isWithinConfiguredWorkingHours(group.workingHours, group.timezone, now) ? users : [];
  }

  const teamIds = [...new Set(users.map((user) => user.teamId).filter((id): id is string => Boolean(id)))];
  if (teamIds.length === 0) return users;

  const teams = await query<{ id: string; workingHours: unknown; timezone: string }>(
    'select id, "workingHours", timezone from "Team" where "tenantId" = $1 and id = any($2::text[])',
    [tenantId, teamIds],
    client,
  );
  const teamById = new Map(teams.map((team) => [team.id, team]));
  return users.filter((user) => {
    const team = user.teamId ? teamById.get(user.teamId) : undefined;
    if (!team) return true;
    return isWithinConfiguredWorkingHours(team.workingHours, team.timezone, now);
  });
}

async function countOpenAssignments(tenantId: string, entityType: EntityType, userIds: string[], client?: Queryable) {
  if (userIds.length === 0) return new Map<string, number>();

  const table = entityType === "OPPORTUNITY" ? '"Opportunity"' : '"Lead"';
  const rows = await query<{ ownerId: string | null }>(
    `select "ownerId" from ${table} where "tenantId" = $1 and "ownerId" = any($2::text[])`,
    [tenantId, userIds],
    client,
  );

  const counts = new Map(userIds.map((id) => [id, 0]));
  for (const record of rows) {
    if (record.ownerId) counts.set(record.ownerId, (counts.get(record.ownerId) ?? 0) + 1);
  }

  return counts;
}

// Quota is a soft preference, not a hard block: if every candidate is already over quota, fall
// back to the full (pre-quota) candidate list rather than leaving the record permanently
// unassigned.
async function filterByQuota(tenantId: string, entityType: EntityType, users: Candidate[], maxPerUser: number | null | undefined, client?: Queryable) {
  if (!maxPerUser || maxPerUser <= 0 || users.length === 0) return users;
  const counts = await countOpenAssignments(tenantId, entityType, users.map((user) => user.id), client);
  const underQuota = users.filter((user) => (counts.get(user.id) ?? 0) < maxPerUser);
  return underQuota.length > 0 ? underQuota : users;
}

async function countWindowAssignments(tenantId: string, entityType: EntityType, userIds: string[], windowStart: Date, client?: Queryable) {
  if (userIds.length === 0) return new Map<string, number>();

  const rows = await query<{ assignedToId: string }>(
    `select "assignedToId" from "AssignmentLog"
     where "tenantId" = $1 and "entityType" = $2 and "assignedToId" = any($3::text[]) and "assignedAt" >= $4`,
    [tenantId, entityType, userIds, windowStart.toISOString()],
    client,
  );

  const counts = new Map(userIds.map((id) => [id, 0]));
  for (const row of rows) counts.set(row.assignedToId, (counts.get(row.assignedToId) ?? 0) + 1);
  return counts;
}

// Distinct from filterByQuota's standing open-workload cap: this is a rolling-window throughput
// cap sourced from AssignmentLog. Same graceful-degrade philosophy as filterByQuota.
async function filterByWindowCap(
  tenantId: string,
  entityType: EntityType,
  users: Candidate[],
  maxPerWindow: number | null | undefined,
  windowPeriod: unknown,
  client?: Queryable,
) {
  if (!maxPerWindow || maxPerWindow <= 0 || users.length === 0) return users;
  const windowMs = String(windowPeriod).toUpperCase() === "WEEK" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const windowStart = new Date(Date.now() - windowMs);
  const counts = await countWindowAssignments(tenantId, entityType, users.map((user) => user.id), windowStart, client);
  const underCap = users.filter((user) => (counts.get(user.id) ?? 0) < maxPerWindow);
  return underCap.length > 0 ? underCap : users;
}

// ROUND_ROBIN and WEIGHTED both advance persisted per-rule state (AssignmentRule.roundRobinCursor
// / DistributionTarget.fairnessCredit) on every real pick. A Postgres advisory lock scoped to
// this transaction serializes concurrent callers on the same rule id.
async function acquireRuleLock(client: TransactionClient, ruleId: string) {
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`assignment-rule:${ruleId}`]);
}

// Account/owner-affinity target: whoever already owns the "related" record. No Account object
// exists in this schema, so this is scoped to the two relationships that actually exist: an
// Opportunity's parent Lead, and a Lead that shares an email with an existing, already-owned Lead.
async function resolveStickyOwnerId(tenantId: string, entityType: EntityType, record: Record<string, unknown>, client?: Queryable): Promise<string | null> {
  if (entityType === "OPPORTUNITY") {
    const leadId = record.leadId;
    if (!leadId) return null;
    const lead = await queryOne<{ ownerId: string | null }>(
      'select "ownerId" from "Lead" where "tenantId" = $1 and id = $2 limit 1',
      [tenantId, String(leadId)],
      client,
    );
    return lead?.ownerId ?? null;
  }

  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  if (!email) return null;
  const recordId = record.id ? String(record.id) : null;
  const existing = await queryOne<{ ownerId: string | null }>(
    `select "ownerId" from "Lead"
     where "tenantId" = $1 and lower(email) = $2 and "ownerId" is not null${recordId ? " and id <> $3" : ""}
     order by "createdAt" desc
     limit 1`,
    recordId ? [tenantId, email, recordId] : [tenantId, email],
    client,
  );
  return existing?.ownerId ?? null;
}

async function chooseUser(
  tenantId: string,
  entityType: EntityType,
  rule: RuleRow,
  bundle: RuleBundle,
  users: Candidate[],
  record: Record<string, unknown>,
  dryRun: boolean,
  client?: TransactionClient,
) {
  if (users.length === 0) return null;

  const strategy = String(rule.strategy ?? "ROUND_ROBIN").toUpperCase();

  if (strategy === "LOAD_BASED") {
    const counts = await countOpenAssignments(tenantId, entityType, users.map((user) => user.id), client);
    return users.slice().sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0))[0];
  }

  if (strategy === "STICKY_TO_OWNER") {
    const stickyOwnerId = await resolveStickyOwnerId(tenantId, entityType, record, client);
    const sticky = stickyOwnerId ? users.find((user) => user.id === stickyOwnerId) : undefined;
    if (sticky) return sticky;
  }

  if (!dryRun && client) {
    await acquireRuleLock(client, rule.id);
  }

  if (strategy === "WEIGHTED") {
    // Smooth weighted round robin (the same algorithm nginx/LVS use for weighted balancing).
    const userIds = users.map((user) => user.id);
    const latestTargets = dryRun
      ? bundle.targets
      : await query<{ userId: string; weight: number | null; fairnessCredit: number }>(
          'select "userId", weight, "fairnessCredit" from "DistributionTarget" where "tenantId" = $1 and "ruleId" = $2 and "userId" = any($3::text[])',
          [tenantId, rule.id, userIds],
          client,
        );
    const targetByUserId = new Map(latestTargets.map((target) => [target.userId, target]));
    const weightFor = (id: string) => Math.max(1, Number(targetByUserId.get(id)?.weight) || 1);
    const creditFor = (id: string) => Number(targetByUserId.get(id)?.fairnessCredit) || 0;

    let best = users[0];
    let bestScore = -Infinity;
    const nextCredits = new Map<string, number>();
    for (const candidate of users) {
      const current = creditFor(candidate.id) + weightFor(candidate.id);
      nextCredits.set(candidate.id, current);
      if (current > bestScore) {
        bestScore = current;
        best = candidate;
      }
    }
    const totalWeight = users.reduce((sum, candidate) => sum + weightFor(candidate.id), 0);
    nextCredits.set(best.id, (nextCredits.get(best.id) ?? 0) - totalWeight);

    if (!dryRun) {
      const ids = [...nextCredits.keys()];
      const credits = ids.map((id) => nextCredits.get(id) ?? 0);
      await execute(
        `update "DistributionTarget" as t set "fairnessCredit" = v.credit, "updatedAt" = $1
         from (select unnest($2::text[]) as "userId", unnest($3::numeric[]) as credit) as v
         where t."tenantId" = $4 and t."ruleId" = $5 and t."userId" = v."userId"`,
        [new Date().toISOString(), ids, credits, tenantId, rule.id],
        client,
      );
    }

    return best;
  }

  // Round robin -- re-read the latest committed cursor after acquiring the lock, in case
  // another caller just advanced it while this one was waiting for its turn.
  const latestCursor = dryRun
    ? Number(rule.roundRobinCursor ?? -1)
    : Number(
        (await queryOne<{ roundRobinCursor: number }>('select "roundRobinCursor" from "AssignmentRule" where "tenantId" = $1 and id = $2', [tenantId, rule.id], client))
          ?.roundRobinCursor ?? -1,
      );
  const nextIndex = (latestCursor + 1) % users.length;

  if (!dryRun) {
    await execute(
      'update "AssignmentRule" set "roundRobinCursor" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4',
      [nextIndex, new Date().toISOString(), tenantId, rule.id],
      client,
    );
  }

  return users[nextIndex];
}

async function getFallbackUser(tenantId: string, bundle: RuleBundle, client?: Queryable) {
  const fallbackTarget = bundle.targets.find((target) => target.isFallback);
  if (!fallbackTarget) return null;

  return queryOne<any>('select id, name, email from "User" where "tenantId" = $1 and id = $2', [tenantId, fallbackTarget.userId], client);
}

async function writeAssignmentLog(
  input: {
    tenantId: string;
    ruleId: string | null;
    entityType: EntityType;
    entityId: string;
    assignedUserId: string;
    strategy: string | null;
    reason: string;
    assignedById?: string | null;
    actorId?: string | null;
    trace?: DistributionTrace[];
  },
  client?: Queryable,
) {
  const now = new Date().toISOString();

  // AssignmentLog is the real DistributionDecisionLog. `trace` persists the full per-candidate
  // skip-reason trace for this specific decision, not just the final outcome/reason string.
  await execute(
    `insert into "AssignmentLog" (id, "tenantId", "entityType", "entityId", "assignedToId", "assignedById", "ruleId", reason, trace, "assignedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [randomUUID(), input.tenantId, input.entityType, input.entityId, input.assignedUserId, input.assignedById ?? null, input.ruleId, input.reason, jsonbParam(input.trace), now],
    client,
  );

  await execute(
    `insert into "AuditLog" (id, "tenantId", "userId", action, "entityType", "entityId", before, after, diff, metadata, "createdAt")
     values ($1, $2, $3, 'ASSIGN', $4, $5, $6, $7, $8, $9, $10)`,
    [
      randomUUID(),
      input.tenantId,
      input.actorId ?? input.assignedUserId,
      input.entityType,
      input.entityId,
      null,
      { ownerId: input.assignedUserId },
      { ruleId: input.ruleId, strategy: input.strategy, reason: input.reason, assignedById: input.assignedById ?? null },
      { source: input.ruleId ? "distribution_engine" : "manual_reassignment" },
      now,
    ],
    client,
  );
}

export type DistributionTrace = {
  ruleId: string | null;
  ruleName: string | null;
  strategy: string | null;
  candidates: Array<{ id: string; name: string | null; email: string | null; excludedReason?: string }>;
  selectedUserId: string | null;
  usedFallback: boolean;
  reason: string;
};

// Shape accepted for an unsaved draft rule from the rule builder's in-builder simulation --
// mirrors the builder's own form+config fields closely to minimize UI-side translation.
export type DraftRuleInput = {
  entityType: string;
  strategy: string;
  targetGroupId?: string | null;
  territoryField?: string | null;
  targets?: Array<{ userId: string; isPoolMember?: boolean; isFallback?: boolean; weight?: number | null }>;
  conditions?: DistributionCondition[];
  quota?: Partial<DistributionQuotaRow>;
  availability?: { activeFrom?: string | null; activeUntil?: string | null; requiredSkills?: string[] };
};

function toDraftRuleAndBundle(input: DraftRuleInput): { rule: RuleRow; bundle: RuleBundle } {
  const rule: RuleRow = {
    id: "draft",
    name: "Draft rule",
    entityType: normalizeEntityType(input.entityType),
    priority: 0,
    isActive: true,
    strategy: String(input.strategy ?? "ROUND_ROBIN").toUpperCase(),
    targetGroupId: input.targetGroupId ?? null,
    isDefault: false,
    roundRobinCursor: -1,
    territoryField: input.territoryField ?? null,
  };
  const bundle: RuleBundle = {
    conditions: input.conditions ?? [],
    targets: (input.targets ?? []).map((target) => ({
      userId: target.userId,
      isPoolMember: target.isPoolMember !== false,
      isFallback: target.isFallback === true,
      weight: target.weight ?? null,
      fairnessCredit: 0,
    })),
    quota: input.quota
      ? { maxAssignmentsPerUser: input.quota.maxAssignmentsPerUser ?? null, maxAssignmentsPerWindow: input.quota.maxAssignmentsPerWindow ?? null, windowPeriod: input.quota.windowPeriod ?? null }
      : null,
    availability: input.availability
      ? { activeFrom: input.availability.activeFrom ?? null, activeUntil: input.availability.activeUntil ?? null, requiredSkills: input.availability.requiredSkills ?? [] }
      : null,
  };
  return { rule, bundle };
}

// Shared by both the real distributeRecord and the read-only simulator -- one code path, so
// "what the simulator predicts" can never drift from "what actually happens." An optional
// draftOverride bypasses the DB rule fetch entirely and evaluates exactly one hypothetical rule
// -- used by the rule builder's in-builder simulation of an unsaved draft.
async function resolveDistribution(
  tenantId: string,
  entityType: EntityType,
  record: Record<string, unknown>,
  dryRun: boolean,
  client?: TransactionClient,
  draftOverride?: { rule: RuleRow; bundle: RuleBundle },
): Promise<{ result: DistributionResult; trace: DistributionTrace[] }> {
  let rules: RuleRow[];
  let bundles: Map<string, RuleBundle>;

  if (draftOverride) {
    rules = [draftOverride.rule];
    bundles = new Map([[draftOverride.rule.id, draftOverride.bundle]]);
  } else {
    rules = await query<RuleRow>(
      `select id, name, "entityType", priority, "isActive", strategy, "targetGroupId", "isDefault", "roundRobinCursor", "territoryField"
       from "AssignmentRule"
       where "tenantId" = $1 and "entityType" = $2 and "isActive" = true
       order by priority desc`,
      [tenantId, entityType],
      client,
    );
    bundles = await loadRuleBundles(tenantId, rules, client);
  }

  const trace: DistributionTrace[] = [];
  const now = new Date();

  for (const rule of rules) {
    const bundle = bundles.get(rule.id) ?? { conditions: [], targets: [], quota: null, availability: null };
    if (!ruleMatches(bundle, record)) continue;
    // Same as a ruleMatches failure -- a rule outside its configured activation window is
    // treated as "doesn't match right now" and silently skipped, no trace entry.
    if (!isRuleCurrentlyActive(bundle, now)) continue;

    const allCandidates = await getUsersForRule(tenantId, rule, bundle, record, client);
    const available = filterByAvailability(allCandidates);
    const requiredSkills = bundle.availability?.requiredSkills?.length ? bundle.availability.requiredSkills : undefined;
    const skillFiltered = filterBySkills(available, requiredSkills);
    const workingHoursFiltered = await filterByWorkingHours(tenantId, rule, bundle, skillFiltered, client);
    const quotaFiltered = await filterByQuota(tenantId, entityType, workingHoursFiltered, bundle.quota?.maxAssignmentsPerUser, client);
    const windowCapFiltered = await filterByWindowCap(tenantId, entityType, quotaFiltered, bundle.quota?.maxAssignmentsPerWindow, bundle.quota?.windowPeriod, client);

    const selectedUser = await chooseUser(tenantId, entityType, rule, bundle, windowCapFiltered, record, dryRun, client);
    const assignee = selectedUser?.id ? selectedUser : await getFallbackUser(tenantId, bundle, client);

    const availableIds = new Set(available.map((user) => user.id));
    const skillIds = new Set(skillFiltered.map((user) => user.id));
    const workingHoursIds = new Set(workingHoursFiltered.map((user) => user.id));
    const windowCapIds = new Set(windowCapFiltered.map((user) => user.id));
    const candidateTrace = allCandidates.map((user) => ({
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      excludedReason: !availableIds.has(user.id)
        ? "Marked unavailable"
        : requiredSkills && !skillIds.has(user.id)
          ? "Missing required skill"
          : !workingHoursIds.has(user.id)
            ? "Outside configured working hours"
            : !windowCapIds.has(user.id)
              ? "Reached daily/weekly assignment cap"
              : undefined,
    }));

    if (!assignee?.id) {
      trace.push({
        ruleId: rule.id,
        ruleName: rule.name,
        strategy: rule.strategy,
        candidates: candidateTrace,
        selectedUserId: null,
        usedFallback: false,
        reason: "Matched but no eligible candidate and no fallback user configured",
      });
      continue;
    }

    const reason = selectedUser?.id ? `Matched ${rule.name}` : `Matched ${rule.name}; used fallback owner`;
    trace.push({
      ruleId: rule.id,
      ruleName: rule.name,
      strategy: rule.strategy,
      candidates: candidateTrace,
      selectedUserId: assignee.id,
      usedFallback: !selectedUser?.id,
      reason,
    });

    return {
      result: { assignedUserId: assignee.id, ruleId: draftOverride ? null : rule.id, strategy: rule.strategy, reason },
      trace,
    };
  }

  return {
    result: { assignedUserId: null, ruleId: null, strategy: null, reason: "No active matching distribution rule" },
    trace,
  };
}

export async function distributeRecord(
  user: TenantUser,
  entityTypeInput: string,
  entityId: string,
  record: Record<string, unknown>,
): Promise<DistributionResult> {
  const tenantId = tenantIdFor(user);
  const entityType = normalizeEntityType(entityTypeInput);

  if (!(await isModuleEnabledForTenant(tenantId, "DISTRIBUTION"))) {
    return { assignedUserId: null, ruleId: null, strategy: null, reason: "Distribution module disabled for tenant" };
  }

  let trace: DistributionTrace[] = [];
  const result = await withTransaction(user, async (client) => {
    const resolved = await resolveDistribution(tenantId, entityType, record, false, client);
    trace = resolved.trace;

    if (resolved.result.assignedUserId) {
      const table = entityType === "OPPORTUNITY" ? '"Opportunity"' : '"Lead"';
      await execute(
        `update ${table} set "ownerId" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4`,
        [resolved.result.assignedUserId, new Date().toISOString(), tenantId, entityId],
        client,
      );

      await writeAssignmentLog(
        {
          tenantId,
          ruleId: resolved.result.ruleId,
          entityType,
          entityId,
          assignedUserId: resolved.result.assignedUserId,
          strategy: resolved.result.strategy,
          reason: resolved.result.reason,
          trace: resolved.trace,
        },
        client,
      );
    }

    return resolved.result;
  });

  const eventSuffix = result.assignedUserId ? "DISTRIBUTION_SUCCESS" : "DISTRIBUTION_FAILED";
  await runAutomationsForEvent(user, `${entityType}_${eventSuffix}`, entityType, entityId, { ...record, ...result }).catch(() => undefined);

  return result;
}

// Read-only: never writes ownerId, never writes AuditLog/AssignmentLog, never advances a
// round-robin cursor or weighted fairness credit. Persists a DistributionSimulation row
// best-effort (a failed insert must never break the simulate response). `draftRule`, when
// supplied, simulates exactly that unsaved rule in isolation (bypassing every saved rule
// entirely) -- what the rule builder's in-builder "simulate this draft" uses; omitted, this
// behaves as before (simulate against the tenant's real saved rules).
export async function simulateDistribution(
  user: TenantUser,
  entityTypeInput: string,
  record: Record<string, unknown>,
  draftRule?: DraftRuleInput,
): Promise<{ result: DistributionResult; trace: DistributionTrace[]; simulationId: string | null }> {
  const tenantId = tenantIdFor(user);
  const entityType = normalizeEntityType(entityTypeInput);
  const draftOverride = draftRule ? toDraftRuleAndBundle(draftRule) : undefined;
  const { result, trace } = await resolveDistribution(tenantId, entityType, record, true, undefined, draftOverride);

  const simulationId = randomUUID();
  const persisted = await execute(
    `insert into "DistributionSimulation" (id, "tenantId", "entityType", "inputRecord", "draftRuleOverride", result, trace, "runBy", "createdAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [simulationId, tenantId, entityType, record, draftRule ?? null, result, jsonbParam(trace), user.id, new Date().toISOString()],
  ).then(() => true).catch(() => false);

  return { result, trace, simulationId: persisted ? simulationId : null };
}

export async function listDistributionSimulationsForTenant(user: TenantUser, entityTypeInput?: string, limit = 20) {
  const tenantId = tenantIdFor(user);
  const clauses = ['"tenantId" = $1'];
  const params: unknown[] = [tenantId];
  if (entityTypeInput) {
    params.push(normalizeEntityType(entityTypeInput));
    clauses.push(`"entityType" = $${params.length}`);
  }
  params.push(Math.min(Math.max(limit, 1), 100));
  return query<any>(
    `select id, "entityType", "inputRecord", "draftRuleOverride", result, trace, "runBy", "createdAt"
     from "DistributionSimulation" where ${clauses.join(" and ")} order by "createdAt" desc limit $${params.length}`,
    params,
  );
}

// The actual reassignment write -- factored out of reassignRecordOwner so it can also be
// invoked from privileged-actions.ts's approval-execution switch when an approval-gated
// reassignment request is approved (see reassignRecordOwner below for the gate itself).
export async function executeReassignment(
  actor: ScopedActor,
  entityTypeInput: string,
  entityId: string,
  newOwnerId: string,
  reason: string,
) {
  const tenantId = tenantIdFor(actor);
  const entityType = normalizeEntityType(entityTypeInput);
  const table = entityType === "OPPORTUNITY" ? '"Opportunity"' : '"Lead"';
  // F03 fix (WP04): previously scoped by tenant only -- an OWN/TEAM-scoped actor (who shouldn't
  // even be able to SEE most tenant records on the read side, per the same-named fix in
  // leads-postgres.ts/opportunities-postgres.ts) could still reassign ANY record in the tenant
  // by id here, bypassing that scoping entirely on this write path. Bulk reassignment
  // (bulkReassignRecordOwners) calls this per-record, so this one fix covers both.
  const clauses = ["\"tenantId\" = $1"];
  const values: unknown[] = [tenantId];
  applyRecordScopeClause(clauses, values, actor, entityType, 1);
  values.push(entityId);
  const existing = await queryOne<any>(
    `select id, "ownerId" from ${table} where ${clauses.join(" and ")} and id = $${values.length} limit 1`,
    values,
  );
  if (!existing) return null;

  const newOwner = await queryOne<any>('select id, name, email from "User" where "tenantId" = $1 and id = $2 limit 1', [tenantId, newOwnerId]);
  if (!newOwner) throw new Error("REASSIGNMENT_TARGET_USER_NOT_FOUND");

  const previousOwnerId = (existing.ownerId as string | null) ?? null;
  const now = new Date().toISOString();
  await execute(`update ${table} set "ownerId" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4`, [newOwner.id, now, tenantId, entityId]);

  await writeAssignmentLog({
    tenantId,
    ruleId: null,
    entityType,
    entityId,
    assignedUserId: newOwner.id,
    strategy: "MANUAL",
    reason,
    assignedById: actor.id,
    actorId: actor.id,
  });

  if (previousOwnerId && previousOwnerId !== newOwner.id && previousOwnerId !== actor.id) {
    await createUserNotification({
      tenantId,
      userId: previousOwnerId,
      title: `${entityType === "OPPORTUNITY" ? "Opportunity" : "Lead"} reassigned`,
      message: `This ${entityType === "OPPORTUNITY" ? "opportunity" : "lead"} was reassigned to ${newOwner.name ?? newOwner.email ?? "another user"}. Reason: ${reason}`,
      data: { entityType, entityId, newOwnerId: newOwner.id },
      category: "REASSIGNMENT",
    }).catch(() => undefined);
  }

  return { entityId, previousOwnerId, newOwnerId: newOwner.id as string };
}

// Governed manual reassignment -- requires a reason, enforces an optional tenant-configured
// reassignment-count limit, routes through an approval gate when the tenant has opted into one,
// and otherwise executes immediately (writes the same real decision log rule-based distribution
// does, and notifies the previous owner). Deliberately NOT gated by the DISTRIBUTION module --
// "preserve basic manual assignment" when the module is off is exactly what this function is for.
export async function reassignRecordOwner(
  user: ScopedActor,
  entityTypeInput: string,
  entityId: string,
  input: { newOwnerId: string; reason: string },
) {
  const tenantId = tenantIdFor(user);
  const entityType = normalizeEntityType(entityTypeInput);
  const reason = input.reason?.trim();
  if (!reason) throw new Error("REASSIGNMENT_REASON_REQUIRED");
  if (!input.newOwnerId) throw new Error("REASSIGNMENT_TARGET_REQUIRED");

  const policy = await getEffectiveSecurityPolicy(tenantId);

  // Reassignment-count limit: caps how many times a single record can be manually reassigned
  // within a rolling window, regardless of who's doing it or why -- a thrash guard, not a
  // per-user cap.
  if (policy.reassignmentLimitCount && policy.reassignmentLimitCount > 0) {
    const windowDays = policy.reassignmentLimitWindowDays && policy.reassignmentLimitWindowDays > 0 ? policy.reassignmentLimitWindowDays : 7;
    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    // AssignmentLog has no `strategy` column of its own (that value only ever lands in
    // AuditLog's diff jsonb) -- a manual reassignment is identified by "ruleId is null"
    // instead, matching writeAssignmentLog's own convention (ruleId: null for MANUAL).
    const recent = await queryOne<{ count: string }>(
      `select count(*) as count from "AssignmentLog" where "tenantId" = $1 and "entityId" = $2 and "ruleId" is null and "assignedAt" >= $3`,
      [tenantId, entityId, windowStart],
    );
    if (Number(recent?.count ?? 0) >= policy.reassignmentLimitCount) {
      throw new Error("REASSIGNMENT_LIMIT_EXCEEDED");
    }
  }

  if (policy.reassignmentApprovalRequired) {
    const { createPrivilegedActionRequest } = await import("@/lib/server/privileged-actions");
    const { id: requestId } = await createPrivilegedActionRequest(user, {
      tenantId,
      actionType: "DISTRIBUTION_REASSIGNMENT",
      targetType: entityType,
      targetId: entityId,
      payload: { entityType, entityId, newOwnerId: input.newOwnerId, reason },
      reason,
    });
    return { pendingApproval: true as const, requestId };
  }

  return executeReassignment(user, entityType, entityId, input.newOwnerId, reason);
}

export type BulkReassignOutcome = {
  entityId: string;
  success: boolean;
  skipped?: boolean;
  pendingApproval?: boolean;
  error?: string;
};

// Sequential, not parallel -- each reassignment is its own small write + notification, and
// running them one at a time keeps error attribution per-record clean.
export async function bulkReassignRecordOwners(
  user: ScopedActor,
  entityTypeInput: string,
  entityIds: string[],
  input: { newOwnerId: string; reason: string },
): Promise<{ reassigned: number; failed: number; pendingApproval: number; results: BulkReassignOutcome[] }> {
  const results: BulkReassignOutcome[] = [];

  for (const entityId of entityIds) {
    try {
      const outcome = await reassignRecordOwner(user, entityTypeInput, entityId, input);
      if (outcome && "pendingApproval" in outcome && outcome.pendingApproval) {
        results.push({ entityId, success: false, pendingApproval: true });
      } else {
        results.push({ entityId, success: !!outcome, skipped: !outcome });
      }
    } catch (error) {
      results.push({ entityId, success: false, error: error instanceof Error ? error.message : "REASSIGNMENT_FAILED" });
    }
  }

  return {
    reassigned: results.filter((row) => row.success).length,
    failed: results.filter((row) => !row.success && !row.pendingApproval).length,
    pendingApproval: results.filter((row) => row.pendingApproval).length,
    results,
  };
}

export type ReassignmentImpactPreview = {
  currentOwnerId: string | null;
  newOwnerId: string;
  newOwnerCurrentOpenCount: number;
  newOwnerOpenCountAfter: number;
  quotaWouldBeExceeded: boolean;
  tightestApplicableQuota: number | null;
  recordAgeDays: number | null;
  daysSinceLastActivity: number | null;
};

// SLA-impact preview, shown before confirming a reassignment. No SLA/response-time field exists
// on Lead/Opportunity anywhere in this schema (Activity's own slaTarget/slaStatus are per-
// activity, not per-record) -- so "impact" is expressed concretely via what actually changes:
// the new owner's workload before/after, whether that would exceed any active rule's own
// configured per-user quota for this entity type, and continuity risk signals (how old the
// record is, how long since it was last touched).
export async function previewReassignmentImpact(
  user: ScopedActor,
  entityTypeInput: string,
  entityId: string,
  newOwnerId: string,
): Promise<ReassignmentImpactPreview | null> {
  const tenantId = tenantIdFor(user);
  const entityType = normalizeEntityType(entityTypeInput);
  const table = entityType === "OPPORTUNITY" ? '"Opportunity"' : '"Lead"';
  // F03 fix (WP04): same reasoning as executeReassignment above -- don't let this preview leak
  // owner/workload/age details for a record outside the caller's own record-access scope.
  const clauses = ["\"tenantId\" = $1"];
  const values: unknown[] = [tenantId];
  applyRecordScopeClause(clauses, values, user, entityType, 1);
  values.push(entityId);
  const record = await queryOne<{ id: string; ownerId: string | null; createdAt: string }>(
    `select id, "ownerId", "createdAt" from ${table} where ${clauses.join(" and ")} and id = $${values.length} limit 1`,
    values,
  );
  if (!record) return null;

  const counts = await countOpenAssignments(tenantId, entityType, [newOwnerId]);
  const newOwnerOpenCount = counts.get(newOwnerId) ?? 0;

  const quotas = await query<{ maxAssignmentsPerUser: number | null }>(
    `select q."maxAssignmentsPerUser" from "DistributionQuota" q
     join "AssignmentRule" r on r.id = q."ruleId"
     where r."tenantId" = $1 and r."entityType" = $2 and r."isActive" = true and q."maxAssignmentsPerUser" is not null`,
    [tenantId, entityType],
  );
  const tightestCap = quotas.reduce<number | null>((min, row) => {
    const cap = Number(row.maxAssignmentsPerUser);
    if (!Number.isFinite(cap)) return min;
    return min === null || cap < min ? cap : min;
  }, null);
  const newOwnerOpenCountAfter = newOwnerOpenCount + 1;
  const quotaWouldBeExceeded = tightestCap !== null && newOwnerOpenCountAfter > tightestCap;

  const lastActivity = await queryOne<{ createdAt: string }>(
    `select "createdAt" from "Activity"
     where "tenantId" = $1 and ${entityType === "OPPORTUNITY" ? '"opportunityId"' : '"leadId"'} = $2 and "deletedAt" is null
     order by "createdAt" desc limit 1`,
    [tenantId, entityId],
  );

  const now = Date.now();
  const recordAgeDays = record.createdAt ? Math.floor((now - new Date(record.createdAt).getTime()) / 86_400_000) : null;
  const daysSinceLastActivity = lastActivity?.createdAt ? Math.floor((now - new Date(lastActivity.createdAt).getTime()) / 86_400_000) : null;

  return {
    currentOwnerId: record.ownerId ?? null,
    newOwnerId,
    newOwnerCurrentOpenCount: newOwnerOpenCount,
    newOwnerOpenCountAfter,
    quotaWouldBeExceeded,
    tightestApplicableQuota: tightestCap,
    recordAgeDays,
    daysSinceLastActivity,
  };
}
