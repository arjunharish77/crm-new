import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Rewritten for the normalized distribution schema (migration 0082): AssignmentRule no longer
// carries a `conditions` jsonb blob or a `targetUserIds` array -- rule config now lives across
// DistributionCondition/DistributionTarget/DistributionQuota/DistributionAvailability, and the
// round-robin cursor is a real AssignmentRule.roundRobinCursor column.

const state = vi.hoisted(() => ({
  rules: [] as any[],
  conditions: [] as any[],
  targets: [] as any[],
  quotas: [] as any[],
  availabilities: [] as any[],
  users: [] as any[],
  leads: [] as any[],
  opportunities: [] as any[],
  teams: [] as any[],
  salesGroups: [] as any[],
  salesGroupMembers: [] as any[],
  assignmentLogs: [] as any[],
  auditLogs: [] as any[],
  distributionSimulations: [] as any[],
  moduleEnabled: true,
  securityPolicy: {
    reassignmentApprovalRequired: false,
    reassignmentLimitCount: null as number | null,
    reassignmentLimitWindowDays: null as number | null,
  },
}));

function resetState() {
  state.rules = [];
  state.conditions = [];
  state.targets = [];
  state.quotas = [];
  state.availabilities = [];
  state.users = [];
  state.leads = [];
  state.opportunities = [];
  state.teams = [];
  state.salesGroups = [];
  state.salesGroupMembers = [];
  state.assignmentLogs = [];
  state.auditLogs = [];
  state.distributionSimulations = [];
  state.moduleEnabled = true;
  state.securityPolicy = { reassignmentApprovalRequired: false, reassignmentLimitCount: null, reassignmentLimitWindowDays: null };
}
resetState();

function tableForEntity(entityType: string) {
  return entityType === "OPPORTUNITY" ? state.opportunities : state.leads;
}

// Convenience: push a rule plus its child-table rows in one call, mirroring how a real rule is
// spread across 5 tables now instead of 1.
function pushRule(rule: {
  id: string;
  tenantId: string;
  name: string;
  entityType: string;
  priority: number;
  isActive?: boolean;
  isDefault?: boolean;
  strategy: string;
  targetGroupId?: string | null;
  territoryField?: string | null;
  roundRobinCursor?: number;
  conditions?: Array<{ field: string; operator?: string; value: unknown }>;
  targets?: Array<{ userId: string; isPoolMember?: boolean; isFallback?: boolean; weight?: number | null; fairnessCredit?: number }>;
  quota?: { maxAssignmentsPerUser?: number | null; maxAssignmentsPerWindow?: number | null; windowPeriod?: string | null };
  availability?: { activeFrom?: string | null; activeUntil?: string | null; requiredSkills?: string[] };
}) {
  state.rules.push({
    id: rule.id,
    tenantId: rule.tenantId,
    name: rule.name,
    entityType: rule.entityType,
    priority: rule.priority,
    isActive: rule.isActive !== false,
    isDefault: rule.isDefault === true,
    strategy: rule.strategy,
    targetGroupId: rule.targetGroupId ?? null,
    territoryField: rule.territoryField ?? null,
    roundRobinCursor: rule.roundRobinCursor ?? -1,
  });
  for (const condition of rule.conditions ?? []) {
    state.conditions.push({ ruleId: rule.id, field: condition.field, operator: condition.operator ?? "equals", value: condition.value });
  }
  for (const target of rule.targets ?? []) {
    state.targets.push({
      ruleId: rule.id,
      userId: target.userId,
      isPoolMember: target.isPoolMember !== false,
      isFallback: target.isFallback === true,
      weight: target.weight ?? null,
      fairnessCredit: target.fairnessCredit ?? 0,
    });
  }
  if (rule.quota) state.quotas.push({ ruleId: rule.id, maxAssignmentsPerUser: null, maxAssignmentsPerWindow: null, windowPeriod: null, ...rule.quota });
  if (rule.availability) state.availabilities.push({ ruleId: rule.id, activeFrom: null, activeUntil: null, requiredSkills: [], ...rule.availability });
}

