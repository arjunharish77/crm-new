import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rules: [] as any[],
  strategies: [] as any[],
  recommendations: [] as any[],
  candidates: [] as any[],
  decisionLogs: [] as any[],
  feedback: [] as any[],
  notifications: [] as any[],
  users: [] as any[],
  lead: null as any,
  ownerOpenCounts: { lead: 0, opportunity: 0 },
}));

function resetState() {
  state.rules = [];
  state.strategies = [];
  state.recommendations = [];
  state.candidates = [];
  state.decisionLogs = [];
  state.feedback = [];
  state.notifications = [];
  state.users = [
    { id: "rep-1", tenantId: "tenant-1", name: "Rep One", email: "rep1@example.com", managerId: "manager-1" },
    { id: "manager-1", tenantId: "tenant-1", name: "Manager One", email: "manager1@example.com", managerId: null },
  ];
  state.lead = {
    id: "lead-1",
    tenantId: "tenant-1",
    ownerId: "rep-1",
    name: "Test Lead",
    updatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    status: "NEW",
    predictiveScore: { conversionProbability: 70, winProbability: null, stallRisk: 20, scoreBand: "WARM" },
  };
  state.ownerOpenCounts = { lead: 0, opportunity: 0 };
}
resetState();

vi.mock("@/lib/db/query", () => ({
  // Identity passthrough -- see the identical comment in tests/ai-assistant.test.ts.
  jsonbParam: (v: unknown) => v,
  query: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('from "NextBestActionRule"')) {
      return state.rules.filter((rule) => rule.strategyId === params[1] && rule.isActive);
    }
    if (sql.includes('select "ruleId" from "NextBestActionRecommendation"') && sql.includes('"generatedAt" >=')) {
      return state.recommendations.filter(
        (rec) => rec.recordType === params[1] && rec.recordId === params[2] && rec.generatedAt >= params[3]
      );
    }
    if (sql.includes('select "ruleId" from "NextBestActionRecommendation"') && sql.includes("status = 'PENDING'")) {
      return state.recommendations.filter((rec) => rec.recordType === params[1] && rec.recordId === params[2] && rec.status === "PENDING");
    }
    if (sql.includes('from "NextBestActionRecommendation"') && sql.includes('order by score desc')) {
      // Mirrors the real query's status filter: only PENDING or a SNOOZED row whose snooze has
      // already elapsed is visible here -- PENDING_APPROVAL/REJECTED/etc. must not leak through.
      const nowIso = new Date().toISOString();
      return state.recommendations.filter(
        (rec) =>
          rec.recordType === params[1] &&
          rec.recordId === params[2] &&
          (rec.status === "PENDING" || (rec.status === "SNOOZED" && (!rec.snoozedUntil || rec.snoozedUntil <= nowIso)))
      );
    }
    if (sql.includes('from "NextBestActionStrategy"')) {
      return state.strategies;
    }
    if (sql.includes('from "NextBestActionRecommendation"') && sql.includes("status = 'PENDING_APPROVAL'") && sql.includes('"managerId" = $2')) {
      const [tenantId, managerId] = params;
      const reportIds = new Set(state.users.filter((u) => u.tenantId === tenantId && u.managerId === managerId).map((u) => u.id));
      return state.recommendations.filter((rec) => rec.tenantId === tenantId && rec.status === "PENDING_APPROVAL" && reportIds.has(rec.ownerId));
    }
    if (sql.includes('select id, name, email from "User"')) {
      const [tenantId, ids] = params;
      return state.users.filter((u) => u.tenantId === tenantId && ids.includes(u.id));
    }
    return [];
  }),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('select "actionType" from "NextBestActionRecommendation"') && sql.includes('"actionType" = any(')) {
      const [tenantId, recordType, recordId, actionTypes, cutoff] = params;
      const matches = state.recommendations
        .filter(
          (rec) =>
            (rec.tenantId ?? "tenant-1") === tenantId &&
            rec.recordType === recordType &&
            rec.recordId === recordId &&
            actionTypes.includes(rec.actionType) &&
            rec.generatedAt >= cutoff
        )
        .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
      return matches[0] ? { actionType: matches[0].actionType } : null;
    }
    if (sql.includes('count(*)::int as count from "NextBestActionRecommendation"') && sql.includes('"ownerId" = $2')) {
      const [tenantId, ownerId, cutoff] = params;
      const count = state.recommendations.filter(
        (rec) => (rec.tenantId ?? "tenant-1") === tenantId && rec.ownerId === ownerId && rec.generatedAt >= cutoff
      ).length;
      return { count };
    }
    if (sql.includes('from "Lead" where "tenantId"') && sql.includes('"ownerId"')) {
      return { count: String(state.ownerOpenCounts.lead) };
    }
    if (sql.includes('from "Opportunity" o')) {
      return { count: String(state.ownerOpenCounts.opportunity) };
    }
    if (sql.includes('insert into "NextBestActionRecommendation"')) {
      const row = {
        id: params[0], tenantId: params[1], strategyId: params[2], ruleId: params[3], recordType: params[4],
        recordId: params[5], ownerId: params[6], actionType: params[7], actionConfig: params[8], score: params[9],
        scoreBreakdown: params[10], reason: params[11], status: params[12], generatedAt: params[13], createdAt: params[13], updatedAt: params[13],
      };
      state.recommendations.push(row);
      return row;
    }
    if (sql.includes('update "NextBestActionRecommendation"') && sql.includes("status = 'PENDING'") && sql.includes("status = 'PENDING_APPROVAL'")) {
      // approveRecommendation's atomic claim: PENDING_APPROVAL -> PENDING.
      const row = state.recommendations.find((rec) => rec.id === params[2]);
      if (!row || row.status !== "PENDING_APPROVAL") return null;
      Object.assign(row, { status: "PENDING", updatedAt: params[0] });
      return { ...row };
    }
    if (sql.includes('update "NextBestActionRecommendation"') && sql.includes("status = 'REJECTED'")) {
      // rejectRecommendation's atomic claim: PENDING_APPROVAL -> REJECTED.
      const row = state.recommendations.find((rec) => rec.id === params[3]);
      if (!row || row.status !== "PENDING_APPROVAL") return null;
      Object.assign(row, { status: "REJECTED", respondedBy: params[0], respondedAt: params[1], updatedAt: params[1] });
      return { ...row };
    }
    if (sql.includes('update "NextBestActionRecommendation" set status = \'COMPLETED\'')) {
      const [updatedAt, tenantId, recommendationId] = params;
      const row = state.recommendations.find((rec) => rec.id === recommendationId && (rec.tenantId ?? "tenant-1") === tenantId);
      if (!row || row.status !== "ACCEPTED") return null;
      Object.assign(row, { status: "COMPLETED", updatedAt });
      return { ...row };
    }
    if (sql.includes('update "NextBestActionRecommendation"') && sql.includes("status in ('PENDING', 'SNOOZED')")) {
      const row = state.recommendations.find((rec) => rec.id === params[5]);
      // Simulates the real atomic-claim WHERE guard: only "matches" (and updates) when
      // the row is still PENDING/SNOOZED, exactly like the real UPDATE ... WHERE clause.
      if (!row || (row.status !== "PENDING" && row.status !== "SNOOZED")) return null;
      Object.assign(row, { status: params[0], snoozedUntil: params[1], respondedBy: params[2], respondedAt: params[3], updatedAt: params[3] });
      return { ...row };
    }
    if (sql.includes('select') && sql.includes('from "NextBestActionRecommendation"')) {
      return state.recommendations.find((rec) => rec.id === params[1]) ?? null;
    }
    if (sql.includes('from "NextBestActionStrategy"') && sql.includes('and id = $2')) {
      return state.strategies.find((s) => s.tenantId === params[0] && s.id === params[1]) ?? null;
    }
    if (sql.includes('from "NextBestActionStrategy"')) {
      return state.strategies.find((s) => s.tenantId === params[0] && s.targetModule === params[1]) ?? null;
    }
    if (sql.includes('"managerId" from "User"')) {
      const user = state.users.find((u) => u.tenantId === params[0] && u.id === params[1]);
      return user ? { managerId: user.managerId ?? null } : null;
    }
    if (sql.includes('from "User"')) {
      return null;
    }
    return null;
  }),
  execute: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('update "NextBestActionRecommendation"') && sql.includes("status = 'PENDING', \"snoozedUntil\" = null")) {
      const row = state.recommendations.find((rec) => rec.id === params[2]);
      if (row) Object.assign(row, { status: "PENDING", snoozedUntil: null, respondedBy: null, respondedAt: null, updatedAt: params[0] });
      return { rowCount: row ? 1 : 0 };
    }
    if (sql.includes('insert into "NextBestActionCandidate"')) {
      state.candidates.push({
        id: params[0], runId: params[2], recordType: params[3], recordId: params[4], ruleId: params[5],
        actionType: params[6], score: params[7], scoreBreakdown: params[8], isEligible: params[9], suppressedReason: params[10],
      });
    }
    if (sql.includes('update "NextBestActionCandidate" set "suppressedReason"')) {
      const [reason, runId, ruleIds] = params;
      for (const candidate of state.candidates) {
        if (candidate.runId === runId && ruleIds.includes(candidate.ruleId)) candidate.suppressedReason = reason;
      }
    }
    if (sql.includes('insert into "NextBestActionDecisionLog"')) {
      // Suppressed-path insert has 7 params (literal 0/[]/true inline in SQL);
      // the normal path has 8 (candidateCount + chosenRecommendationIds are real params).
      state.decisionLogs.push({ suppressed: params.length === 7, raw: params });
    }
    if (sql.includes('insert into "NextBestActionFeedback"')) {
      state.feedback.push({ recommendationId: params[2], outcome: params[3] });
    }
    if (sql.includes('insert into "Notification"')) {
      state.notifications.push({ userId: params[2], title: params[3], message: params[4] });
    }
    return { rowCount: 1 };
  }),
}));

