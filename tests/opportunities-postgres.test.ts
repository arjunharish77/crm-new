import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

// Stashed so a test can inspect exactly what was run inside the transaction (e.g. the
// OpportunityStageHistory insert) -- `withTransaction` builds a fresh `tx` per call, with no
// other way to reach back into it from outside the mock factory below.
let lastTxQueryMock: ReturnType<typeof vi.fn> | null = null;

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_ctx, fn) => {
    const tx = { query: vi.fn().mockResolvedValue({ rows: [{ id: "opp-1", stageId: "stage-new" }] }) };
    lastTxQueryMock = tx.query;
    return fn(tx);
  }),
}));

vi.mock("@/lib/repositories/leads-postgres", () => ({
  listLeadsForTenant: vi.fn(async () => ({ data: [{ id: "lead-1", name: "Alpha Lead" }] })),
}));

describe("direct Postgres opportunities repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists opportunities with tenant/type scope and whitelisted filters", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "opp-1", leadId: "lead-1", opportunityTypeId: "type-1", stageId: "stage-1", title: "MBA App" }])
      .mockResolvedValueOnce([{ id: "type-1", name: "University 1" }])
      .mockResolvedValueOnce([{ id: "stage-1", opportunityTypeId: "type-1", name: "Application", order: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { listOpportunitiesForTenantByType } = await import("@/lib/repositories/opportunities-postgres");
    const result = await listOpportunitiesForTenantByType(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      20,
      "type-1",
      [
        { field: "title", operator: "contains", value: "MBA" },
        { field: "title; drop table Opportunity", operator: "equals", value: "bad" },
      ],
    );

    expect(result.data).toHaveLength(1);
    expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryMock.mock.calls[0][0]).toContain('"opportunityTypeId" = $2');
    expect(queryMock.mock.calls[0][0]).toContain('"title" ilike $3');
    expect(queryMock.mock.calls[0][0]).not.toContain("drop table");
    expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "type-1", "%MBA%", 20, 0]);
  });

  it("short-circuits when predictive score filters match no opportunities", async () => {
    queryMock.mockResolvedValueOnce([]);

    const { listOpportunitiesForTenantByType } = await import("@/lib/repositories/opportunities-postgres");
    const result = await listOpportunitiesForTenantByType(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      10,
      null,
      [{ field: "predictiveScoreBand", operator: "equals", value: "HOT" }],
    );

    expect(result).toEqual({ data: [], meta: { total: 0, page: 1, last_page: 1, limit: 10 } });
  });

  it("enriches listed opportunities with a bulk pending-next-best-action count", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "Opportunity"')) return [{ id: "opp-1", leadId: "lead-1", opportunityTypeId: "type-1", stageId: "stage-1", title: "MBA App" }];
      if (text.includes('from "OpportunityType"')) return [{ id: "type-1", name: "University 1" }];
      if (text.includes('from "StageDefinition"')) return [{ id: "stage-1", opportunityTypeId: "type-1", name: "Application", order: 1 }];
      if (text.includes('from "RecordScore"')) return [];
      if (text.includes('from "NextBestActionRecommendation"')) return [{ recordId: "opp-1", count: 2 }];
      return [];
    });

    const { listOpportunitiesForTenantByType } = await import("@/lib/repositories/opportunities-postgres");
    const result = await listOpportunitiesForTenantByType(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      20,
      "type-1",
    );

    expect(result.data[0].pendingNbaCount).toBe(2);
    const nbaCall = queryMock.mock.calls.find((call) => String(call[0]).includes('from "NextBestActionRecommendation"'));
    expect(nbaCall![0]).toContain("'OPPORTUNITY'");
  });

  describe("entitlement gating", () => {
    it("rejects creating an opportunity when the Opportunities module is disabled for the tenant", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "TenantFeature"')) return { opportunityEnabled: false };
        return null;
      });

      const { createOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
      await expect(
        createOpportunityForTenant({ id: "user-1", tenantId: "tenant-1" }, { title: "New Deal", leadId: "lead-1", opportunityTypeId: "type-1" }),
      ).rejects.toThrow("FEATURE_DISABLED");
    });

    it("rejects updating an opportunity when the Opportunities module is disabled for the tenant", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "TenantFeature"')) return { opportunityEnabled: false };
        return null;
      });

      const { updateOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
      await expect(
        updateOpportunityForTenant({ id: "user-1", tenantId: "tenant-1" }, "opp-1", { title: "Renamed" }),
      ).rejects.toThrow("FEATURE_DISABLED");
    });

    it("rejects deleting an opportunity when the Opportunities module is disabled for the tenant", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "TenantFeature"')) return { opportunityEnabled: false };
        return null;
      });

      const { deleteOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
      await expect(
        deleteOpportunityForTenant({ id: "user-1", tenantId: "tenant-1" }, "opp-1"),
      ).rejects.toThrow("FEATURE_DISABLED");
    });

    it("allows a platform admin to bypass the Opportunities gate", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "TenantFeature"')) return { opportunityEnabled: false };
        return null;
      });
      executeMock.mockResolvedValue(1);

      const { deleteOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
      await expect(
        deleteOpportunityForTenant({ id: "admin-1", tenantId: "tenant-1", isPlatformAdmin: true }, "opp-1"),
      ).resolves.toBeUndefined();
    });
  });

  describe("getOpportunityStageCountsForTenant (gap checklist Module 17, item 25 -- view-level count chips)", () => {
    it("groups by stageId, scoped to the tenant, and resolves stage names/order via a separate small lookup", async () => {
      queryMock
        .mockResolvedValueOnce([
          { stageId: "stage-1", count: 3 },
          { stageId: "stage-2", count: 1 },
          { stageId: null, count: 2 },
        ])
        .mockResolvedValueOnce([
          { id: "stage-2", name: "Won", order: 2 },
          { id: "stage-1", name: "New", order: 1 },
        ]);

      const { getOpportunityStageCountsForTenant } = await import("@/lib/repositories/opportunities-postgres");
      const result = await getOpportunityStageCountsForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      // Sorted by stage order -- the null-stageId ("Unassigned") bucket sorts last, since it
      // has no order to sort by.
      expect(result).toEqual([
        { stageId: "stage-1", stageName: "New", count: 3 },
        { stageId: "stage-2", stageName: "Won", count: 1 },
        { stageId: null, stageName: "Unassigned", count: 2 },
      ]);
      expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
      expect(queryMock.mock.calls[0][0]).toContain('group by "stageId"');
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1"]);
      expect(queryMock.mock.calls[1][0]).toContain('from "OpportunityStage"');
    });

    it("skips the stage-name lookup entirely when there are no stage-scoped counts", async () => {
      queryMock.mockResolvedValueOnce([{ stageId: null, count: 5 }]);

      const { getOpportunityStageCountsForTenant } = await import("@/lib/repositories/opportunities-postgres");
      const result = await getOpportunityStageCountsForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      expect(result).toEqual([{ stageId: null, stageName: "Unassigned", count: 5 }]);
      expect(queryMock).toHaveBeenCalledTimes(1);
    });
  });
});