vi.mock("@/lib/db/query", () => ({
  // Identity passthrough -- see the identical comment in tests/ai-assistant.test.ts.
  jsonbParam: (v: unknown) => v,
  query: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('from "AssignmentRule"') && sql.includes('"entityType" = $2')) {
      return state.rules
        .filter((rule) => rule.tenantId === params[0] && rule.entityType === params[1] && rule.isActive)
        .sort((a, b) => b.priority - a.priority);
    }
    if (sql.includes('from "DistributionCondition"')) {
      const ruleIds: string[] = params[1] ?? [];
      return state.conditions.filter((row) => ruleIds.includes(row.ruleId));
    }
    if (sql.includes('"isPoolMember", "isFallback", weight, "fairnessCredit" from "DistributionTarget"')) {
      const ruleIds: string[] = params[1] ?? [];
      return state.targets.filter((row) => ruleIds.includes(row.ruleId));
    }
    if (sql.includes('select "userId", weight, "fairnessCredit" from "DistributionTarget"')) {
      const [, ruleId, userIds] = params;
      return state.targets.filter((row) => row.ruleId === ruleId && userIds?.includes(row.userId));
    }
    if (sql.includes('"maxAssignmentsPerUser" from "DistributionQuota" q')) {
      // previewReassignmentImpact's join query -- checked before the plain-select branch
      // below, since both contain the substring `from "DistributionQuota"`.
      return state.quotas
        .filter((row) => row.maxAssignmentsPerUser != null)
        .filter((row) => state.rules.some((rule) => rule.id === row.ruleId && rule.tenantId === params[0] && rule.entityType === params[1] && rule.isActive))
        .map((row) => ({ maxAssignmentsPerUser: row.maxAssignmentsPerUser }));
    }
    if (sql.includes('from "DistributionQuota"')) {
      const ruleIds: string[] = params[1] ?? [];
      return state.quotas.filter((row) => ruleIds.includes(row.ruleId));
    }
    if (sql.includes('from "DistributionAvailability"')) {
      const ruleIds: string[] = params[1] ?? [];
      return state.availabilities.filter((row) => ruleIds.includes(row.ruleId));
    }
    if (sql.includes('from "SalesGroupMember"') && sql.includes('"groupId" = $2')) {
      return state.salesGroupMembers.filter((member) => member.tenantId === params[0] && member.groupId === params[1]);
    }
    if (sql.includes('from "SalesGroupMember"') && sql.includes('any($2::text[])')) {
      const groupIds: string[] = params[1] ?? [];
      const seen = new Set<string>();
      return state.salesGroupMembers
        .filter((member) => member.tenantId === params[0] && groupIds.includes(member.groupId))
        .filter((member) => (seen.has(member.userId) ? false : (seen.add(member.userId), true)))
        .map((member) => ({ userId: member.userId }));
    }
    if (sql.includes('from "SalesGroup"') && sql.includes('"isActive" = true')) {
      return state.salesGroups.filter((group) => group.tenantId === params[0]);
    }
    if (sql.includes('from "User"') && sql.includes("= any(")) {
      return state.users.filter((user) => params[1]?.includes(user.id));
    }
    if (sql.includes('"ownerId" from "Lead"') || sql.includes('"ownerId" from "Opportunity"')) {
      const table = sql.includes('"Opportunity"') ? state.opportunities : state.leads;
      return table.filter((row) => params[1]?.includes(row.ownerId)).map((row) => ({ ownerId: row.ownerId }));
    }
    if (sql.includes('"workingHours", timezone from "Team"')) {
      return state.teams.filter((team) => team.tenantId === params[0] && params[1]?.includes(team.id));
    }
    if (sql.includes('"assignedToId" from "AssignmentLog"')) {
      const [tenantId, entityType, userIds, windowStartIso] = params;
      return state.assignmentLogs
        .filter((log) =>
          log.tenantId === tenantId &&
          log.entityType === entityType &&
          userIds?.includes(log.assignedToId) &&
          log.assignedAt >= windowStartIso
        )
        .map((log) => ({ assignedToId: log.assignedToId }));
    }
    return [];
  }),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('"roundRobinCursor" from "AssignmentRule"')) {
      const rule = state.rules.find((r) => r.tenantId === params[0] && r.id === params[1]);
      return rule ? { roundRobinCursor: rule.roundRobinCursor } : null;
    }
    if (sql.includes('from "User" where "tenantId" = $1 and id = $2')) {
      return state.users.find((user) => user.id === params[1]) ?? null;
    }
    if (sql.includes('"workingHours", timezone from "SalesGroup"')) {
      return state.salesGroups.find((group) => group.tenantId === params[0] && group.id === params[1]) ?? null;
    }
    if (sql.includes('select id, "ownerId" from')) {
      // F03 fix (WP04): this lookup now optionally includes an OWN/TEAM record-scope clause
      // (see record-scope.ts), pushing extra bound values BEFORE the entity id -- which is
      // always the LAST parameter regardless of how many scope values preceded it, so this
      // stays correct for every scope level rather than assuming a fixed position.
      const table = tableForEntity(sql.includes('"Opportunity"') ? "OPPORTUNITY" : "LEAD");
      return table.find((row) => row.tenantId === params[0] && row.id === params[params.length - 1]) ?? null;
    }
    if (sql.includes('select "ownerId" from "Lead" where "tenantId" = $1 and id = $2')) {
      const lead = state.leads.find((row) => row.tenantId === params[0] && row.id === params[1]);
      return lead ? { ownerId: lead.ownerId } : null;
    }
    if (sql.includes('select "ownerId" from "Lead"') && sql.includes("lower(email)")) {
      const email = String(params[1]);
      const excludeId = params[2];
      const match = state.leads
        .filter((row) => row.tenantId === params[0] && String(row.email ?? "").toLowerCase() === email && row.ownerId && row.id !== excludeId)
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))[0];
      return match ? { ownerId: match.ownerId } : null;
    }
    if (sql.includes("count(*) as count from") && sql.includes('"ruleId" is null')) {
      const [tenantId, entityId, windowStart] = params;
      const count = state.assignmentLogs.filter(
        (log) => log.tenantId === tenantId && log.entityId === entityId && log.ruleId === null && log.assignedAt >= windowStart,
      ).length;
      return { count: String(count) };
    }
    if (sql.includes('select id, "ownerId", "createdAt" from')) {
      const table = tableForEntity(sql.includes('"Opportunity"') ? "OPPORTUNITY" : "LEAD");
      return table.find((row) => row.tenantId === params[0] && row.id === params[params.length - 1]) ?? null;
    }
    if (sql.includes('"createdAt" from "Activity"')) {
      return null;
    }
    return null;
  }),
  execute: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('update "AssignmentRule" set "roundRobinCursor"')) {
      const rule = state.rules.find((r) => r.id === params[3]);
      if (rule) rule.roundRobinCursor = params[0];
    }
    if (sql.includes('set "fairnessCredit" = v.credit')) {
      const [, ids, credits, , ruleId] = params;
      (ids as string[]).forEach((userId, index) => {
        const target = state.targets.find((t) => t.ruleId === ruleId && t.userId === userId);
        if (target) target.fairnessCredit = credits[index];
      });
    }
    if (sql.includes('update "Lead" set "ownerId"') || sql.includes('update "Opportunity" set "ownerId"')) {
      const table = sql.includes('"Opportunity"') ? state.opportunities : state.leads;
      const row = table.find((r) => r.id === params[3]);
      if (row) row.ownerId = params[0];
    }
    if (sql.includes('insert into "AssignmentLog"')) {
      state.assignmentLogs.push({
        id: params[0],
        tenantId: params[1],
        entityType: params[2],
        entityId: params[3],
        assignedToId: params[4],
        assignedById: params[5],
        ruleId: params[6],
        reason: params[7],
        trace: params[8],
        assignedAt: params[9],
      });
    }
    if (sql.includes('insert into "AuditLog"')) {
      state.auditLogs.push({ userId: params[2], entityType: params[3], entityId: params[4], diff: params[7], metadata: params[8] });
    }
    if (sql.includes('insert into "DistributionSimulation"')) {
      state.distributionSimulations.push({
        id: params[0],
        tenantId: params[1],
        entityType: params[2],
        inputRecord: params[3],
        draftRuleOverride: params[4],
        result: params[5],
        trace: params[6],
        runBy: params[7],
      });
    }
    return 1;
  }),
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_user: any, fn: (client: any) => Promise<any>) => fn({ query: vi.fn().mockResolvedValue({ rows: [] }) })),
}));