vi.mock("@/lib/server/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/crm")>();
  return { ...actual, createAuditLog: vi.fn(async () => null) };
});

vi.mock("@/lib/repositories/leads-postgres", () => ({
  getLeadForTenant: vi.fn(async () => state.lead),
  updateLeadForTenant: vi.fn(async (_user: any, _id: string, payload: any) => ({ ...state.lead, ...payload })),
}));

vi.mock("@/lib/repositories/opportunities-postgres", () => ({
  getOpportunityForTenant: vi.fn(async () => null),
  updateOpportunityForTenant: vi.fn(async () => null),
}));

vi.mock("@/lib/repositories/tasks-postgres", () => ({
  createTaskForTenant: vi.fn(async (_user: any, input: any) => ({ id: "task-1", ...input })),
}));

vi.mock("@/lib/repositories/activities-postgres", () => ({
  createActivityForTenant: vi.fn(async (_user: any, payload: any) => ({ id: "activity-1", ...payload })),
}));

vi.mock("@/lib/repositories/lead-lists-postgres", () => ({
  addLeadsToLeadListForTenant: vi.fn(async () => undefined),
}));

// Defaults to "unavailable" (matching the real client's behavior with no ML_SERVICE_URL
// configured, i.e. every other test in this file) -- overridden per-test where the ml-service
// blend itself is under test. Returns {} (empty results map), matching the real client's
// contract for "no candidates" / an unreachable service.
const mlServiceMocks = vi.hoisted(() => ({ scoreNbaCandidatesBatchViaMlService: vi.fn(async () => ({}) as any) }));
vi.mock("@/lib/server/ml-service-client", () => mlServiceMocks);

