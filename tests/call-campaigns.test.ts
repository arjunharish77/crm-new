import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
// The audience arrives in batches (forEachJourneyAudienceBatch); `audienceBatches` sets them.
const journeyMocks = vi.hoisted(() => {
  const state = { audienceBatches: [] as string[][] };
  return {
    state,
    forEachJourneyAudienceBatch: vi.fn(async (_user: unknown, _module: unknown, _type: unknown, _config: unknown, onBatch: (ids: string[]) => Promise<void>) => {
      for (const batch of state.audienceBatches) await onBatch(batch);
    }),
  };
});
const leadsRepoMocks = vi.hoisted(() => ({ getLeadForTenant: vi.fn() }));
const opportunitiesRepoMocks = vi.hoisted(() => ({ getOpportunityForTenant: vi.fn() }));
const telephonyWebhookMocks = vi.hoisted(() => ({ checkTelephonyComplianceForCall: vi.fn().mockResolvedValue({ allowed: true }) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/marketing-journeys", () => journeyMocks);
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);
vi.mock("@/lib/repositories/opportunities-postgres", () => opportunitiesRepoMocks);
vi.mock("@/lib/server/telephony-webhook", () => telephonyWebhookMocks);

import {
  listCallCampaignsForTenant,
  createCallCampaignForTenant,
  getCallCampaignForTenant,
  updateCallCampaignForTenant,
  deleteCallCampaignForTenant,
  addAudienceToCallCampaign,
  getCallCampaignProgressForTenant,
  getCallCampaignAnalyticsForTenant,
  getNextCampaignCallForAgent,
  recordCallCampaignAttemptOutcome,
} from "@/lib/server/call-campaigns";

// Telephony business logic under test; the TELEPHONY module gate itself is covered by
// tests/telephony-module-gate.test.ts.
vi.mock("@/lib/server/module-entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/module-entitlements")>()),
  assertTenantModule: vi.fn(async () => undefined),
  assertModuleEnabled: vi.fn(async () => undefined),
}));


const admin = { id: "admin-1", tenantId: "tenant-a", isTenantAdmin: true };
const rep = { id: "rep-1", tenantId: "tenant-a" };