vi.mock("@/lib/server/module-entitlements", () => ({
  isModuleEnabledForTenant: vi.fn(async () => state.moduleEnabled),
  assertTenantModule: vi.fn(async (user: { isPlatformAdmin?: boolean }, moduleKey: string) => {
    if (!state.moduleEnabled && !user.isPlatformAdmin) throw new Error(`MODULE_DISABLED:${moduleKey}`);
  }),
}));

const runAutomationsForEventMock = vi.fn(async () => []);
vi.mock("@/lib/repositories/automations-postgres", () => ({
  runAutomationsForEvent: runAutomationsForEventMock,
}));

const createUserNotificationMock = vi.fn(async () => undefined);
vi.mock("@/lib/server/notifications", () => ({
  createUserNotification: createUserNotificationMock,
}));

vi.mock("@/lib/server/security-policy", () => ({
  getEffectiveSecurityPolicy: vi.fn(async () => ({
    reassignmentApprovalRequired: state.securityPolicy.reassignmentApprovalRequired,
    reassignmentLimitCount: state.securityPolicy.reassignmentLimitCount,
    reassignmentLimitWindowDays: state.securityPolicy.reassignmentLimitWindowDays,
  })),
}));

const createPrivilegedActionRequestMock = vi.fn(async () => ({ id: "request-1" }));
vi.mock("@/lib/server/privileged-actions", () => ({
  createPrivilegedActionRequest: createPrivilegedActionRequestMock,
}));

