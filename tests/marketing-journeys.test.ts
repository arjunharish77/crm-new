import { beforeEach, describe, expect, it, vi } from "vitest";

function assignDynamicUpdate(sql: string, target: Record<string, any>, params: any[]) {
  const setClause = sql.match(/set\s+([\s\S]+?)\s+where/i)?.[1] ?? "";
  const columns = [...setClause.matchAll(/"?([A-Za-z][A-Za-z0-9]*)"?\s*=\s*\$\d+/g)].map((match) => match[1]);
  columns.forEach((column, index) => {
    target[column] = params[index];
  });
}

const state = vi.hoisted(() => ({
  journeys: [] as any[],
  journeyVersions: [] as any[],
  enrollments: [] as any[],
  preferences: [] as any[],
  touches: [] as any[],
  automations: new Map<string, any>(),
  leadList: null as any,
  savedView: null as any,
  leadsResult: { data: [] as any[], meta: { total: 0 } },
  opportunitiesResult: { data: [] as any[], meta: { total: 0 } },
  opportunities: [] as any[],
  costEntries: [] as any[],
  commissionLedgerRows: [] as any[],
  users: [] as any[],
}));

function resetState() {
  state.journeys = [];
  state.journeyVersions = [];
  state.enrollments = [];
  state.preferences = [];
  state.touches = [];
  state.automations = new Map([["auto-1", { id: "auto-1", tenantId: "tenant-1", workflow: { nodes: [], edges: [] } }]]);
  state.leadList = { id: "list-1", count: 2, leads: [{ id: "lead-1" }, { id: "lead-2" }] };
  state.savedView = null;
  state.leadsResult = { data: [], meta: { total: 0 } };
  state.opportunitiesResult = { data: [], meta: { total: 0 } };
  state.opportunities = [];
  state.costEntries = [];
  state.commissionLedgerRows = [];
  state.users = [];
}
resetState();

