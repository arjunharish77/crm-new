import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn(), jsonbParam: (v: unknown) => v }));
const leadsRepoMocks = vi.hoisted(() => ({ getLeadForTenant: vi.fn() }));
const opportunitiesRepoMocks = vi.hoisted(() => ({ getOpportunityForTenant: vi.fn() }));
const nbaMocks = vi.hoisted(() => ({ listRecommendationsForRecord: vi.fn().mockResolvedValue([]) }));

vi.mock("@/lib/db/query", () => dbMocks);
// Real automationConditionMatches/valueAtPath (pure, no DB) so matching tests are meaningful --
// only createAuditLog is stubbed, same pattern tests/next-best-action.test.ts already uses.
vi.mock("@/lib/server/crm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/crm")>();
  return { ...actual, createAuditLog: vi.fn(async () => null) };
});
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);
vi.mock("@/lib/repositories/opportunities-postgres", () => opportunitiesRepoMocks);
vi.mock("@/lib/server/next-best-action", () => nbaMocks);

import {
  createCallScriptForTenant,
  updateCallScriptForTenant,
  deleteCallScriptForTenant,
  listCallScriptVersionsForTenant,
  getBestCallScriptForRecord,
} from "@/lib/server/call-scripts";

const admin = { id: "admin-1", tenantId: "tenant-a", isTenantAdmin: true };
const rep = { id: "rep-1", tenantId: "tenant-a" };