// Gap checklist Module 10's tests bullet -- "inline edit audit logs" (Opportunities' inline
// stage-change calls this same updateOpportunityForTenant path).
describe("updateOpportunityForTenant audit logging and stage history", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    lastTxQueryMock = null;

    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null; // missing row -- enabled by default
      if (text.includes('from "Opportunity"')) {
        return {
          id: "opp-1", tenantId: "tenant-1", leadId: "lead-1", opportunityTypeId: "type-1",
          stageId: "stage-old", title: "Deal", amount: 1000, priority: "MEDIUM", tags: [],
        };
      }
      return null;
    });
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "OpportunityType"')) return [{ id: "type-1", name: "University 1" }];
      if (text.includes('from "StageDefinition"')) {
        return [
          { id: "stage-old", opportunityTypeId: "type-1", name: "Applied", order: 1 },
          { id: "stage-new", opportunityTypeId: "type-1", name: "Admitted", order: 2 },
        ];
      }
      return [];
    });
  });

  it("writes an AuditLog UPDATE entry for the opportunity", async () => {
    const { updateOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    await updateOpportunityForTenant({ id: "user-1", tenantId: "tenant-1" }, "opp-1", { stageId: "stage-new" });

    const auditCall = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "AuditLog"'));
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toContain("'OPPORTUNITY'");
    const values = auditCall![1];
    expect(values[3]).toBe("UPDATE"); // action
    expect(values[4]).toBe("opp-1"); // entityId
  });

  it("inserts an OpportunityStageHistory row when the stage actually changes", async () => {
    const { updateOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    await updateOpportunityForTenant({ id: "user-1", tenantId: "tenant-1" }, "opp-1", { stageId: "stage-new" });

    expect(lastTxQueryMock).not.toBeNull();
    const stageHistoryCall = lastTxQueryMock!.mock.calls.find((call) => String(call[0]).includes('insert into "OpportunityStageHistory"'));
    expect(stageHistoryCall).toBeDefined();
    const values = stageHistoryCall![1];
    expect(values).toEqual(expect.arrayContaining(["tenant-1", "opp-1", "stage-old", "stage-new", "user-1"]));
  });

  it("does not insert an OpportunityStageHistory row when the stage is unchanged", async () => {
    // Override just this test's transaction response to reflect the real outcome of a
    // title-only update -- stageId stays "stage-old" -- unlike the shared default mock above
    // (fixed at "stage-new" for the stage-change tests).
    const { withTransaction } = await import("@/lib/db/transaction");
    (vi.mocked(withTransaction) as any).mockImplementationOnce(async (_ctx: unknown, fn: (tx: any) => Promise<unknown>) => {
      const tx = { query: vi.fn().mockResolvedValue({ rows: [{ id: "opp-1", stageId: "stage-old" }] }) };
      lastTxQueryMock = tx.query;
      return fn(tx);
    });

    const { updateOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    await updateOpportunityForTenant({ id: "user-1", tenantId: "tenant-1" }, "opp-1", { title: "Renamed Deal" });

    expect(lastTxQueryMock).not.toBeNull();
    const stageHistoryCall = lastTxQueryMock!.mock.calls.find((call) => String(call[0]).includes('insert into "OpportunityStageHistory"'));
    expect(stageHistoryCall).toBeUndefined();
  });
});