vi.mock("@/lib/db/query", () => ({
  query: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('from "MarketingJourney"') && !sql.includes("Version") && !sql.includes("Enrollment")) {
      return state.journeys.filter((j) => j.tenantId === params[0] && (params[1] === undefined || j.status === "ACTIVE"));
    }
    if (sql.includes('select "recordId" from "MarketingJourneyEnrollment"')) {
      return state.enrollments.filter((e) => e.journeyId === params[1]).map((e) => ({ recordId: e.recordId }));
    }
    if (sql.includes('"MarketingJourneyEnrollment" e') && sql.includes('join "MarketingJourney" j')) {
      const [tenantId, recordType, recordId, journeyId] = params;
      return state.enrollments
        .filter((e) => e.tenantId === tenantId && e.recordType === recordType && e.recordId === recordId && e.status === "ACTIVE" && e.journeyId !== journeyId)
        .map((e) => ({ id: e.id, priority: state.journeys.find((j) => j.id === e.journeyId)?.priority ?? 0, journeyStatus: state.journeys.find((j) => j.id === e.journeyId)?.status }))
        .filter((row) => row.journeyStatus === "ACTIVE");
    }
    if (sql.includes('select "journeyId" from "MarketingJourneyEnrollment"')) {
      const [tenantId, recordType, recordId, journeyId] = params;
      return state.enrollments
        .filter((e) => e.tenantId === tenantId && e.recordType === recordType && e.recordId === recordId && e.status === "ACTIVE" && e.journeyId !== journeyId)
        .map((e) => ({ journeyId: e.journeyId }));
    }
    if (sql.includes('from "MarketingJourneyEnrollment"') && sql.includes("order by")) {
      return state.enrollments.filter((e) => e.journeyId === params[1]);
    }
    if (sql.includes('from "MarketingAttributionTouch"')) {
      return state.touches.filter((t) => t.tenantId === params[0]);
    }
    if (sql.includes('from "Opportunity" o') && sql.includes('join "OpportunityStage" s')) {
      const [tenantId, ids] = params;
      return state.opportunities.filter((o: any) => o.tenantId === tenantId && ids.includes(o.id));
    }
    if (sql.includes('from "MarketingCostEntry"')) {
      return state.costEntries.filter((c: any) => c.tenantId === params[0]);
    }
    if (sql.includes('"CommissionLedger"')) {
      const [tenantId, ids] = params;
      const matches = state.commissionLedgerRows.filter((r: any) => r.tenantId === tenantId && ids.includes(r.opportunityId));
      const latestByOpp = new Map<string, any>();
      for (const row of matches) {
        const existing = latestByOpp.get(row.opportunityId);
        if (!existing || row.createdAt > existing.createdAt) latestByOpp.set(row.opportunityId, row);
      }
      return [...latestByOpp.values()].map((row) => {
        const user = state.users.find((u: any) => u.id === row.partnerId);
        return { opportunityId: row.opportunityId, partnerName: user?.name ?? user?.email ?? row.partnerId };
      });
    }
    if (sql.includes('from "MarketingPreference"')) {
      return state.preferences.filter((p) => p.tenantId === params[0] && p.recordType === params[1] && p.recordId === params[2]);
    }
    if (sql.includes('select status, count(*)::int as count from "MarketingJourneyEnrollment"')) {
      const [tenantId, journeyId] = params;
      const counts: Record<string, number> = {};
      for (const e of state.enrollments) {
        if (e.tenantId === tenantId && e.journeyId === journeyId) counts[e.status] = (counts[e.status] ?? 0) + 1;
      }
      return Object.entries(counts).map(([status, count]) => ({ status, count }));
    }
    if (sql.includes('from "MarketingJourneyVersion"')) {
      return state.journeyVersions
        .filter((v) => v.tenantId === params[0] && v.journeyId === params[1])
        .sort((a, b) => b.version - a.version);
    }
    return [];
  }),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('insert into "MarketingJourney"')) {
      const row = {
        id: params[0], tenantId: params[1], automationId: params[2], name: params[3], description: params[4],
        targetModule: params[5], status: "DRAFT", audienceType: params[6], audienceConfig: params[7],
        continuousEnrollment: params[8], scheduledAt: params[9], priority: params[10], currentVersion: 0,
        createdBy: params[11], createdAt: params[12], updatedAt: params[12],
      };
      state.journeys.push(row);
      return row;
    }
    if (sql.match(/update "MarketingJourney" set status/)) {
      const row = state.journeys.find((j) => j.id === params[3]);
      if (!row) return null;
      Object.assign(row, { status: params[0], updatedAt: params[1] });
      return row;
    }
    if (sql.match(/update "MarketingJourney" set "currentVersion"/)) {
      const row = state.journeys.find((j) => j.id === params[3]);
      if (!row) return null;
      Object.assign(row, { currentVersion: params[0], updatedAt: params[1] });
      return row;
    }
    if (sql.includes('update "MarketingJourney" set')) {
      const idIndex = params.length - 1;
      const row = state.journeys.find((j) => j.id === params[idIndex]);
      if (!row) return null;
      assignDynamicUpdate(sql, row, params);
      return row;
    }
    if (sql.includes('from "MarketingJourney"') && sql.includes('limit 1')) {
      return state.journeys.find((j) => j.tenantId === params[0] && j.id === params[1]) ?? null;
    }
    if (sql.includes('from "CustomReport"')) {
      return state.savedView;
    }
    if (sql.includes('from "MarketingJourneyVersion"') && sql.includes('version = $3')) {
      return state.journeyVersions.find((v) => v.tenantId === params[0] && v.journeyId === params[1] && v.version === params[2]) ?? null;
    }
    if (sql.includes('select id from "MarketingPreference"')) {
      return state.preferences.find((p) => p.tenantId === params[0] && p.recordType === params[1] && p.recordId === params[2] && p.topic === params[3]) ?? null;
    }
    if (sql.includes('insert into "MarketingPreference"')) {
      const row = { id: params[0], tenantId: params[1], recordType: params[2], recordId: params[3], topic: params[4], isOptedIn: params[5] };
      state.preferences.push(row);
      return row;
    }
    if (sql.includes('update "MarketingPreference"')) {
      const row = state.preferences.find((p) => p.id === params[3]);
      if (row) Object.assign(row, { isOptedIn: params[0] });
      return row ?? null;
    }
    if (sql.includes('insert into "MarketingAttributionTouch"')) {
      state.touches.push({
        id: params[0], tenantId: params[1], recordType: params[2], recordId: params[3], source: params[4],
        medium: params[5], campaign: params[6], channel: params[7], touchType: params[8], journeyId: params[9],
      });
      return { id: params[0] };
    }
    if (sql.includes('update "MarketingJourneyEnrollment" set status')) {
      // Covers both markEnrollmentStatus (EXITED/CONVERTED/UNSUBSCRIBED with a param'd status)
      // and resolveJourneyEnrollmentCollision's hardcoded EXITED/JOURNEY_PRIORITY_COLLISION update.
      const isCollisionExit = sql.includes("'EXITED'") && sql.includes("'JOURNEY_PRIORITY_COLLISION'");
      const id = isCollisionExit ? params[1] : params[4];
      const row = state.enrollments.find((e) => e.id === id);
      if (!row) return null;
      if (isCollisionExit) {
        Object.assign(row, { status: "EXITED", exitedAt: params[0], exitReason: "JOURNEY_PRIORITY_COLLISION" });
      } else {
        Object.assign(row, { status: params[0], exitedAt: params[1], exitReason: params[2] });
      }
      return row;
    }
    if (sql.includes('insert into "MarketingJourneyEnrollment"')) {
      // Simulates the real ON CONFLICT DO NOTHING ... RETURNING id: null if a row for
      // this (journeyId, recordType, recordId) already exists, otherwise inserts and
      // returns the new id -- this is the atomic dedup gate the real code relies on.
      const [id, tenantId, journeyId, recordType, recordId, enrolledAt] = params;
      const exists = state.enrollments.some((e) => e.journeyId === journeyId && e.recordType === recordType && e.recordId === recordId);
      if (exists) return null;
      state.enrollments.push({ id, tenantId, journeyId, recordType, recordId, status: "ACTIVE", enrolledAt });
      return { id };
    }
    return null;
  }),
  execute: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('insert into "MarketingJourneyVersion"')) {
      const [id, tenantId, journeyId, version, workflowSnapshot, publishNotes, publishedBy, publishedAt] = params;
      state.journeyVersions.push({ id, tenantId, journeyId, version, workflowSnapshot, publishNotes, publishedBy, publishedAt });
      return { rowCount: 1 };
    }
    return { rowCount: 1 };
  }),
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
}));