describe("call scripts and guidance", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    leadsRepoMocks.getLeadForTenant.mockReset();
    opportunitiesRepoMocks.getOpportunityForTenant.mockReset();
    nbaMocks.listRecommendationsForRecord.mockReset().mockResolvedValue([]);
  });

  describe("createCallScriptForTenant", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(createCallScriptForTenant(rep, { name: "Script" })).rejects.toThrow("FORBIDDEN");
    });

    it("throws NAME_REQUIRED when the name is blank", async () => {
      await expect(createCallScriptForTenant(admin, { name: "   " })).rejects.toThrow("NAME_REQUIRED");
    });

    it("creates a script scoped to the tenant with version 1", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "script-1", name: "Script", version: 1 });
      const row = await createCallScriptForTenant(admin, { name: "Script" });
      expect(row.id).toBe("script-1");
      expect(dbMocks.queryOne.mock.calls[0][1][1]).toBe("tenant-a");
    });
  });

  describe("updateCallScriptForTenant", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(updateCallScriptForTenant(rep, "script-1", { name: "New" })).rejects.toThrow("FORBIDDEN");
    });

    it("throws CALL_SCRIPT_NOT_FOUND when the script doesn't exist for this tenant", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(updateCallScriptForTenant(admin, "script-1", { name: "New" })).rejects.toThrow("CALL_SCRIPT_NOT_FOUND");
    });

    it("snapshots the pre-update state into CallScriptVersion before applying the update", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "script-1", name: "Old Name", content: "Old content", objectionHandling: [], complianceLines: [], matchConditions: {}, version: 1 })
        .mockResolvedValueOnce({ id: "script-1", name: "New Name", version: 2 });

      await updateCallScriptForTenant(admin, "script-1", { name: "New Name" });

      const versionInsertSql = String(dbMocks.execute.mock.calls[0][0]);
      expect(versionInsertSql).toContain('insert into "CallScriptVersion"');
      const versionInsertParams = dbMocks.execute.mock.calls[0][1];
      expect(versionInsertParams[4]).toBe("Old Name");
      expect(versionInsertParams[3]).toBe(1);
    });

    it("increments the version number on every update", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "script-1", name: "Old", content: "", objectionHandling: [], complianceLines: [], matchConditions: {}, version: 3 })
        .mockResolvedValueOnce({ id: "script-1", name: "Old", version: 4 });

      await updateCallScriptForTenant(admin, "script-1", { content: "Updated" });

      const updateSql = String(dbMocks.queryOne.mock.calls[1][0]);
      expect(updateSql).toContain("version = version + 1");
    });
  });

  describe("deleteCallScriptForTenant", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(deleteCallScriptForTenant(rep, "script-1")).rejects.toThrow("FORBIDDEN");
    });
  });

  describe("listCallScriptVersionsForTenant", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(listCallScriptVersionsForTenant(rep, "script-1")).rejects.toThrow("FORBIDDEN");
    });

    it("scopes the query to the tenant and script", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "v1", version: 1 }]);
      const versions = await listCallScriptVersionsForTenant(admin, "script-1");
      expect(versions).toHaveLength(1);
      expect(dbMocks.query.mock.calls[0][1]).toEqual(["tenant-a", "script-1"]);
    });
  });

  describe("getBestCallScriptForRecord", () => {
    it("throws RECORD_NOT_FOUND when the record isn't accessible", async () => {
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce(null);
      await expect(getBestCallScriptForRecord(rep, "LEAD", "lead-1")).rejects.toThrow("RECORD_NOT_FOUND");
    });

    it("picks the more specific matching script over a catch-all fallback", async () => {
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", source: "Website", predictiveScore: { scoreBand: "HOT" } });
      dbMocks.query.mockResolvedValueOnce([
        { id: "fallback", name: "Fallback", matchConditions: { conditions: [], conditionLogic: "AND" } },
        {
          id: "specific",
          name: "Hot Website Leads",
          matchConditions: { conditions: [{ field: "source", operator: "equals", value: "Website" }, { field: "predictiveScore.scoreBand", operator: "equals", value: "HOT" }], conditionLogic: "AND" },
        },
      ]);

      const result = await getBestCallScriptForRecord(rep, "LEAD", "lead-1");

      expect(result.script.id).toBe("specific");
    });

    it("falls back to the catch-all script when no specific script matches", async () => {
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", source: "Referral", predictiveScore: { scoreBand: "COLD" } });
      dbMocks.query.mockResolvedValueOnce([
        { id: "fallback", name: "Fallback", matchConditions: { conditions: [], conditionLogic: "AND" } },
        {
          id: "specific",
          name: "Hot Website Leads",
          matchConditions: { conditions: [{ field: "source", operator: "equals", value: "Website" }], conditionLogic: "AND" },
        },
      ]);

      const result = await getBestCallScriptForRecord(rep, "LEAD", "lead-1");

      expect(result.script.id).toBe("fallback");
    });

    it("returns null script when nothing matches and there's no catch-all", async () => {
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1", source: "Referral" });
      dbMocks.query.mockResolvedValueOnce([
        { id: "specific", name: "Website Only", matchConditions: { conditions: [{ field: "source", operator: "equals", value: "Website" }], conditionLogic: "AND" } },
      ]);

      const result = await getBestCallScriptForRecord(rep, "LEAD", "lead-1");

      expect(result.script).toBeNull();
    });

    it("includes up to 3 NBA hints for the record", async () => {
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1" });
      dbMocks.query.mockResolvedValueOnce([]);
      nbaMocks.listRecommendationsForRecord.mockResolvedValueOnce([
        { id: "rec-1", reason: "A" },
        { id: "rec-2", reason: "B" },
        { id: "rec-3", reason: "C" },
        { id: "rec-4", reason: "D" },
      ]);

      const result = await getBestCallScriptForRecord(rep, "LEAD", "lead-1");

      expect(result.nbaHints).toHaveLength(3);
    });

    it("looks up an Opportunity record when recordType is OPPORTUNITY", async () => {
      opportunitiesRepoMocks.getOpportunityForTenant.mockResolvedValueOnce({ id: "opp-1", stageId: "stage-1" });
      dbMocks.query.mockResolvedValueOnce([]);

      await getBestCallScriptForRecord(rep, "OPPORTUNITY", "opp-1");

      expect(opportunitiesRepoMocks.getOpportunityForTenant).toHaveBeenCalledWith(rep, "opp-1");
      expect(leadsRepoMocks.getLeadForTenant).not.toHaveBeenCalled();
    });
  });
});