const TENANT_USER = { id: "admin-1", tenantId: "tenant-1", isPlatformAdmin: false };

function makeStrategy(overrides: Partial<any> = {}) {
  return {
    id: "strategy-1",
    tenantId: "tenant-1",
    targetModule: "LEAD",
    isActive: true,
    maxVisibleRecommendationsPerUser: 5,
    cooldownHours: 24,
    dailyActionCapPerUser: 20,
    suppressionConditions: { conditions: [], conditionLogic: "AND" },
    ...overrides,
  };
}

function makeRule(overrides: Partial<any> = {}) {
  return {
    id: "rule-1",
    tenantId: "tenant-1",
    strategyId: "strategy-1",
    name: "Follow up hot leads",
    actionType: "CREATE_TASK",
    eligibilityConditions: { conditions: [], conditionLogic: "AND" },
    actionConfig: {},
    basePriority: 60,
    businessValue: 0,
    priority: 0,
    isActive: true,
    requiresApproval: false,
    ...overrides,
  };
}

describe("Next-Best-Action engine", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  it("returns no recommendations when the strategy is inactive", async () => {
    state.strategies.push(makeStrategy({ isActive: false }));
    state.rules.push(makeRule());

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result).toEqual([]);
  });

  it("suppresses all recommendations when a strategy-level suppression condition matches", async () => {
    state.strategies.push(
      makeStrategy({
        suppressionConditions: { conditions: [{ field: "status", operator: "equals", value: "NEW" }], conditionLogic: "AND" },
      })
    );
    state.rules.push(makeRule());

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result).toEqual([]);
    expect(state.decisionLogs).toHaveLength(1);
  });

  it("excludes a rule whose eligibility conditions don't match and logs it as an ineligible candidate", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(
      makeRule({ id: "rule-cold-only", eligibilityConditions: { conditions: [{ field: "status", operator: "equals", value: "LOST" }], conditionLogic: "AND" } })
    );

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result).toEqual([]);
    expect(state.candidates).toHaveLength(1);
    expect(state.candidates[0]).toMatchObject({ isEligible: false, suppressedReason: "Eligibility conditions did not match" });
  });

  it("generates a ranked recommendation for an eligible rule", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(makeRule());

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ actionType: "CREATE_TASK", status: "PENDING", recordId: "lead-1" });
    expect(result[0].score).toBeGreaterThan(0);
    expect(result[0].reason).toContain("Follow up hot leads");
    expect(state.candidates[0]).toMatchObject({ isEligible: true });
  });

  it("scores a record with weak call engagement higher and calls it out in the reason text", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(makeRule());
    state.lead.predictiveScore = { conversionProbability: 70, winProbability: null, stallRisk: 20, scoreBand: "WARM", callEngagementScore: 10 };

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result).toHaveLength(1);
    expect(result[0].reason).toContain("weak call engagement (10)");
    expect(state.candidates[0].scoreBreakdown).toMatchObject({ callEngagementScore: 10 });
    expect(state.candidates[0].scoreBreakdown.callEngagementBoost).toBeGreaterThan(0);
  });

  it("does not apply a call-engagement boost or mention it when the record has no call history", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(makeRule());
    // Default fixture predictiveScore has no callEngagementScore field at all.

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result[0].reason).not.toContain("call engagement");
    expect(state.candidates[0].scoreBreakdown.callEngagementBoost).toBe(0);
  });

  it("blends in a real ml-service score when available, nudging the total score and recording it in the breakdown", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(makeRule());
    // 80% historical acceptance likelihood -- above the neutral 50% midpoint, so this should
    // nudge the score UP (mlBoost = (80 - 50) * 0.2 = +6), not just be recorded inertly.
    mlServiceMocks.scoreNbaCandidatesBatchViaMlService.mockResolvedValueOnce({
      "rule-1": { available: true, mlScore: 80, sampleSize: 42 },
    });

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const withMl = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");
    expect(withMl[0].scoreBreakdown).toMatchObject({ mlScore: 80, mlBoost: 6 });
    // Batched, not one call per rule: exactly one request covers every eligible rule in this pass.
    expect(mlServiceMocks.scoreNbaCandidatesBatchViaMlService).toHaveBeenCalledTimes(1);
    expect(mlServiceMocks.scoreNbaCandidatesBatchViaMlService).toHaveBeenCalledWith(
      expect.objectContaining({ candidates: [expect.objectContaining({ key: "rule-1", actionType: "CREATE_TASK" })] }),
    );

    // Same setup, ml-service unavailable this time (the default mock) -- score should be lower
    // by exactly the mlBoost that was applied above, proving it's additive, not just cosmetic.
    resetState();
    state.strategies.push(makeStrategy());
    state.rules.push(makeRule());
    const withoutMl = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");
    expect(withoutMl[0].scoreBreakdown).toMatchObject({ mlScore: "UNAVAILABLE", mlBoost: 0 });
    expect(withMl[0].score).toBeCloseTo(withoutMl[0].score + 6, 1);
  });

  it("scores multiple eligible rules sharing an actionType in a single ml-service request, keyed per rule", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(
      makeRule({ id: "rule-a", name: "Rule A", actionType: "CREATE_TASK" }),
      makeRule({ id: "rule-b", name: "Rule B", actionType: "CREATE_TASK" }),
    );
    mlServiceMocks.scoreNbaCandidatesBatchViaMlService.mockResolvedValueOnce({
      "rule-a": { available: true, mlScore: 90, sampleSize: 30 },
      "rule-b": { available: true, mlScore: 10, sampleSize: 30 },
    });

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(mlServiceMocks.scoreNbaCandidatesBatchViaMlService).toHaveBeenCalledTimes(1);
    const { candidates } = (mlServiceMocks.scoreNbaCandidatesBatchViaMlService as any).mock.calls[0][0] as { candidates: Array<{ key: string }> };
    expect(candidates.map((c: any) => c.key).sort()).toEqual(["rule-a", "rule-b"]);
    // Different per-rule ml results actually applied to the right candidate, not swapped/shared.
    const byRule = Object.fromEntries(state.candidates.map((c) => [c.ruleId, c.scoreBreakdown]));
    expect(byRule["rule-a"].mlBoost).toBe(8); // (90-50)*0.2
    expect(byRule["rule-b"].mlBoost).toBe(-8); // (10-50)*0.2
  });

  it("does not re-fetch the owner's open-record count once per rule when multiple rules are eligible for the same record", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(makeRule({ id: "rule-a" }), makeRule({ id: "rule-b" }));
    state.ownerOpenCounts = { lead: 3, opportunity: 0 };

    const { queryOne } = await import("@/lib/db/query");
    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    const openCountCalls = (queryOne as any).mock.calls.filter(([sql]: [string]) => sql.includes('from "Lead" where "tenantId"') && sql.includes('"ownerId"'));
    expect(openCountCalls).toHaveLength(1);
    expect(state.candidates.every((c) => c.scoreBreakdown.ownerOpenRecordCount === 3)).toBe(true);
  });

  it("never lets an ml-service failure break recommendation generation", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(makeRule());
    mlServiceMocks.scoreNbaCandidatesBatchViaMlService.mockRejectedValueOnce(new Error("ml-service unreachable"));

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result).toHaveLength(1);
    expect(result[0].scoreBreakdown.mlScore).toBe("UNAVAILABLE");
  });

  it("suppresses a rule's action type while inside its cooldown window", async () => {
    state.strategies.push(makeStrategy({ cooldownHours: 24 }));
    state.rules.push(makeRule());
    state.recommendations.push({
      id: "existing-rec",
      recordType: "LEAD",
      recordId: "lead-1",
      ruleId: "rule-1",
      actionType: "CREATE_TASK",
      status: "DISMISSED",
      generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago, inside 24h cooldown
    });

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result).toEqual([]);
    const candidate = state.candidates.find((c) => c.ruleId === "rule-1");
    expect(candidate).toMatchObject({ isEligible: false, suppressedReason: expect.stringContaining("cooldown") });
  });

  it("does not generate new recommendations once the owner has hit their dailyActionCapPerUser, even though the rule itself is eligible", async () => {
    state.strategies.push(makeStrategy({ dailyActionCapPerUser: 1 }));
    state.rules.push(makeRule());
    // One recommendation already generated for this owner today, on a DIFFERENT record --
    // dailyActionCapPerUser is a per-owner cap across all records, not per-record like the
    // cooldown above.
    state.recommendations.push({
      id: "existing-rec-other-record",
      tenantId: "tenant-1",
      recordType: "LEAD",
      recordId: "lead-other",
      ruleId: "rule-other",
      ownerId: "rep-1",
      actionType: "CREATE_TASK",
      status: "PENDING",
      generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago, inside the 24h window
    });

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    // Still eligible and candidate-logged (the audit trail stays intact) -- just not created,
    // since the owner is already at their configured daily cap.
    expect(result).toEqual([]);
    expect(state.candidates[0]).toMatchObject({ isEligible: true });
    // "Action fatigue" now leaves a real trace instead of looking identical to a low-scoring cut.
    expect(state.candidates[0].suppressedReason).toBe("Daily action cap reached for this owner");
  });

  it("still generates recommendations up to whatever headroom remains under dailyActionCapPerUser", async () => {
    state.strategies.push(makeStrategy({ dailyActionCapPerUser: 2 }));
    state.rules.push(makeRule());
    state.recommendations.push({
      id: "existing-rec-other-record",
      tenantId: "tenant-1",
      recordType: "LEAD",
      recordId: "lead-other",
      ruleId: "rule-other",
      ownerId: "rep-1",
      actionType: "CREATE_TASK",
      status: "PENDING",
      generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    // 1 of the owner's 2-per-day cap already used -> exactly 1 more allowed through.
    expect(result).toHaveLength(1);
  });

  it("keeps only the highest-scored communication-type candidate when different rules suggest one in the same pass", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(
      makeRule({ id: "rule-call", actionType: "CALL_LEAD", basePriority: 90 }),
      makeRule({ id: "rule-email", actionType: "SEND_EMAIL", basePriority: 20 }),
    );

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    // Two independently-eligible rules each suggesting a different communication channel for
    // the same record at once must not both go through -- channel fatigue keeps the
    // higher-scored one only.
    expect(result).toHaveLength(1);
    expect(result[0].actionType).toBe("CALL_LEAD");
    // The filtered-out SEND_EMAIL candidate now carries a real suppressedReason.
    const suppressedCandidate = state.candidates.find((candidate) => candidate.ruleId === "rule-email");
    expect(suppressedCandidate?.suppressedReason).toBe(
      "Channel fatigue: another communication channel was already suggested for this record recently",
    );
  });

  it("suppresses all new communication-type candidates once one was already recommended recently for this record, leaving non-communication actions unaffected", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(
      makeRule({ id: "rule-call", actionType: "CALL_LEAD" }),
      makeRule({ id: "rule-task", actionType: "CREATE_TASK" }),
    );
    // From a DIFFERENT rule than either candidate above, so this isn't just the existing
    // per-rule cooldown mechanism -- channel fatigue is the only thing that should block it.
    state.recommendations.push({
      id: "existing-comm-rec",
      tenantId: "tenant-1",
      recordType: "LEAD",
      recordId: "lead-1",
      ruleId: "some-other-rule",
      ownerId: "rep-1",
      actionType: "SEND_WHATSAPP",
      status: "DISMISSED",
      generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1h ago, inside the 24h cooldown window
    });

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    expect(result).toHaveLength(1);
    expect(result[0].actionType).toBe("CREATE_TASK");
  });

  it("executes CREATE_TASK, writes feedback, and marks the recommendation ACCEPTED on accept", async () => {
    state.recommendations.push({
      id: "rec-1",
      tenantId: "tenant-1",
      recordType: "LEAD",
      recordId: "lead-1",
      ownerId: "rep-1",
      actionType: "CREATE_TASK",
      actionConfig: { taskTitle: "Call the lead" },
      status: "PENDING",
      reason: "test",
    });

    const { createTaskForTenant } = await import("@/lib/repositories/tasks-postgres");
    const { respondToRecommendation } = await import("@/lib/server/next-best-action");
    const updated = await respondToRecommendation(TENANT_USER, "rec-1", { status: "ACCEPTED" });

    expect(createTaskForTenant).toHaveBeenCalledTimes(1);
    expect(createTaskForTenant).toHaveBeenCalledWith(
      TENANT_USER,
      expect.objectContaining({ title: "Call the lead", leadId: "lead-1", metadata: { recommendationId: "rec-1" } })
    );
    expect(updated).toMatchObject({ status: "ACCEPTED" });
    expect(state.feedback).toEqual([{ recommendationId: "rec-1", outcome: "ACCEPTED" }]);
  });

  describe("completeLinkedRecommendation", () => {
    it("flips an ACCEPTED recommendation to COMPLETED and records feedback", async () => {
      state.recommendations.push({
        id: "rec-completable",
        tenantId: "tenant-1",
        recordType: "LEAD",
        recordId: "lead-1",
        actionType: "CREATE_TASK",
        status: "ACCEPTED",
      });

      const { completeLinkedRecommendation } = await import("@/lib/server/next-best-action");
      const result = await completeLinkedRecommendation(TENANT_USER, "rec-completable");

      expect(result).toMatchObject({ status: "COMPLETED" });
      expect(state.feedback).toEqual([{ recommendationId: "rec-completable", outcome: "COMPLETED" }]);
    });

    it("does not complete a recommendation that isn't currently ACCEPTED", async () => {
      state.recommendations.push({
        id: "rec-pending",
        tenantId: "tenant-1",
        recordType: "LEAD",
        recordId: "lead-1",
        actionType: "CREATE_TASK",
        status: "PENDING",
      });

      const { completeLinkedRecommendation } = await import("@/lib/server/next-best-action");
      const result = await completeLinkedRecommendation(TENANT_USER, "rec-pending");

      expect(result).toBeNull();
      expect(state.feedback).toEqual([]);
      expect(state.recommendations.find((rec) => rec.id === "rec-pending")?.status).toBe("PENDING");
    });
  });

  it("rejects responding to a recommendation that's already resolved", async () => {
    state.recommendations.push({
      id: "rec-2",
      tenantId: "tenant-1",
      recordType: "LEAD",
      recordId: "lead-1",
      actionType: "DO_NOTHING",
      status: "ACCEPTED",
    });

    const { respondToRecommendation } = await import("@/lib/server/next-best-action");
    await expect(respondToRecommendation(TENANT_USER, "rec-2", { status: "DISMISSED" })).rejects.toThrow(
      "NBA_RECOMMENDATION_ALREADY_RESOLVED"
    );
  });

  it("does not let a second concurrent respond call re-execute an already-claimed recommendation", async () => {
    state.recommendations.push({
      id: "rec-3",
      tenantId: "tenant-1",
      recordType: "LEAD",
      recordId: "lead-1",
      ownerId: "rep-1",
      actionType: "CREATE_TASK",
      actionConfig: {},
      status: "PENDING",
      reason: "test",
    });

    const { createTaskForTenant } = await import("@/lib/repositories/tasks-postgres");
    const { respondToRecommendation } = await import("@/lib/server/next-best-action");

    const first = await respondToRecommendation(TENANT_USER, "rec-3", { status: "ACCEPTED" });
    expect(first).toMatchObject({ status: "ACCEPTED" });
    expect(createTaskForTenant).toHaveBeenCalledTimes(1);

    // A second call against the now-claimed row must not re-run the action.
    await expect(respondToRecommendation(TENANT_USER, "rec-3", { status: "ACCEPTED" })).rejects.toThrow(
      "NBA_RECOMMENDATION_ALREADY_RESOLVED"
    );
    expect(createTaskForTenant).toHaveBeenCalledTimes(1);
  });

  it("does not let a rule sharing an actionType with another rule's pending recommendation get blocked", async () => {
    state.strategies.push(makeStrategy());
    state.rules.push(makeRule({ id: "rule-a", actionType: "CALL_LEAD" }));
    state.rules.push(makeRule({ id: "rule-b", actionType: "CALL_LEAD", name: "Different rule, same action type" }));
    state.recommendations.push({
      id: "existing-from-rule-a",
      recordType: "LEAD",
      recordId: "lead-1",
      ruleId: "rule-a",
      actionType: "CALL_LEAD",
      status: "PENDING",
      generatedAt: new Date().toISOString(),
    });

    const { generateRecommendationsForRecord } = await import("@/lib/server/next-best-action");
    const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

    // rule-a is blocked by its own pending recommendation; rule-b, a distinct rule that
    // merely happens to share the same actionType, must still be free to surface.
    expect(result.some((rec: any) => rec.ruleId === "rule-b")).toBe(true);
    expect(result.some((rec: any) => rec.ruleId === "rule-a")).toBe(false);
  });

  it("rejects UPDATE_FIELD on accept when fieldKey isn't in the writable whitelist", async () => {
    state.recommendations.push({
      id: "rec-4",
      tenantId: "tenant-1",
      recordType: "LEAD",
      recordId: "lead-1",
      ownerId: "rep-1",
      actionType: "UPDATE_FIELD",
      actionConfig: { fieldKey: "score", fieldValue: 90 },
      status: "PENDING",
    });

    const { respondToRecommendation } = await import("@/lib/server/next-best-action");
    await expect(respondToRecommendation(TENANT_USER, "rec-4", { status: "ACCEPTED" })).rejects.toThrow(
      "NBA_UPDATE_FIELD_NOT_WRITABLE"
    );
    // The failed execution must not leave the recommendation stuck ACCEPTED.
    expect(state.recommendations.find((rec) => rec.id === "rec-4")?.status).toBe("PENDING");
  });

  it("rejects saving a SCHEDULE_ACTIVITY rule with no activityTypeId", async () => {
    state.strategies.push(makeStrategy());
    const { createNextBestActionRule } = await import("@/lib/server/next-best-action");
    await expect(
      createNextBestActionRule(TENANT_USER, "strategy-1", { name: "Bad rule", actionType: "SCHEDULE_ACTIVITY", actionConfig: {} })
    ).rejects.toThrow("NBA_RULE_SCHEDULE_ACTIVITY_MISSING_TYPE");
  });

  it("rejects saving a rule with an invalid task priority", async () => {
    state.strategies.push(makeStrategy());
    const { createNextBestActionRule } = await import("@/lib/server/next-best-action");
    await expect(
      createNextBestActionRule(TENANT_USER, "strategy-1", { name: "Bad rule", actionType: "CREATE_TASK", actionConfig: { priority: "SUPER_URGENT" } })
    ).rejects.toThrow("NBA_RULE_INVALID_PRIORITY");
  });

  describe("manager approval", () => {
    const MANAGER_USER = { id: "manager-1", tenantId: "tenant-1", isPlatformAdmin: false };

    it("generates a PENDING_APPROVAL recommendation (not PENDING) for a rule marked requiresApproval, invisible to the owner's normal list", async () => {
      state.strategies.push(makeStrategy());
      state.rules.push(makeRule({ requiresApproval: true }));

      const { generateRecommendationsForRecord, listRecommendationsForRecord } = await import("@/lib/server/next-best-action");
      const result = await generateRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("PENDING_APPROVAL");

      // The owner's normal list (used by respondToRecommendation's caller, nba-panel.tsx) only
      // ever selects PENDING/due-SNOOZED rows -- PENDING_APPROVAL must not leak into it.
      const ownerVisible = await listRecommendationsForRecord(TENANT_USER, "LEAD", "lead-1");
      expect(ownerVisible.find((rec: any) => rec.id === result[0].id)).toBeUndefined();
    });

    it("lets the resolved manager approve a PENDING_APPROVAL recommendation, moving it to PENDING and notifying the owner", async () => {
      state.recommendations.push({
        id: "rec-approval-1",
        tenantId: "tenant-1",
        recordType: "LEAD",
        recordId: "lead-1",
        ownerId: "rep-1",
        actionType: "CREATE_TASK",
        reason: "Follow up hot leads",
        status: "PENDING_APPROVAL",
        generatedAt: new Date().toISOString(),
      });

      const { approveRecommendation } = await import("@/lib/server/next-best-action");
      const updated = await approveRecommendation(MANAGER_USER, "rec-approval-1");

      expect(updated).toMatchObject({ id: "rec-approval-1", status: "PENDING" });
      expect(state.notifications.some((n) => n.userId === "rep-1" && n.title === "Recommendation approved")).toBe(true);
    });

    it("lets the resolved manager reject a PENDING_APPROVAL recommendation, moving it to REJECTED and notifying the owner with the reason", async () => {
      state.recommendations.push({
        id: "rec-approval-1",
        tenantId: "tenant-1",
        recordType: "LEAD",
        recordId: "lead-1",
        ownerId: "rep-1",
        actionType: "CREATE_TASK",
        reason: "Follow up hot leads",
        status: "PENDING_APPROVAL",
        generatedAt: new Date().toISOString(),
      });

      const { rejectRecommendation } = await import("@/lib/server/next-best-action");
      const updated = await rejectRecommendation(MANAGER_USER, "rec-approval-1", "Not the right approach for this lead");

      expect(updated).toMatchObject({ id: "rec-approval-1", status: "REJECTED", respondedBy: "manager-1" });
      const notification = state.notifications.find((n) => n.userId === "rep-1" && n.title === "Recommendation rejected");
      expect(notification?.message).toContain("Not the right approach for this lead");
    });

    it("rejects approval from a user who is not the resolved manager for the recommendation's owner", async () => {
      state.recommendations.push({
        id: "rec-approval-1",
        tenantId: "tenant-1",
        recordType: "LEAD",
        recordId: "lead-1",
        ownerId: "rep-1",
        actionType: "CREATE_TASK",
        status: "PENDING_APPROVAL",
        generatedAt: new Date().toISOString(),
      });

      const { approveRecommendation } = await import("@/lib/server/next-best-action");
      // TENANT_USER ("admin-1") is not rep-1's manager (rep-1's managerId is "manager-1").
      await expect(approveRecommendation(TENANT_USER, "rec-approval-1")).rejects.toThrow("NBA_APPROVAL_NOT_AUTHORIZED");
    });

    it("rejects re-approving a recommendation that's already been resolved", async () => {
      state.recommendations.push({
        id: "rec-approval-1",
        tenantId: "tenant-1",
        recordType: "LEAD",
        recordId: "lead-1",
        ownerId: "rep-1",
        actionType: "CREATE_TASK",
        status: "PENDING",
        generatedAt: new Date().toISOString(),
      });

      const { approveRecommendation } = await import("@/lib/server/next-best-action");
      await expect(approveRecommendation(MANAGER_USER, "rec-approval-1")).rejects.toThrow("NBA_RECOMMENDATION_NOT_PENDING_APPROVAL");
    });

    it("listPendingApprovalsForManager returns only the requesting manager's direct reports' pending approvals, enriched with record and owner names", async () => {
      state.users.push({ id: "rep-2", tenantId: "tenant-1", name: "Rep Two", email: "rep2@example.com", managerId: "someone-else" });
      state.recommendations.push(
        {
          id: "rec-mine",
          tenantId: "tenant-1",
          recordType: "LEAD",
          recordId: "lead-1",
          ownerId: "rep-1",
          actionType: "CREATE_TASK",
          reason: "Follow up",
          status: "PENDING_APPROVAL",
          generatedAt: new Date().toISOString(),
        },
        {
          id: "rec-not-mine",
          tenantId: "tenant-1",
          recordType: "LEAD",
          recordId: "lead-1",
          ownerId: "rep-2",
          actionType: "CREATE_TASK",
          status: "PENDING_APPROVAL",
          generatedAt: new Date().toISOString(),
        },
        {
          id: "rec-mine-but-resolved",
          tenantId: "tenant-1",
          recordType: "LEAD",
          recordId: "lead-1",
          ownerId: "rep-1",
          actionType: "CREATE_TASK",
          status: "PENDING",
          generatedAt: new Date().toISOString(),
        },
      );

      const { listPendingApprovalsForManager } = await import("@/lib/server/next-best-action");
      const approvals = await listPendingApprovalsForManager(MANAGER_USER);

      expect(approvals.map((a: any) => a.id)).toEqual(["rec-mine"]);
      expect(approvals[0]).toMatchObject({ recordName: "Test Lead", ownerName: "Rep One" });
    });
  });
});