vi.mock("@/lib/repositories/automations-postgres", () => ({
  createAutomationForTenant: vi.fn(async (_user: any, payload: any) => ({ id: "auto-1", ...payload })),
  getAutomationForTenant: vi.fn(async (_user: any, id: string) => state.automations.get(id) ?? null),
  updateAutomationForTenant: vi.fn(async (_user: any, id: string, patch: any) => {
    const existing = state.automations.get(id);
    if (existing) Object.assign(existing, patch);
    return existing;
  }),
  enrollRecordsInAutomation: vi.fn(async () => ({ jobId: "job-1" })),
  executeAutomationWorkflow: vi.fn(async () => [{ node: "n1", type: "send_email", status: "SKIPPED_IN_TEST_MODE" }]),
  loadAutomationTestRecord: vi.fn(async (_user: any, _entityType: string, id: string) => ({ id, email: `${id}@example.com` })),
}));

vi.mock("@/lib/server/communications", () => ({
  isSuppressed: vi.fn(async () => false),
  isOptedOut: vi.fn(async () => false),
}));

vi.mock("@/lib/repositories/lead-lists-postgres", () => ({
  getLeadListForTenant: vi.fn(async () => state.leadList),
}));

vi.mock("@/lib/repositories/leads-postgres", () => ({
  listLeadsForTenant: vi.fn(async () => state.leadsResult),
}));

vi.mock("@/lib/repositories/opportunities-postgres", () => ({
  listOpportunitiesForTenantByType: vi.fn(async () => state.opportunitiesResult),
}));

const TENANT_USER = { id: "admin-1", tenantId: "tenant-1" };