describe("direct Postgres distribution engine", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-robins matching rules and updates the assigned lead", async () => {
    pushRule({
      id: "rule-1",
      tenantId: "tenant-1",
      name: "Web lead rule",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      roundRobinCursor: 0,
      conditions: [{ field: "source", value: "Website" }],
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A", email: "a@example.com" }, { id: "user-2", name: "B", email: "b@example.com" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", { source: "Website" });

    expect(result.assignedUserId).toBe("user-2");
    expect(state.rules[0].roundRobinCursor).toBe(1);
    expect(state.leads[0].ownerId).toBe("user-2");
    expect(state.assignmentLogs).toHaveLength(1);
    expect(state.assignmentLogs[0]).toMatchObject({ assignedToId: "user-2", ruleId: "rule-1" });
    // Full skip-reason trace is now persisted alongside the real decision, not just the final
    // outcome/reason string.
    expect(Array.isArray(state.assignmentLogs[0].trace)).toBe(true);
    expect(state.auditLogs).toHaveLength(1);
    expect(runAutomationsForEventMock).toHaveBeenCalledWith(
      expect.anything(),
      "LEAD_DISTRIBUTION_SUCCESS",
      "LEAD",
      "lead-1",
      expect.objectContaining({ assignedUserId: "user-2" }),
    );
  });

  it("advances the cursor correctly across repeated sequential calls (no double-pick, no skipped turn)", async () => {
    pushRule({
      id: "rule-1",
      tenantId: "tenant-1",
      name: "Web lead rule",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      conditions: [{ field: "source", value: "Website" }],
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null }, { id: "lead-2", tenantId: "tenant-1", ownerId: null }, { id: "lead-3", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const first = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", { source: "Website" });
    const second = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-2", { source: "Website" });
    const third = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-3", { source: "Website" });

    expect([first.assignedUserId, second.assignedUserId, third.assignedUserId]).toEqual(["user-1", "user-2", "user-1"]);
  });

  it("picks the higher-priority matching rule when more than one rule could match", async () => {
    pushRule({
      id: "rule-low",
      tenantId: "tenant-1",
      name: "Catch-all",
      entityType: "LEAD",
      priority: 1,
      isDefault: true,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-low" }],
    });
    pushRule({
      id: "rule-high",
      tenantId: "tenant-1",
      name: "Website leads",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      conditions: [{ field: "source", value: "Website" }],
      targets: [{ userId: "user-high" }],
    });
    state.users.push({ id: "user-low", name: "Low" }, { id: "user-high", name: "High" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", { source: "Website" });

    expect(result.ruleId).toBe("rule-high");
    expect(result.assignedUserId).toBe("user-high");
  });

  it("simulateDistribution exposes per-candidate skip reasons without mutating any state, and persists a DistributionSimulation row", async () => {
    pushRule({
      id: "rule-skills",
      tenantId: "tenant-1",
      name: "Spanish speakers",
      entityType: "LEAD",
      priority: 5,
      strategy: "SKILL_BASED",
      availability: { requiredSkills: ["spanish"] },
      targets: [{ userId: "user-away" }, { userId: "user-no-skill" }, { userId: "user-qualified" }],
    });
    state.users.push(
      { id: "user-away", name: "Away", isAvailableForAssignment: false, skills: { languages: ["spanish"] } },
      { id: "user-no-skill", name: "NoSkill", isAvailableForAssignment: true, skills: {} },
      { id: "user-qualified", name: "Qualified", isAvailableForAssignment: true, skills: { languages: ["spanish"] } },
    );

    const { simulateDistribution } = await import("@/lib/server/distribution-engine");
    const { result, trace, simulationId } = await simulateDistribution({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", {});

    expect(result.assignedUserId).toBe("user-qualified");
    const candidateByName = new Map(trace[0].candidates.map((c) => [c.id, c.excludedReason]));
    expect(candidateByName.get("user-away")).toBe("Marked unavailable");
    expect(candidateByName.get("user-no-skill")).toBe("Missing required skill");
    expect(candidateByName.get("user-qualified")).toBeUndefined();
    // Dry run: no cursor advance, no ownerId write, no logs.
    expect(state.rules[0].roundRobinCursor).toBe(-1);
    expect(state.assignmentLogs).toHaveLength(0);
    expect(simulationId).toBeTruthy();
    expect(state.distributionSimulations).toHaveLength(1);
    expect(state.distributionSimulations[0]).toMatchObject({ tenantId: "tenant-1", entityType: "LEAD" });
  });

  it("chooses the least-loaded owner for load-based rules", async () => {
    pushRule({
      id: "rule-2",
      tenantId: "tenant-1",
      name: "India applications",
      entityType: "OPPORTUNITY",
      priority: 20,
      strategy: "LOAD_BASED",
      conditions: [{ field: "country", value: "India" }],
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.opportunities.push(
      { id: "opp-existing-1", tenantId: "tenant-1", ownerId: "user-1" },
      { id: "opp-existing-2", tenantId: "tenant-1", ownerId: "user-1" },
      { id: "opp-1", tenantId: "tenant-1", ownerId: null },
    );

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "OPPORTUNITY", "opp-1", { country: "India" });

    expect(result.assignedUserId).toBe("user-2");
    expect(state.opportunities.find((o) => o.id === "opp-1")?.ownerId).toBe("user-2");
  });

  it("uses fallback owner when a matched rule has no available target users", async () => {
    pushRule({
      id: "rule-3",
      tenantId: "tenant-1",
      name: "Fallback rule",
      entityType: "LEAD",
      priority: 1,
      strategy: "ROUND_ROBIN",
      conditions: [{ field: "source", value: "Partner" }],
      targets: [{ userId: "fallback-1", isPoolMember: false, isFallback: true }],
    });
    state.users.push({ id: "fallback-1", name: "Fallback", email: "fallback@example.com" });
    state.leads.push({ id: "lead-2", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-2", { source: "Partner" });

    expect(result.assignedUserId).toBe("fallback-1");
    expect(result.reason).toContain("used fallback owner");
  });

  it("distributes proportionally to configured weights for the WEIGHTED strategy", async () => {
    pushRule({
      id: "rule-4",
      tenantId: "tenant-1",
      name: "Weighted rule",
      entityType: "LEAD",
      priority: 5,
      strategy: "WEIGHTED",
      targets: [{ userId: "user-1", weight: 3 }, { userId: "user-2", weight: 1 }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    for (let i = 0; i < 8; i++) state.leads.push({ id: `lead-${i}`, tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const picks: string[] = [];
    for (let i = 0; i < 8; i++) {
      const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", `lead-${i}`, {});
      if (result.assignedUserId) picks.push(result.assignedUserId);
    }

    const user1Count = picks.filter((id) => id === "user-1").length;
    const user2Count = picks.filter((id) => id === "user-2").length;
    expect(user1Count).toBe(6);
    expect(user2Count).toBe(2);
    // Fairness credit is now a real per-(rule,user) column, mutated in place.
    const creditForUser1 = state.targets.find((t) => t.ruleId === "rule-4" && t.userId === "user-1")?.fairnessCredit;
    expect(typeof creditForUser1).toBe("number");
  });

  it("STICKY_TO_OWNER routes an Opportunity back to its parent Lead's existing owner, without advancing the round-robin cursor", async () => {
    pushRule({
      id: "rule-sticky",
      tenantId: "tenant-1",
      name: "Sticky opportunities",
      entityType: "OPPORTUNITY",
      priority: 10,
      strategy: "STICKY_TO_OWNER",
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-2" });
    state.opportunities.push({ id: "opp-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "OPPORTUNITY", "opp-1", { leadId: "lead-1" });

    expect(result.assignedUserId).toBe("user-2");
    expect(state.opportunities[0].ownerId).toBe("user-2");
    expect(state.rules[0].roundRobinCursor).toBe(-1);
  });

  it("STICKY_TO_OWNER routes a returning Lead (same email) back to the existing owner", async () => {
    pushRule({
      id: "rule-sticky",
      tenantId: "tenant-1",
      name: "Sticky leads",
      entityType: "LEAD",
      priority: 10,
      strategy: "STICKY_TO_OWNER",
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.leads.push(
      { id: "lead-old", tenantId: "tenant-1", email: "student@example.com", ownerId: "user-1", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "lead-new", tenantId: "tenant-1", email: "student@example.com", ownerId: null, createdAt: "2026-02-01T00:00:00.000Z" },
    );

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-new", { email: "Student@Example.com" });

    expect(result.assignedUserId).toBe("user-1");
  });

  it("STICKY_TO_OWNER falls back to round robin when there's no related record or the prior owner isn't in the eligible pool", async () => {
    pushRule({
      id: "rule-sticky",
      tenantId: "tenant-1",
      name: "Sticky opportunities",
      entityType: "OPPORTUNITY",
      priority: 10,
      strategy: "STICKY_TO_OWNER",
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-3" });
    state.opportunities.push({ id: "opp-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "OPPORTUNITY", "opp-1", { leadId: "lead-1" });

    expect(["user-1", "user-2"]).toContain(result.assignedUserId);
    expect(state.rules[0].roundRobinCursor).toBe(0);
  });

  it("routes via TERRITORY_BASED to whichever Sales Group's territories match the record's configured field", async () => {
    pushRule({
      id: "rule-territory",
      tenantId: "tenant-1",
      name: "Territory routing",
      entityType: "LEAD",
      priority: 10,
      strategy: "TERRITORY_BASED",
      territoryField: "state",
    });
    state.salesGroups.push(
      { id: "group-west", tenantId: "tenant-1", isActive: true, territories: ["West"], states: [], countries: [], zipCodes: [] },
      { id: "group-east", tenantId: "tenant-1", isActive: true, territories: ["East"], states: [], countries: [], zipCodes: [] },
    );
    state.salesGroupMembers.push(
      { tenantId: "tenant-1", groupId: "group-west", userId: "user-west" },
      { tenantId: "tenant-1", groupId: "group-east", userId: "user-east" },
    );
    state.users.push({ id: "user-west", name: "West Rep" }, { id: "user-east", name: "East Rep" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", { state: "West" });

    expect(result.assignedUserId).toBe("user-west");
  });

  it("excludes a team member outside their team's configured working hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T20:00:00.000Z"));
    pushRule({
      id: "rule-hours",
      tenantId: "tenant-1",
      name: "Business hours only",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push(
      { id: "user-1", name: "A", teamId: "team-1" },
      { id: "user-2", name: "B", teamId: null },
    );
    state.teams.push({ id: "team-1", tenantId: "tenant-1", workingHours: { start: "09:00", end: "18:00" }, timezone: "UTC" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-2");
  });

  it("includes a team member when the current time is inside their team's configured working hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    pushRule({
      id: "rule-hours",
      tenantId: "tenant-1",
      name: "Business hours only",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-1" }],
    });
    state.users.push({ id: "user-1", name: "A", teamId: "team-1" });
    state.teams.push({ id: "team-1", tenantId: "tenant-1", workingHours: { start: "09:00", end: "18:00" }, timezone: "UTC" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-1");
  });

  it("excludes a team member on a day outside their configured working days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T10:00:00.000Z"));
    pushRule({
      id: "rule-hours",
      tenantId: "tenant-1",
      name: "Weekdays only",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push(
      { id: "user-1", name: "A", teamId: "team-1" },
      { id: "user-2", name: "B", teamId: null },
    );
    state.teams.push({ id: "team-1", tenantId: "tenant-1", workingHours: { days: [1, 2, 3, 4, 5], start: "00:00", end: "23:59" }, timezone: "UTC" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-2");
  });

  it("does NOT silently route to an off-duty candidate when every candidate is outside their team's working hours -- leaves the record unassigned with no fallback configured", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T20:00:00.000Z"));
    pushRule({
      id: "rule-hours",
      tenantId: "tenant-1",
      name: "Business hours only",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push(
      { id: "user-1", name: "A", teamId: "team-1" },
      { id: "user-2", name: "B", teamId: "team-1" },
    );
    state.teams.push({ id: "team-1", tenantId: "tenant-1", workingHours: { start: "09:00", end: "18:00" }, timezone: "UTC" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBeNull();
  });

  it("uses the rule's configured fallback user when every candidate is outside working hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T20:00:00.000Z"));
    pushRule({
      id: "rule-hours",
      tenantId: "tenant-1",
      name: "Business hours only",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-1" }, { userId: "user-oncall", isPoolMember: false, isFallback: true }],
    });
    state.users.push(
      { id: "user-1", name: "A", teamId: "team-1" },
      { id: "user-oncall", name: "On-call", email: "oncall@example.com" },
    );
    state.teams.push({ id: "team-1", tenantId: "tenant-1", workingHours: { start: "09:00", end: "18:00" }, timezone: "UTC" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-oncall");
  });

  it("applies a SalesGroup's own working hours uniformly to all its members for a group-targeted rule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T20:00:00.000Z"));
    pushRule({
      id: "rule-group-hours",
      tenantId: "tenant-1",
      name: "Group business hours",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targetGroupId: "group-1",
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.salesGroupMembers.push(
      { tenantId: "tenant-1", groupId: "group-1", userId: "user-1" },
      { tenantId: "tenant-1", groupId: "group-1", userId: "user-2" },
    );
    state.salesGroups.push({ id: "group-1", tenantId: "tenant-1", isActive: true, workingHours: { start: "09:00", end: "18:00" }, timezone: "UTC" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBeNull();
  });

  it("a team with no workingHours configured imposes no restriction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T20:00:00.000Z"));
    pushRule({
      id: "rule-hours",
      tenantId: "tenant-1",
      name: "No restriction",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-1" }],
    });
    state.users.push({ id: "user-1", name: "A", teamId: "team-1" });
    state.teams.push({ id: "team-1", tenantId: "tenant-1", workingHours: null, timezone: "UTC" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-1");
  });

  it("excludes a user who has already reached their daily assignment cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    pushRule({
      id: "rule-window-cap",
      tenantId: "tenant-1",
      name: "Max 1 per day",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      quota: { maxAssignmentsPerWindow: 1, windowPeriod: "DAY" },
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.assignmentLogs.push({ tenantId: "tenant-1", entityType: "LEAD", assignedToId: "user-1", assignedAt: "2026-06-15T08:00:00.000Z" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-2");
  });

  it("does not count an assignment outside the rolling window -- the cap effectively resets over time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    pushRule({
      id: "rule-window-cap",
      tenantId: "tenant-1",
      name: "Max 1 per day",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      quota: { maxAssignmentsPerWindow: 1, windowPeriod: "DAY" },
      targets: [{ userId: "user-1" }],
    });
    state.users.push({ id: "user-1", name: "A" });
    state.assignmentLogs.push({ tenantId: "tenant-1", entityType: "LEAD", assignedToId: "user-1", assignedAt: "2026-06-13T10:00:00.000Z" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-1");
  });

  it("a WEEK-period cap counts an assignment from a few days ago that a DAY-period cap would not", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    pushRule({
      id: "rule-window-cap",
      tenantId: "tenant-1",
      name: "Max 1 per week",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      quota: { maxAssignmentsPerWindow: 1, windowPeriod: "WEEK" },
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.assignmentLogs.push({ tenantId: "tenant-1", entityType: "LEAD", assignedToId: "user-1", assignedAt: "2026-06-12T10:00:00.000Z" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-2");
  });

  it("gracefully degrades to the full pool when every candidate is at their window cap, rather than leaving the record unassigned", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    pushRule({
      id: "rule-window-cap",
      tenantId: "tenant-1",
      name: "Max 1 per day",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      quota: { maxAssignmentsPerWindow: 1, windowPeriod: "DAY" },
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.assignmentLogs.push(
      { tenantId: "tenant-1", entityType: "LEAD", assignedToId: "user-1", assignedAt: "2026-06-15T08:00:00.000Z" },
      { tenantId: "tenant-1", entityType: "LEAD", assignedToId: "user-2", assignedAt: "2026-06-15T09:00:00.000Z" },
    );
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).not.toBeNull();
  });

  it("simulateDistribution reports 'Reached daily/weekly assignment cap' as the skip reason, without writing a new AssignmentLog row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    pushRule({
      id: "rule-window-cap",
      tenantId: "tenant-1",
      name: "Max 1 per day",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      quota: { maxAssignmentsPerWindow: 1, windowPeriod: "DAY" },
      targets: [{ userId: "user-1" }, { userId: "user-2" }],
    });
    state.users.push({ id: "user-1", name: "A" }, { id: "user-2", name: "B" });
    state.assignmentLogs.push({ tenantId: "tenant-1", entityType: "LEAD", assignedToId: "user-1", assignedAt: "2026-06-15T08:00:00.000Z" });

    const { simulateDistribution } = await import("@/lib/server/distribution-engine");
    const { result, trace } = await simulateDistribution({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", {});

    expect(result.assignedUserId).toBe("user-2");
    const candidateByName = new Map(trace[0].candidates.map((c) => [c.id, c.excludedReason]));
    expect(candidateByName.get("user-1")).toBe("Reached daily/weekly assignment cap");
    expect(candidateByName.get("user-2")).toBeUndefined();
    expect(state.assignmentLogs).toHaveLength(1);
  });

  it("skips a rule whose activation window has not started yet, falling through to a lower-priority active rule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    pushRule({
      id: "rule-future",
      tenantId: "tenant-1",
      name: "Future campaign rule",
      entityType: "LEAD",
      priority: 20,
      strategy: "ROUND_ROBIN",
      availability: { activeFrom: "2026-07-01" },
      targets: [{ userId: "user-future" }],
    });
    pushRule({
      id: "rule-always",
      tenantId: "tenant-1",
      name: "Always-on rule",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-always" }],
    });
    state.users.push({ id: "user-future", name: "Future" }, { id: "user-always", name: "Always" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.ruleId).toBe("rule-always");
    expect(result.assignedUserId).toBe("user-always");
  });

  it("skips a rule whose activation window has already ended", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T10:00:00.000Z"));
    pushRule({
      id: "rule-expired",
      tenantId: "tenant-1",
      name: "Expired campaign rule",
      entityType: "LEAD",
      priority: 20,
      strategy: "ROUND_ROBIN",
      availability: { activeUntil: "2026-06-10" },
      targets: [{ userId: "user-expired" }],
    });
    pushRule({
      id: "rule-always",
      tenantId: "tenant-1",
      name: "Always-on rule",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-always" }],
    });
    state.users.push({ id: "user-expired", name: "Expired" }, { id: "user-always", name: "Always" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.ruleId).toBe("rule-always");
    expect(result.assignedUserId).toBe("user-always");
  });

  it("still matches a rule when 'now' is late on the activeUntil day -- inclusive of the whole day, not just up to UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T23:30:00.000Z"));
    pushRule({
      id: "rule-last-day",
      tenantId: "tenant-1",
      name: "Ends today",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      availability: { activeUntil: "2026-06-15" },
      targets: [{ userId: "user-1" }],
    });
    state.users.push({ id: "user-1", name: "A" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBe("user-1");
  });

  it("does not auto-assign and returns a graceful no-op when the DISTRIBUTION module is disabled", async () => {
    state.moduleEnabled = false;
    pushRule({
      id: "rule-1",
      tenantId: "tenant-1",
      name: "Web lead rule",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-1" }],
    });
    state.users.push({ id: "user-1", name: "A" });
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result).toEqual({ assignedUserId: null, ruleId: null, strategy: null, reason: "Distribution module disabled for tenant" });
    expect(state.leads[0].ownerId).toBeNull();
    expect(state.assignmentLogs).toHaveLength(0);
    expect(runAutomationsForEventMock).not.toHaveBeenCalled();
  });

  it("fires a DISTRIBUTION_FAILED automation trigger when no rule matches", async () => {
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: null });

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {});

    expect(result.assignedUserId).toBeNull();
    expect(runAutomationsForEventMock).toHaveBeenCalledWith(expect.anything(), "LEAD_DISTRIBUTION_FAILED", "LEAD", "lead-1", expect.anything());
  });

  it("simulateDistribution(draftRule) evaluates an unsaved rule in isolation, bypassing every saved rule entirely", async () => {
    // A real, saved rule exists but must be completely ignored -- the draft override replaces
    // the whole rule set for this call, it doesn't merge with it.
    pushRule({
      id: "rule-real",
      tenantId: "tenant-1",
      name: "Real saved rule",
      entityType: "LEAD",
      priority: 100,
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-real" }],
    });
    state.users.push({ id: "user-real", name: "Real" }, { id: "user-draft", name: "Draft" });

    const { simulateDistribution } = await import("@/lib/server/distribution-engine");
    const { result } = await simulateDistribution({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", {}, {
      entityType: "LEAD",
      strategy: "ROUND_ROBIN",
      targets: [{ userId: "user-draft" }],
      conditions: [],
    });

    expect(result.assignedUserId).toBe("user-draft");
    // Draft-rule simulations never touch a real rule id.
    expect(result.ruleId).toBeNull();
    expect(state.rules[0].roundRobinCursor).toBe(-1);
  });

  it("reassignRecordOwner requires a reason and a real target user, and notifies the previous owner", async () => {
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-1" });
    state.users.push({ id: "user-1", name: "Old Owner" }, { id: "user-2", name: "New Owner", email: "new@example.com" });

    const { reassignRecordOwner } = await import("@/lib/server/distribution-engine");

    await expect(reassignRecordOwner({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", { newOwnerId: "user-2", reason: "" })).rejects.toThrow(
      "REASSIGNMENT_REASON_REQUIRED",
    );

    const outcome: any = await reassignRecordOwner({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", {
      newOwnerId: "user-2",
      reason: "Workload rebalance",
    });

    expect(outcome).toMatchObject({ previousOwnerId: "user-1", newOwnerId: "user-2" });
    expect(state.leads[0].ownerId).toBe("user-2");
    expect(state.assignmentLogs[0]).toMatchObject({ assignedToId: "user-2", assignedById: "admin-1", ruleId: null });
    expect(state.auditLogs[0]).toMatchObject({ userId: "admin-1" });
    expect(createUserNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1" }));
  });

  it("reassignRecordOwner does not notify when the previous owner is the same as the new owner or the actor", async () => {
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "admin-1" });
    state.users.push({ id: "user-2", name: "New Owner" });

    const { reassignRecordOwner } = await import("@/lib/server/distribution-engine");
    await reassignRecordOwner({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", { newOwnerId: "user-2", reason: "Reassigning my own record" });

    expect(createUserNotificationMock).not.toHaveBeenCalled();
  });

  it("reassignRecordOwner creates a PrivilegedActionRequest instead of executing when reassignment approval is required", async () => {
    state.securityPolicy.reassignmentApprovalRequired = true;
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-1" });
    state.users.push({ id: "user-1", name: "Old Owner" }, { id: "user-2", name: "New Owner" });

    const { reassignRecordOwner } = await import("@/lib/server/distribution-engine");
    const outcome: any = await reassignRecordOwner({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", { newOwnerId: "user-2", reason: "Needs approval" });

    expect(outcome).toMatchObject({ pendingApproval: true, requestId: "request-1" });
    expect(createPrivilegedActionRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin-1" }),
      expect.objectContaining({ actionType: "DISTRIBUTION_REASSIGNMENT", targetId: "lead-1" }),
    );
    // No immediate write -- the ownerId only changes once the request is approved and
    // executeReassignment runs (exercised separately via privileged-actions.ts's own tests).
    expect(state.leads[0].ownerId).toBe("user-1");
    expect(state.assignmentLogs).toHaveLength(0);
  });

  it("reassignRecordOwner rejects once the tenant-configured reassignment limit is reached within the window", async () => {
    state.securityPolicy.reassignmentLimitCount = 2;
    state.securityPolicy.reassignmentLimitWindowDays = 7;
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-1" });
    state.users.push({ id: "user-1", name: "Old Owner" }, { id: "user-2", name: "New Owner" });
    state.assignmentLogs.push(
      { tenantId: "tenant-1", entityId: "lead-1", ruleId: null, assignedAt: new Date().toISOString() },
      { tenantId: "tenant-1", entityId: "lead-1", ruleId: null, assignedAt: new Date().toISOString() },
    );

    const { reassignRecordOwner } = await import("@/lib/server/distribution-engine");
    await expect(
      reassignRecordOwner({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", { newOwnerId: "user-2", reason: "One too many" }),
    ).rejects.toThrow("REASSIGNMENT_LIMIT_EXCEEDED");
    expect(state.leads[0].ownerId).toBe("user-1");
  });

  // F03 fix (WP04): executeReassignment/previewReassignmentImpact previously scoped their
  // existing-record lookup by tenant only -- an OWN/TEAM-scoped actor (who shouldn't even be
  // able to SEE most tenant records on the read side) could still reassign or preview any
  // record in the tenant by id. Confirms the same record-scope.ts clause used by
  // leads-postgres.ts/opportunities-postgres.ts is now applied here too.
  describe("F03 fix: record-scope enforcement on reassignment", () => {
    it("scopes executeReassignment's lookup to the actor's own records for an OWN-access role", async () => {
      state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-1" });
      state.users.push({ id: "user-1", name: "Old Owner" }, { id: "user-2", name: "New Owner" });

      const { reassignRecordOwner } = await import("@/lib/server/distribution-engine");
      await reassignRecordOwner(
        { id: "admin-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } },
        "LEAD",
        "lead-1",
        { newOwnerId: "user-2", reason: "Scope check" },
      );

      const queryOneCalls = (await import("@/lib/db/query")).queryOne as any;
      const lookup = queryOneCalls.mock.calls.find((call: any[]) => String(call[0]).includes('select id, "ownerId" from'));
      expect(lookup).toBeDefined();
      expect(lookup[0]).toContain('"ownerId" = $2');
      expect(lookup[1]).toEqual(["tenant-1", "admin-1", "lead-1"]);
    });

    it("scopes the lookup to team membership for a TEAM-access role", async () => {
      state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-1" });
      state.users.push({ id: "user-1", name: "Old Owner" }, { id: "user-2", name: "New Owner" });

      const { previewReassignmentImpact } = await import("@/lib/server/distribution-engine");
      await previewReassignmentImpact(
        { id: "admin-1", tenantId: "tenant-1", teamId: "team-1", role: { permissions: { recordAccess: "TEAM" } } },
        "LEAD",
        "lead-1",
        "user-2",
      );

      const queryOneCalls = (await import("@/lib/db/query")).queryOne as any;
      const lookup = queryOneCalls.mock.calls.find((call: any[]) => String(call[0]).includes('select id, "ownerId", "createdAt" from'));
      expect(lookup).toBeDefined();
      expect(lookup[0]).toContain('"ownerId" in (select id from "User" where "tenantId" = $1 and "teamId"::text = $3)');
      expect(lookup[1]).toEqual(["tenant-1", "admin-1", "team-1", "lead-1"]);
    });

    it("cannot reassign a record the scoped query does not return (out-of-scope record)", async () => {
      const { queryOne } = await import("@/lib/db/query");
      // Simulates what a real, scope-enforcing Postgres query would return for a record this
      // OWN-scoped actor does not own -- null, exactly as if the row didn't match the WHERE
      // clause at all (the shared in-memory mock above only simulates tenantId+id matching, not
      // the ownerId condition itself, so this override stands in for real DB filtering).
      (queryOne as any).mockImplementationOnce(async () => null);

      const { reassignRecordOwner } = await import("@/lib/server/distribution-engine");
      const outcome = await reassignRecordOwner(
        { id: "admin-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } },
        "LEAD",
        "someone-elses-lead",
        { newOwnerId: "user-2", reason: "Should not be reachable" },
      );

      expect(outcome).toBeNull();
    });
  });

  it("previewReassignmentImpact reports the new owner's workload before/after and flags a quota that would be exceeded", async () => {
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-1", createdAt: "2026-01-01T00:00:00.000Z" });
    state.users.push({ id: "user-1", name: "Old Owner" }, { id: "user-2", name: "New Owner" });
    state.leads.push({ id: "lead-existing", tenantId: "tenant-1", ownerId: "user-2" });
    pushRule({
      id: "rule-capped",
      tenantId: "tenant-1",
      name: "Capped rule",
      entityType: "LEAD",
      priority: 10,
      strategy: "ROUND_ROBIN",
      quota: { maxAssignmentsPerUser: 1 },
    });

    const { previewReassignmentImpact } = await import("@/lib/server/distribution-engine");
    const preview = await previewReassignmentImpact({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", "lead-1", "user-2");

    expect(preview).toMatchObject({
      currentOwnerId: "user-1",
      newOwnerId: "user-2",
      newOwnerCurrentOpenCount: 1,
      newOwnerOpenCountAfter: 2,
      quotaWouldBeExceeded: true,
      tightestApplicableQuota: 1,
    });
  });

  it("bulkReassignRecordOwners tallies successes and failures per record independently", async () => {
    state.leads.push({ id: "lead-1", tenantId: "tenant-1", ownerId: "user-1" }, { id: "lead-2", tenantId: "tenant-1", ownerId: "user-1" });
    state.users.push({ id: "user-1", name: "Old Owner" }, { id: "user-2", name: "New Owner" });

    const { bulkReassignRecordOwners } = await import("@/lib/server/distribution-engine");
    const outcome = await bulkReassignRecordOwners({ id: "admin-1", tenantId: "tenant-1" }, "LEAD", ["lead-1", "lead-2", "lead-missing"], {
      newOwnerId: "user-2",
      reason: "Bulk rebalance",
    });

    expect(outcome.reassigned).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.pendingApproval).toBe(0);
    expect(outcome.results.find((row) => row.entityId === "lead-missing")).toMatchObject({ success: false, skipped: true });
  });
});