describe("call campaigns", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    journeyMocks.state.audienceBatches = [];
    leadsRepoMocks.getLeadForTenant.mockReset();
    opportunitiesRepoMocks.getOpportunityForTenant.mockReset();
    telephonyWebhookMocks.checkTelephonyComplianceForCall.mockReset().mockResolvedValue({ allowed: true });
  });

  describe("listCallCampaignsForTenant", () => {
    it("attaches per-status member counts to each campaign", async () => {
      dbMocks.query
        .mockResolvedValueOnce([{ id: "camp-1", name: "Q1 Outreach" }])
        .mockResolvedValueOnce([
          { campaignId: "camp-1", status: "PENDING", count: 5 },
          { campaignId: "camp-1", status: "COMPLETED", count: 2 },
        ]);

      const result = await listCallCampaignsForTenant(admin);

      expect(result[0].memberCounts).toEqual({ PENDING: 5, COMPLETED: 2 });
    });
  });

  describe("createCallCampaignForTenant", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(createCallCampaignForTenant(rep, { name: "Campaign" })).rejects.toThrow("FORBIDDEN");
    });

    it("throws NAME_REQUIRED when the name is blank", async () => {
      await expect(createCallCampaignForTenant(admin, { name: "  " })).rejects.toThrow("NAME_REQUIRED");
    });

    it("creates a campaign with default retry/callback policy", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "camp-1", name: "Campaign", status: "DRAFT" });
      const row = await createCallCampaignForTenant(admin, { name: "Campaign" });
      expect(row.id).toBe("camp-1");
      const insertParams = dbMocks.queryOne.mock.calls[0][1];
      expect(insertParams).toContain("LEAD"); // default module
    });
  });

  describe("getCallCampaignForTenant", () => {
    it("throws CALL_CAMPAIGN_NOT_FOUND", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(getCallCampaignForTenant(admin, "camp-1")).rejects.toThrow("CALL_CAMPAIGN_NOT_FOUND");
    });
  });

  describe("updateCallCampaignForTenant", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(updateCallCampaignForTenant(rep, "camp-1", { name: "New" })).rejects.toThrow("FORBIDDEN");
    });

    it("throws CALL_CAMPAIGN_NOT_FOUND", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(updateCallCampaignForTenant(admin, "camp-1", { name: "New" })).rejects.toThrow("CALL_CAMPAIGN_NOT_FOUND");
    });

    it("throws INVALID_STATUS for a bad status value", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "camp-1", name: "Old", status: "DRAFT" });
      await expect(updateCallCampaignForTenant(admin, "camp-1", { status: "BOGUS" })).rejects.toThrow("INVALID_STATUS");
    });

    it("preserves fields not included in a partial patch", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({
          id: "camp-1",
          name: "Old Name",
          description: "Old desc",
          callScriptId: "script-1",
          dispositionGroupId: "group-1",
          assignedTeamId: "team-1",
          retryPolicy: { maxAttempts: 5, retryDelayMinutes: 30 },
          callbackPolicy: { pauseUntilCallback: true },
          status: "DRAFT",
        })
        .mockResolvedValueOnce({ id: "camp-1", status: "ACTIVE" });

      await updateCallCampaignForTenant(admin, "camp-1", { status: "ACTIVE" });

      const updateParams = dbMocks.queryOne.mock.calls[1][1];
      expect(updateParams[0]).toBe("Old Name");
      expect(updateParams[2]).toBe("script-1");
      expect(updateParams[7]).toBe("ACTIVE");
    });
  });

  describe("deleteCallCampaignForTenant", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(deleteCallCampaignForTenant(rep, "camp-1")).rejects.toThrow("FORBIDDEN");
    });
  });

  describe("addAudienceToCallCampaign", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(addAudienceToCallCampaign(rep, "camp-1")).rejects.toThrow("FORBIDDEN");
    });

    it("throws CALL_CAMPAIGN_NOT_FOUND", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(addAudienceToCallCampaign(admin, "camp-1")).rejects.toThrow("CALL_CAMPAIGN_NOT_FOUND");
    });

    it("resolves the audience and inserts members, counting only new inserts", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "camp-1", module: "LEAD", audienceType: "MANUAL", audienceConfig: {} });
      // Two batches; one insert per batch, which reports how many were new (one already a member).
      journeyMocks.state.audienceBatches = [["lead-1", "lead-2"], ["lead-3"]];
      dbMocks.execute.mockReset().mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const result = await addAudienceToCallCampaign(admin, "camp-1");

      expect(result).toEqual({ requested: 3, added: 2 });
      expect(dbMocks.execute).toHaveBeenCalledTimes(2);
      expect(dbMocks.execute.mock.calls[0][1]).toContainEqual(["lead-1", "lead-2"]);
    });

    it("inserts into the opportunityId column for an OPPORTUNITY-module campaign", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "camp-1", module: "OPPORTUNITY", audienceType: "MANUAL", audienceConfig: {} });
      journeyMocks.state.audienceBatches = [["opp-1"]];

      await addAudienceToCallCampaign(admin, "camp-1");

      const insertSql = String(dbMocks.execute.mock.calls[0][0]);
      expect(insertSql).toContain('"opportunityId"');
    });
  });

  describe("getCallCampaignProgressForTenant", () => {
    it("aggregates total and named status buckets", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { status: "PENDING", count: 4 },
        { status: "COMPLETED", count: 3 },
        { status: "EXHAUSTED", count: 1 },
        { status: "DO_NOT_CALL", count: 2 },
      ]);

      const progress = await getCallCampaignProgressForTenant(admin, "camp-1");

      expect(progress.total).toBe(10);
      expect(progress.completed).toBe(3);
      expect(progress.exhausted).toBe(1);
      expect(progress.doNotCall).toBe(2);
    });
  });

  describe("getCallCampaignAnalyticsForTenant", () => {
    it("throws CALL_CAMPAIGN_NOT_FOUND", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(getCallCampaignAnalyticsForTenant(admin, "camp-1")).rejects.toThrow("CALL_CAMPAIGN_NOT_FOUND");
    });

    it("computes contact rate and average attempts", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ createdAt: "2026-01-01T00:00:00.000Z" })
        .mockResolvedValueOnce({ avgAttempts: "1.5", totalAttempts: "6" });
      dbMocks.query
        .mockResolvedValueOnce([
          { status: "COMPLETED", count: 3 },
          { status: "PENDING", count: 1 },
        ])
        .mockResolvedValueOnce([{ outcomeName: "Interested", count: 3 }]);

      const analytics = await getCallCampaignAnalyticsForTenant(admin, "camp-1");

      expect(analytics.contactRate).toBe(75);
      expect(analytics.avgAttempts).toBe(1.5);
      expect(analytics.dispositionBreakdown).toEqual([{ outcomeName: "Interested", count: 3 }]);
    });
  });

  describe("getNextCampaignCallForAgent", () => {
    it("throws CALL_CAMPAIGN_NOT_FOUND", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(getNextCampaignCallForAgent(rep, "camp-1")).rejects.toThrow("CALL_CAMPAIGN_NOT_FOUND");
    });

    it("throws CAMPAIGN_NOT_ACTIVE when the campaign isn't ACTIVE", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "camp-1", status: "DRAFT", retryPolicy: {} });
      await expect(getNextCampaignCallForAgent(rep, "camp-1")).rejects.toThrow("CAMPAIGN_NOT_ACTIVE");
    });

    it("throws FORBIDDEN when the caller isn't on the assigned team", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "camp-1", status: "ACTIVE", assignedTeamId: "team-1", retryPolicy: {} })
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: null })
        .mockResolvedValueOnce({ teamId: "other-team" });

      await expect(getNextCampaignCallForAgent(rep, "camp-1")).rejects.toThrow("FORBIDDEN");
    });

    it("returns null when there is nothing left to claim", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "camp-1", status: "ACTIVE", assignedTeamId: null, retryPolicy: { maxAttempts: 3, retryDelayMinutes: 60 } })
        .mockResolvedValueOnce(null); // atomic claim finds no candidate

      const result = await getNextCampaignCallForAgent(rep, "camp-1");
      expect(result).toBeNull();
    });

    it("returns the claimed member and its Lead record when compliant", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "camp-1", status: "ACTIVE", assignedTeamId: null, retryPolicy: { maxAttempts: 3, retryDelayMinutes: 60 } })
        .mockResolvedValueOnce({ id: "member-1", leadId: "lead-1", opportunityId: null, attempts: 1 });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", phone: "555-1111" });

      const result = await getNextCampaignCallForAgent(rep, "camp-1");

      expect(result?.member.id).toBe("member-1");
      expect(result?.record.phone).toBe("555-1111");
    });

    it("marks a member EXHAUSTED and moves to the next candidate once attempts exceed maxAttempts", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "camp-1", status: "ACTIVE", assignedTeamId: null, retryPolicy: { maxAttempts: 1, retryDelayMinutes: 60 } })
        .mockResolvedValueOnce({ id: "member-1", leadId: "lead-1", opportunityId: null, attempts: 2 }) // exceeds maxAttempts=1
        .mockResolvedValueOnce(null); // no further candidates

      const result = await getNextCampaignCallForAgent(rep, "camp-1");

      expect(result).toBeNull();
      expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("EXHAUSTED"), expect.arrayContaining(["member-1"]));
    });

    it("marks a member DO_NOT_CALL and skips it when compliance blocks the number", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "camp-1", status: "ACTIVE", assignedTeamId: null, retryPolicy: { maxAttempts: 3, retryDelayMinutes: 60 } })
        .mockResolvedValueOnce({ id: "member-1", leadId: "lead-1", opportunityId: null, attempts: 1 })
        .mockResolvedValueOnce(null);
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", phone: "555-1111" });
      telephonyWebhookMocks.checkTelephonyComplianceForCall.mockResolvedValueOnce({ allowed: false, reason: "SUPPRESSED" });

      const result = await getNextCampaignCallForAgent(rep, "camp-1");

      expect(result).toBeNull();
      expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("DO_NOT_CALL"), expect.arrayContaining(["member-1"]));
    });
  });

  describe("recordCallCampaignAttemptOutcome", () => {
    it("sets status to CALLBACK_SCHEDULED when a callback time is given", async () => {
      await recordCallCampaignAttemptOutcome(admin, "member-1", { callbackAt: "2026-06-01T00:00:00.000Z", disposed: true });
      const params = dbMocks.execute.mock.calls[0][1];
      expect(params[0]).toBe("CALLBACK_SCHEDULED");
      expect(params[1]).toBe("2026-06-01T00:00:00.000Z");
    });

    it("sets status to COMPLETED when no callback time is given", async () => {
      await recordCallCampaignAttemptOutcome(admin, "member-1", { disposed: true });
      const params = dbMocks.execute.mock.calls[0][1];
      expect(params[0]).toBe("COMPLETED");
      expect(params[1]).toBeNull();
    });
  });
});