describe("Marketing journey engine", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
    state.automations = new Map([["auto-1", { id: "auto-1", tenantId: "tenant-1", workflow: { nodes: [], edges: [] } }]]);
  });

  it("creates a journey with its own underlying automation, in DRAFT status", async () => {
    const { createJourneyForTenant } = await import("@/lib/server/marketing-journeys");
    const { createAutomationForTenant } = await import("@/lib/repositories/automations-postgres");

    const journey = await createJourneyForTenant(TENANT_USER, { name: "Welcome Series", targetModule: "LEAD" });

    expect(createAutomationForTenant).toHaveBeenCalledWith(TENANT_USER, expect.objectContaining({ trigger: { type: "MANUAL" } }));
    expect(journey).toMatchObject({ name: "Welcome Series", status: "DRAFT", automationId: "auto-1" });
  });

  it("rejects an invalid status transition", async () => {
    const { createJourneyForTenant, transitionJourneyStatus } = await import("@/lib/server/marketing-journeys");
    const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD" });

    await expect(transitionJourneyStatus(TENANT_USER, journey.id, "ACTIVE")).rejects.toThrow("INVALID_JOURNEY_TRANSITION");
  });

  it("allows DRAFT -> APPROVED -> ACTIVE and activates the underlying automation", async () => {
    const { createJourneyForTenant, transitionJourneyStatus } = await import("@/lib/server/marketing-journeys");
    const { updateAutomationForTenant } = await import("@/lib/repositories/automations-postgres");
    const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD" });

    await transitionJourneyStatus(TENANT_USER, journey.id, "APPROVED");
    const active = await transitionJourneyStatus(TENANT_USER, journey.id, "ACTIVE");

    expect(active).toMatchObject({ status: "ACTIVE" });
    expect(updateAutomationForTenant).toHaveBeenCalledWith(TENANT_USER, "auto-1", { isActive: true });
  });

  it("keeps the underlying automation active when a journey is paused, so in-flight steps aren't cancelled", async () => {
    const { createJourneyForTenant, transitionJourneyStatus } = await import("@/lib/server/marketing-journeys");
    const { updateAutomationForTenant } = await import("@/lib/repositories/automations-postgres");
    const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD" });
    await transitionJourneyStatus(TENANT_USER, journey.id, "APPROVED");
    await transitionJourneyStatus(TENANT_USER, journey.id, "ACTIVE");

    const paused = await transitionJourneyStatus(TENANT_USER, journey.id, "PAUSED");

    expect(paused).toMatchObject({ status: "PAUSED" });
    // The automation engine's queue worker CANCELS a waiting step outright when
    // isActive=false -- pausing must not flip that, or every in-flight enrolled record
    // gets silently and irrecoverably dropped instead of just held.
    expect(updateAutomationForTenant).toHaveBeenLastCalledWith(TENANT_USER, "auto-1", { isActive: true });
  });

  it("blocks changing audience config on an ACTIVE journey (must pause first)", async () => {
    const { createJourneyForTenant, transitionJourneyStatus, updateJourneyForTenant } = await import("@/lib/server/marketing-journeys");
    const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD", audienceType: "LEAD_LIST", audienceConfig: { leadListId: "list-1" } });
    await transitionJourneyStatus(TENANT_USER, journey.id, "APPROVED");
    await transitionJourneyStatus(TENANT_USER, journey.id, "ACTIVE");

    await expect(
      updateJourneyForTenant(TENANT_USER, journey.id, { audienceConfig: { leadListId: "list-2" } })
    ).rejects.toThrow("MARKETING_JOURNEY_PAUSE_BEFORE_EDITING_AUDIENCE");
    // Non-audience fields (e.g. description) must still be editable while ACTIVE.
    const updated = await updateJourneyForTenant(TENANT_USER, journey.id, { description: "updated copy" });
    expect(updated).toMatchObject({ description: "updated copy" });
  });

  it("resolves a SAVED_VIEW audience to nothing, not everything, when the view has no tab for the target module", async () => {
    state.savedView = { config: { tabs: [{ module: "LEADS", filters: { logic: "AND", conditions: [] } }] } };
    state.opportunitiesResult = { data: [{ id: "opp-1" }, { id: "opp-2" }, { id: "opp-3" }], meta: { total: 3 } };

    const { resolveJourneyAudienceRecordIds } = await import("@/lib/server/marketing-journeys");
    // A Lead-only saved view used for an Opportunity-targeted journey must not silently
    // fall back to a wrong-module tab (or to no filter at all, matching every Opportunity).
    const result = await resolveJourneyAudienceRecordIds(TENANT_USER, "OPPORTUNITY", "SAVED_VIEW", { savedViewId: "view-1" });

    expect(result).toEqual({ total: 0, recordIds: [] });
  });

  it("resolves LEAD_LIST audience via getLeadListForTenant", async () => {
    const { resolveJourneyAudienceRecordIds } = await import("@/lib/server/marketing-journeys");
    const result = await resolveJourneyAudienceRecordIds(TENANT_USER, "LEAD", "LEAD_LIST", { leadListId: "list-1" });
    expect(result).toEqual({ total: 2, recordIds: ["lead-1", "lead-2"] });
  });

  it("resolves SAVED_VIEW audience for the Opportunity module using the opportunity tab", async () => {
    state.savedView = { config: { tabs: [{ module: "OPPORTUNITIES", filters: { logic: "AND", conditions: [] } }] } };
    state.opportunitiesResult = { data: [{ id: "opp-1" }, { id: "opp-2" }], meta: { total: 2 } };

    const { resolveJourneyAudienceRecordIds } = await import("@/lib/server/marketing-journeys");
    const result = await resolveJourneyAudienceRecordIds(TENANT_USER, "OPPORTUNITY", "SAVED_VIEW", { savedViewId: "view-1" });

    expect(result).toEqual({ total: 2, recordIds: ["opp-1", "opp-2"] });
  });

  it("enrolls only unenrolled audience members, skips duplicates, and records an enrollment attribution touch", async () => {
    const { createJourneyForTenant, transitionJourneyStatus, enrollAudienceIntoJourney } = await import("@/lib/server/marketing-journeys");
    const { enrollRecordsInAutomation } = await import("@/lib/repositories/automations-postgres");
    const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD", audienceType: "LEAD_LIST", audienceConfig: { leadListId: "list-1" } });
    await transitionJourneyStatus(TENANT_USER, journey.id, "APPROVED");
    await transitionJourneyStatus(TENANT_USER, journey.id, "ACTIVE");

    const first = await enrollAudienceIntoJourney(TENANT_USER, journey.id);
    expect(first).toEqual({ enrolled: 2, skipped: 0 });
    expect(enrollRecordsInAutomation).toHaveBeenCalledWith(TENANT_USER, "auto-1", "LEAD", ["lead-1", "lead-2"]);
    expect(state.touches.filter((t) => t.channel === "JOURNEY_ENROLLMENT")).toHaveLength(2);

    const second = await enrollAudienceIntoJourney(TENANT_USER, journey.id);
    expect(second).toEqual({ enrolled: 0, skipped: 2 });
  });

  it("lets a higher-priority journey win an enrollment collision, exiting the lower-priority enrollment, and blocks the reverse", async () => {
    const { createJourneyForTenant, transitionJourneyStatus, enrollAudienceIntoJourney, listEnrollmentsForJourney } = await import(
      "@/lib/server/marketing-journeys"
    );
    const journeyA = await createJourneyForTenant(TENANT_USER, {
      name: "Low priority", targetModule: "LEAD", audienceType: "LEAD_LIST", audienceConfig: { leadListId: "list-1" }, priority: 0,
    });
    const journeyB = await createJourneyForTenant(TENANT_USER, {
      name: "High priority", targetModule: "LEAD", audienceType: "LEAD_LIST", audienceConfig: { leadListId: "list-1" }, priority: 5,
    });
    for (const journey of [journeyA, journeyB]) {
      await transitionJourneyStatus(TENANT_USER, journey.id, "APPROVED");
      await transitionJourneyStatus(TENANT_USER, journey.id, "ACTIVE");
    }

    const firstEnroll = await enrollAudienceIntoJourney(TENANT_USER, journeyA.id);
    expect(firstEnroll).toEqual({ enrolled: 2, skipped: 0 });

    const secondEnroll = await enrollAudienceIntoJourney(TENANT_USER, journeyB.id);
    expect(secondEnroll).toEqual({ enrolled: 2, skipped: 0 });
    const journeyAEnrollments = await listEnrollmentsForJourney(TENANT_USER, journeyA.id);
    expect(journeyAEnrollments.every((e: any) => e.status === "EXITED" && e.exitReason === "JOURNEY_PRIORITY_COLLISION")).toBe(true);

    // journeyA can no longer win the same records back -- it's outranked by journeyB, which
    // now holds the only ACTIVE enrollment for them.
    const thirdEnroll = await enrollAudienceIntoJourney(TENANT_USER, journeyA.id);
    expect(thirdEnroll).toEqual({ enrolled: 0, skipped: 2 });
  });

  it("rejects enrolling audience into a journey that isn't ACTIVE", async () => {
    const { createJourneyForTenant, enrollAudienceIntoJourney } = await import("@/lib/server/marketing-journeys");
    const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD" });
    await expect(enrollAudienceIntoJourney(TENANT_USER, journey.id)).rejects.toThrow("MARKETING_JOURNEY_NOT_ACTIVE");
  });

  it("credits first-touch attribution to the earliest source when a conversion touch exists", async () => {
    const { recordAttributionTouch, getAttributionSummaryForTenant } = await import("@/lib/server/marketing-journeys");
    await recordAttributionTouch(TENANT_USER, { recordType: "LEAD", recordId: "lead-9", source: "google", channel: "WEBSITE_VISIT" });
    await recordAttributionTouch(TENANT_USER, { recordType: "LEAD", recordId: "lead-9", source: "newsletter", channel: "FORM_SUBMISSION" });
    await recordAttributionTouch(TENANT_USER, { recordType: "LEAD", recordId: "lead-9", channel: "OTHER", touchType: "CONVERSION" });

    const summary = await getAttributionSummaryForTenant(TENANT_USER, "FIRST_TOUCH");
    expect(summary.bySource).toEqual([{ source: "google", conversions: 1, credit: 1 }]);
  });

  describe("attribution explorer (gap checklist Module 17, item 13)", () => {
    it("assembles touch paths, flags assisted conversions, and computes revenue/ROI", async () => {
      const { recordAttributionTouch, getAttributionExplorerForTenant } = await import("@/lib/server/marketing-journeys");
      // Two-touch (assisted) conversion on a won Opportunity.
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-1", source: "google", channel: "WEBSITE_VISIT", journeyId: "journey-1" });
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-1", source: "newsletter", channel: "FORM_SUBMISSION" });
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-1", channel: "OTHER", touchType: "CONVERSION" });
      // Single-touch (not assisted) conversion on a lost Opportunity -- contributes credit/
      // touch-path but zero revenue.
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-2", source: "google", channel: "WEBSITE_VISIT", journeyId: "journey-1" });
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-2", channel: "OTHER", touchType: "CONVERSION" });

      state.opportunities = [
        { tenantId: "tenant-1", id: "opp-1", amount: 1000, isWon: true },
        { tenantId: "tenant-1", id: "opp-2", amount: 500, isWon: false },
      ];
      state.costEntries = [{ tenantId: "tenant-1", scopeId: "journey-1", costType: "ACTUAL_SPEND", amount: 100 }];

      const result = await getAttributionExplorerForTenant(TENANT_USER, "LINEAR");

      expect(result.totalConversions).toBe(2);
      expect(result.assistedConversions).toBe(1);
      expect(result.totalRevenue).toBe(1000);
      expect(result.touchPaths).toHaveLength(2);
      const assistedPath = result.touchPaths.find((p: any) => p.recordId === "opp-1");
      expect(assistedPath).toMatchObject({ isAssisted: true, revenue: 1000 });
      expect(assistedPath!.touches.map((t: any) => t.source)).toEqual(["google", "newsletter"]);
      // LINEAR splits opp-1's 1000 revenue 50/50 across its 2 touches; opp-2 is single-touch
      // (100% to google) but contributes 0 revenue (its Opportunity is lost).
      const google = result.bySource.find((s: any) => s.source === "google");
      expect(google).toMatchObject({ credit: 1.5, revenue: 500 });
      // journey-1 got half of opp-1's revenue (500) via the google touch (opp-2's google touch
      // also links to journey-1 but contributes 0, since opp-2 is lost), at $100 actual spend
      // logged against that journey -- ROI = (500 - 100) / 100 = 4.
      const journey = result.byJourney.find((j: any) => j.journeyId === "journey-1");
      expect(journey).toMatchObject({ revenue: 500, costBasis: 100, roi: 4 });
    });

    it("labels every touch in a converting Opportunity's path with its resolved partner (via CommissionLedger), falling back to 'No Partner'", async () => {
      const { recordAttributionTouch, getAttributionExplorerForTenant } = await import("@/lib/server/marketing-journeys");
      // opp-1 has a commission entry (a real partner) and opp-2 does not.
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-1", source: "google", channel: "WEBSITE_VISIT" });
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-1", channel: "OTHER", touchType: "CONVERSION" });
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-2", source: "referral", channel: "WEBSITE_VISIT" });
      await recordAttributionTouch(TENANT_USER, { recordType: "OPPORTUNITY", recordId: "opp-2", channel: "OTHER", touchType: "CONVERSION" });

      state.opportunities = [
        { tenantId: "tenant-1", id: "opp-1", amount: 1000, isWon: true },
        { tenantId: "tenant-1", id: "opp-2", amount: 800, isWon: true },
      ];
      state.commissionLedgerRows = [{ tenantId: "tenant-1", opportunityId: "opp-1", partnerId: "user-partner-1", createdAt: "2026-01-01T00:00:00.000Z" }];
      state.users = [{ id: "user-partner-1", name: "Acme Partners", email: "partners@acme.com" }];

      const result = await getAttributionExplorerForTenant(TENANT_USER, "LINEAR");

      const opp1Path = result.touchPaths.find((p: any) => p.recordId === "opp-1");
      const opp2Path = result.touchPaths.find((p: any) => p.recordId === "opp-2");
      expect(opp1Path).toMatchObject({ partner: "Acme Partners" });
      expect(opp2Path).toMatchObject({ partner: "No Partner" });

      const acmeCredit = result.byPartner.find((p: any) => p.partner === "Acme Partners");
      const noPartnerCredit = result.byPartner.find((p: any) => p.partner === "No Partner");
      expect(acmeCredit).toMatchObject({ conversions: 1, revenue: 1000 });
      expect(noPartnerCredit).toMatchObject({ conversions: 1, revenue: 800 });
    });
  });

  describe("attribution models (gap checklist Module 8, item 13)", () => {
    async function seedTwoTouchConversion() {
      const { recordAttributionTouch } = await import("@/lib/server/marketing-journeys");
      await recordAttributionTouch(TENANT_USER, { recordType: "LEAD", recordId: "lead-multi", source: "google", channel: "WEBSITE_VISIT" });
      await recordAttributionTouch(TENANT_USER, { recordType: "LEAD", recordId: "lead-multi", source: "newsletter", channel: "FORM_SUBMISSION" });
      await recordAttributionTouch(TENANT_USER, { recordType: "LEAD", recordId: "lead-multi", channel: "OTHER", touchType: "CONVERSION" });
    }

    it("splits credit evenly across all touches for LINEAR", async () => {
      await seedTwoTouchConversion();
      const { getAttributionSummaryForTenant } = await import("@/lib/server/marketing-journeys");
      const summary = await getAttributionSummaryForTenant(TENANT_USER, "LINEAR");
      expect(summary.bySource.sort((a: any, b: any) => a.source.localeCompare(b.source))).toEqual([
        { source: "google", conversions: 1, credit: 0.5 },
        { source: "newsletter", conversions: 1, credit: 0.5 },
      ]);
    });

    it("gives full credit to the last touch for LAST_TOUCH", async () => {
      await seedTwoTouchConversion();
      const { getAttributionSummaryForTenant } = await import("@/lib/server/marketing-journeys");
      const summary = await getAttributionSummaryForTenant(TENANT_USER, "LAST_TOUCH");
      expect(summary.bySource).toEqual([{ source: "newsletter", conversions: 1, credit: 1 }]);
    });

    it("ignores records with no conversion touch and records with no sourced touches", async () => {
      const { recordAttributionTouch, getAttributionSummaryForTenant } = await import("@/lib/server/marketing-journeys");
      await recordAttributionTouch(TENANT_USER, { recordType: "LEAD", recordId: "lead-no-conversion", source: "google", channel: "WEBSITE_VISIT" });
      const summary = await getAttributionSummaryForTenant(TENANT_USER, "LINEAR");
      expect(summary.bySource).toEqual([]);
    });
  });

  it("sets and updates a preference for a record", async () => {
    const { setPreferenceForRecord, getPreferencesForRecord } = await import("@/lib/server/marketing-journeys");
    await setPreferenceForRecord("tenant-1", "LEAD", "lead-1", "GENERAL", false, "UNSUBSCRIBE_LINK");
    const prefs = await getPreferencesForRecord(TENANT_USER, "LEAD", "lead-1");
    expect(prefs).toHaveLength(1);
    expect(prefs[0]).toMatchObject({ topic: "GENERAL", isOptedIn: false });
  });

  describe("journey simulation (gap checklist Module 8, item 18)", () => {
    it("runs a TEST-mode execution per sampled record without persisting anything, and reports blocked sends/overlap", async () => {
      const { createJourneyForTenant, enrollAudienceIntoJourney, transitionJourneyStatus, simulateJourneyAudience } = await import(
        "@/lib/server/marketing-journeys"
      );
      const { executeAutomationWorkflow } = await import("@/lib/repositories/automations-postgres");
      state.automations.get("auto-1").workflow = {
        nodes: [{ id: "n1", data: { type: "send_email", channel: "EMAIL", subject: "Hi {{firstName}}", message: "Welcome {{firstName}}" } }],
        edges: [],
      };
      const journeyA = await createJourneyForTenant(TENANT_USER, { name: "A", targetModule: "LEAD", audienceType: "LEAD_LIST", audienceConfig: { leadListId: "list-1" } });
      await transitionJourneyStatus(TENANT_USER, journeyA.id, "APPROVED");
      await transitionJourneyStatus(TENANT_USER, journeyA.id, "ACTIVE");
      await enrollAudienceIntoJourney(TENANT_USER, journeyA.id);

      const journeyB = await createJourneyForTenant(TENANT_USER, { name: "B", targetModule: "LEAD", audienceType: "LEAD_LIST", audienceConfig: { leadListId: "list-1" }, priority: 1 });

      const result = await simulateJourneyAudience(TENANT_USER, journeyB.id, { sampleSize: 5 });

      expect(result.sampled).toBe(2);
      expect(result.channelsUsed).toEqual(["EMAIL"]);
      expect(executeAutomationWorkflow).toHaveBeenCalledTimes(2);
      expect(executeAutomationWorkflow).toHaveBeenCalledWith(TENANT_USER, expect.anything(), "LEAD", "lead-1", { id: "lead-1", email: "lead-1@example.com" }, "TEST");
      // Every sampled record is already actively enrolled in journeyA -- simulateJourneyAudience
      // must surface that as overlap without mutating any enrollment itself.
      expect(result.summary.overlapping).toBe(2);
      expect(result.results[0].overlappingJourneyIds).toEqual([journeyA.id]);
      // "firstName" isn't a real field on the loaded test record -- flagged as missing, not
      // silently rendered blank.
      expect(result.results[0].missingTokens).toEqual(["firstName"]);
      // Nothing simulated should touch enrollment state.
      const enrollmentsAfter = state.enrollments.filter((e) => e.journeyId === journeyB.id);
      expect(enrollmentsAfter).toHaveLength(0);
    });
  });

  describe("journey health monitoring (gap checklist Module 8, item 19)", () => {
    it("reports enrollment funnel counts and a HEALTHY status when nothing is failing", async () => {
      const { createJourneyForTenant, transitionJourneyStatus, enrollAudienceIntoJourney, getJourneyHealthForTenant } = await import(
        "@/lib/server/marketing-journeys"
      );
      const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD", audienceType: "LEAD_LIST", audienceConfig: { leadListId: "list-1" } });
      await transitionJourneyStatus(TENANT_USER, journey.id, "APPROVED");
      await transitionJourneyStatus(TENANT_USER, journey.id, "ACTIVE");
      await enrollAudienceIntoJourney(TENANT_USER, journey.id);

      const health = await getJourneyHealthForTenant(TENANT_USER, journey.id);

      expect(health).toMatchObject({ journeyId: journey.id, status: "HEALTHY", enrollment: { byStatus: { ACTIVE: 2 } } });
    });

    it("returns null for a journey that doesn't exist", async () => {
      const { getJourneyHealthForTenant } = await import("@/lib/server/marketing-journeys");
      expect(await getJourneyHealthForTenant(TENANT_USER, "missing-journey")).toBeNull();
    });
  });

  describe("journey RBAC (gap checklist Module 8, item 20)", () => {
    it("lets platform admins and tenant admins through regardless of role permissions", async () => {
      const { assertJourneyPermission } = await import("@/lib/server/marketing-journeys");
      expect(() => assertJourneyPermission({ id: "u1", tenantId: "t1", isPlatformAdmin: true }, "approve")).not.toThrow();
      expect(() => assertJourneyPermission({ id: "u2", tenantId: "t1", isTenantAdmin: true }, "overrideSuppression")).not.toThrow();
    });

    it("rejects a user with no journeys permission on their role", async () => {
      const { assertJourneyPermission } = await import("@/lib/server/marketing-journeys");
      const user = { id: "u3", tenantId: "t1", role: { permissions: { modules: {} } } };
      expect(() => assertJourneyPermission(user, "view")).toThrow("FORBIDDEN");
    });

    it("lets a read-only role view but not create/launch", async () => {
      const { assertJourneyPermission } = await import("@/lib/server/marketing-journeys");
      const user = { id: "u4", tenantId: "t1", role: { permissions: { modules: { journeys: { read: true } } } } };
      expect(() => assertJourneyPermission(user, "view")).not.toThrow();
      expect(() => assertJourneyPermission(user, "export")).not.toThrow();
      expect(() => assertJourneyPermission(user, "create")).toThrow("FORBIDDEN");
      expect(() => assertJourneyPermission(user, "launch")).toThrow("FORBIDDEN");
    });

    it("lets a `manage` role perform every action, including governance-weight ones", async () => {
      const { assertJourneyPermission } = await import("@/lib/server/marketing-journeys");
      const user = { id: "u5", tenantId: "t1", role: { permissions: { modules: { journeys: { manage: true } } } } };
      for (const action of ["view", "create", "edit", "approve", "launch", "pause", "export", "overrideSuppression"] as const) {
        expect(() => assertJourneyPermission(user, action)).not.toThrow();
      }
    });

    it("treats module-level \"full\" the same as manage", async () => {
      const { assertJourneyPermission } = await import("@/lib/server/marketing-journeys");
      const user = { id: "u6", tenantId: "t1", role: { permissions: { modules: { journeys: "full" } } } };
      expect(() => assertJourneyPermission(user, "launch")).not.toThrow();
    });
  });

  describe("journey versioning", () => {
    it("publishes a snapshot of the underlying automation's current workflow, incrementing the version number", async () => {
      const { createJourneyForTenant, publishJourneyVersion, listJourneyVersions } = await import("@/lib/server/marketing-journeys");
      const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD" });
      state.automations.get("auto-1").workflow = { nodes: [{ id: "n1" }], edges: [] };

      const updated = await publishJourneyVersion(TENANT_USER, journey.id, "Initial workflow");

      expect(updated).toMatchObject({ currentVersion: 1 });
      const versions = await listJourneyVersions(TENANT_USER, journey.id);
      expect(versions).toEqual([
        expect.objectContaining({ version: 1, publishNotes: "Initial workflow" }),
      ]);
    });

    it("restores an old version by publishing its snapshot as a brand-new version, never rewinding currentVersion", async () => {
      const { createJourneyForTenant, publishJourneyVersion, restoreJourneyVersion, listJourneyVersions } = await import("@/lib/server/marketing-journeys");
      const { updateAutomationForTenant } = await import("@/lib/repositories/automations-postgres");
      const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD" });

      state.automations.get("auto-1").workflow = { nodes: [{ id: "v1-node" }], edges: [] };
      await publishJourneyVersion(TENANT_USER, journey.id, "v1");

      state.automations.get("auto-1").workflow = { nodes: [{ id: "v2-node" }], edges: [] };
      await publishJourneyVersion(TENANT_USER, journey.id, "v2");

      const restored = await restoreJourneyVersion(TENANT_USER, journey.id, 1);

      // A new version 3 is created (not a rewind to version 1) -- the version-1 and
      // version-2 rows must both still exist afterward, since restoring must never
      // collide with or delete prior history.
      expect(restored).toMatchObject({ currentVersion: 3 });
      expect(updateAutomationForTenant).toHaveBeenLastCalledWith(TENANT_USER, "auto-1", { workflow: { nodes: [{ id: "v1-node" }], edges: [] } });
      const versions = await listJourneyVersions(TENANT_USER, journey.id);
      expect(versions.map((v: any) => v.version).sort()).toEqual([1, 2, 3]);
      expect(versions.find((v: any) => v.version === 3)).toMatchObject({ publishNotes: "Restored from version 1" });
    });

    it("rejects restoring a version number that was never published", async () => {
      const { createJourneyForTenant, restoreJourneyVersion } = await import("@/lib/server/marketing-journeys");
      const journey = await createJourneyForTenant(TENANT_USER, { name: "J", targetModule: "LEAD" });

      await expect(restoreJourneyVersion(TENANT_USER, journey.id, 99)).rejects.toThrow("MARKETING_JOURNEY_VERSION_NOT_FOUND");
    });

    it("returns null when restoring a version for a journey that doesn't exist", async () => {
      const { restoreJourneyVersion } = await import("@/lib/server/marketing-journeys");
      expect(await restoreJourneyVersion(TENANT_USER, "missing-journey", 1)).toBeNull();
    });
  });
});
