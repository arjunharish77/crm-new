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

// WP09 (F11): opportunities-postgres.ts now also imports the real, exported `buildLeadWhere`
// (for getLeadSourceRoiAggregateForTenant's cross-table SQL) -- keep it real via importOriginal
// rather than stubbing the whole module, so buildLeadWhere's actual tenant/scope SQL-building
// logic is still exercised, while listLeadsForTenant stays mocked exactly as before.
vi.mock("@/lib/repositories/leads-postgres", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/leads-postgres")>();
  return {
    ...actual,
    listLeadsForTenant: vi.fn(async () => ({ data: [{ id: "lead-1", name: "Alpha Lead" }] })),
  };
});

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

  // WP09 (F12): predictive-score fields now compile as an inline `id in (select ...)` subquery
  // (see the identical fix/comment in leads-postgres.test.ts) instead of being resolved into a
  // record-id list beforehand and short-circuited before ever touching "Opportunity" -- so this
  // now genuinely runs the real query chain (mocked to return zero rows throughout, exactly like
  // a real unmatched subquery would), including decorateOpportunities' own follow-up queries
  // which still run even for an empty opportunities array.
  it("returns an empty page when predictive score filters match no opportunities, via a real subquery-shaped WHERE clause", async () => {
    queryOneMock.mockResolvedValue({ count: 0 });
    queryMock.mockResolvedValue([]);

    const { listOpportunitiesForTenantByType } = await import("@/lib/repositories/opportunities-postgres");
    const result = await listOpportunitiesForTenantByType(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      10,
      null,
      [{ field: "predictiveScoreBand", operator: "equals", value: "HOT" }],
    );

    expect(result).toEqual({ data: [], meta: { total: 0, page: 1, last_page: 1, limit: 10, isComplete: true } });
    const countSql = queryOneMock.mock.calls[0][0];
    expect(countSql).toContain('id in (select "recordId" from "RecordScore" where "recordType" = $');
    expect(countSql).toContain('"scoreBand" = $');
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
      expect(queryMock.mock.calls[1][0]).toContain('from "StageDefinition"');
    });

    it("skips the stage-name lookup entirely when there are no stage-scoped counts", async () => {
      queryMock.mockResolvedValueOnce([{ stageId: null, count: 5 }]);

      const { getOpportunityStageCountsForTenant } = await import("@/lib/repositories/opportunities-postgres");
      const result = await getOpportunityStageCountsForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      expect(result).toEqual([{ stageId: null, stageName: "Unassigned", count: 5 }]);
      expect(queryMock).toHaveBeenCalledTimes(1);
    });
  });

  // WP09 (F11): real SQL aggregation for getFunnelByStageReportForTenant (inbuilt-reports.ts) --
  // replaces fetching up to 1000 opportunities tenant-wide and reducing in JS with one real
  // `group by "stageId"` query over the full matching set, scoped through the same `buildWhere`
  // tenant/soft-merge/record-scope filtering every other Opportunity read path uses.
  describe("getFunnelByStageAggregateForTenant (WP09/F11: real SQL aggregation, no row cap)", () => {
    it("aggregates via a CTE + group by, scoped to the tenant and merged-away opportunities excluded", async () => {
      queryMock.mockResolvedValueOnce([
        { stageId: "stage-1", stage: "New", count: 3, value: 3000, isWon: false, isClosed: false, order: 0 },
        { stageId: "stage-2", stage: "Won", count: 1, value: 500, isWon: true, isClosed: true, order: 1 },
      ]);

      const { getFunnelByStageAggregateForTenant } = await import("@/lib/repositories/opportunities-postgres");
      const result = await getFunnelByStageAggregateForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      expect(result).toHaveLength(2);
      const sql = queryMock.mock.calls[0][0];
      expect(sql).toContain("with scoped_opportunities as");
      expect(sql).toContain('from "Opportunity"');
      expect(sql).toContain('"tenantId" = $1');
      expect(sql).toContain('"mergedIntoId" is null');
      expect(sql).toContain('group by o."stageId"');
      expect(sql).toContain('left join "StageDefinition"');
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1"]);
    });

    it("scopes to the viewer's own opportunities for an OWN-record-access user, same as buildWhere everywhere else", async () => {
      queryMock.mockResolvedValueOnce([]);
      const { getFunnelByStageAggregateForTenant } = await import("@/lib/repositories/opportunities-postgres");
      await getFunnelByStageAggregateForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } });

      expect(queryMock.mock.calls[0][0]).toContain('"ownerId" = $2');
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "user-1"]);
    });
  });

  // WP09 (F11): real SQL aggregation for getPeriodComparisonReportForTenant's Opportunity-side
  // metrics -- one query, two ranges, via `filter (where ...)` instead of a capped fetch-then-JS
  // reduce.
  describe("getOpportunityPeriodMetricsForTenant (WP09/F11: real SQL aggregation, no row cap)", () => {
    it("issues a single count/sum filter query per range, scoped by the same buildWhere tenant/scope clause", async () => {
      queryOneMock.mockResolvedValueOnce({
        currentCount: 4,
        previousCount: 9,
        currentWonCount: 1,
        previousWonCount: 3,
        currentWonValue: 500,
        previousWonValue: 1500,
      });

      const { getOpportunityPeriodMetricsForTenant } = await import("@/lib/repositories/opportunities-postgres");
      const currentRange = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };
      const previousRange = { start: new Date("2026-07-01T00:00:00.000Z"), end: new Date("2026-08-01T00:00:00.000Z") };
      const result = await getOpportunityPeriodMetricsForTenant(
        { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
        currentRange,
        previousRange,
      );

      expect(result).toEqual({
        current: { count: 4, wonCount: 1, wonValue: 500 },
        previous: { count: 9, wonCount: 3, wonValue: 1500 },
      });
      const sql = queryOneMock.mock.calls[0][0];
      expect(sql).toContain("with scoped_opportunities as");
      expect(sql).toContain("count(*) filter");
      expect(sql).toContain("sum(so.amount) filter");
      expect(sql).toContain('"tenantId" = $1');
      expect(queryOneMock.mock.calls[0][1]).toEqual([
        "tenant-1",
        currentRange.start.toISOString(),
        currentRange.end.toISOString(),
        previousRange.start.toISOString(),
        previousRange.end.toISOString(),
      ]);
    });

    it("defaults every field to 0 when no row comes back", async () => {
      queryOneMock.mockResolvedValueOnce(null);
      const { getOpportunityPeriodMetricsForTenant } = await import("@/lib/repositories/opportunities-postgres");
      const range = { start: new Date("2026-08-01T00:00:00.000Z"), end: new Date("2026-09-01T00:00:00.000Z") };

      const result = await getOpportunityPeriodMetricsForTenant({ id: "user-1", tenantId: "tenant-1" }, range, range);
      expect(result).toEqual({ current: { count: 0, wonCount: 0, wonValue: 0 }, previous: { count: 0, wonCount: 0, wonValue: 0 } });
    });
  });

  // WP09 (F11): real SQL aggregation for getLeadSourceRoiReportForTenant -- joins Opportunity to
  // Lead in SQL (each scoped by its OWN table's where-builder, `buildWhere`/`buildLeadWhere`)
  // instead of fetching up to 1000 leads and 1000 opportunities and joining them via an in-memory
  // Map.
  describe("getLeadSourceRoiAggregateForTenant (WP09/F11: real SQL aggregation, no row cap)", () => {
    it("runs a lead-source-counts query and an opportunity/lead join query, both scoped to the tenant", async () => {
      queryMock
        .mockResolvedValueOnce([{ source: "Website", leads: 10 }])
        .mockResolvedValueOnce([{ source: "Website", opportunities: 4, pipelineValue: 4000, wonOpportunities: 1, wonValue: 500 }]);

      const { getLeadSourceRoiAggregateForTenant } = await import("@/lib/repositories/opportunities-postgres");
      const result = await getLeadSourceRoiAggregateForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      expect(result.leadRows).toEqual([{ source: "Website", leads: 10 }]);
      expect(result.oppRows).toEqual([{ source: "Website", opportunities: 4, pipelineValue: 4000, wonOpportunities: 1, wonValue: 500 }]);

      // First call: lead-source counts, scoped via the real (non-mocked) buildLeadWhere.
      const leadSql = queryMock.mock.calls[0][0];
      expect(leadSql).toContain('from "Lead"');
      expect(leadSql).toContain('"tenantId" = $1');
      expect(leadSql).toContain("group by source");
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1"]);

      // Second call: Opportunity CTE joined to a Lead CTE (both scoped), never a raw join of the
      // two full tables directly (which would make buildWhere's/buildLeadWhere's own unqualified
      // "tenantId"/"mergedIntoId" clauses ambiguous).
      const joinSql = queryMock.mock.calls[1][0];
      expect(joinSql).toContain("with scoped_opportunities as");
      expect(joinSql).toContain("scoped_leads as");
      expect(joinSql).toContain('join scoped_leads sl on sl.id = so."leadId"');
      expect(joinSql).toContain('left join "StageDefinition"');
      // Params: opportunity where-values first, then the (placeholder-shifted) lead where-values.
      expect(queryMock.mock.calls[1][1]).toEqual(["tenant-1", "tenant-1"]);
    });

    it("scopes the opportunity/lead join to the viewer's own records for an OWN-record-access user", async () => {
      queryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      const { getLeadSourceRoiAggregateForTenant } = await import("@/lib/repositories/opportunities-postgres");
      await getLeadSourceRoiAggregateForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } });

      expect(queryMock.mock.calls[0][0]).toContain('"ownerId" = $2');
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "user-1"]);
      const joinSql = queryMock.mock.calls[1][0];
      // Opportunity's own OWN-scope clause ($2) then the shifted Lead OWN-scope clause ($4).
      expect(joinSql).toContain('"ownerId" = $2');
      expect(queryMock.mock.calls[1][1]).toEqual(["tenant-1", "user-1", "tenant-1", "user-1"]);
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

// F03 fix (WP04, slice 2): same field-permission enforcement as Leads, now applied to
// Opportunities via the same shared src/lib/server/field-permissions.ts module.
describe("F03 fix: Opportunity field-permission enforcement (hidden/readonly)", () => {
  const userWithHiddenAmount = {
    id: "user-1", tenantId: "tenant-1",
    role: { permissions: { fieldPermissions: { opportunities: { amount: "hidden" } } } },
  };
  const userWithReadonlyTitle = {
    id: "user-1", tenantId: "tenant-1",
    role: { permissions: { fieldPermissions: { opportunities: { title: "readonly" } } } },
  };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    lastTxQueryMock = null;

    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
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
      if (text.includes('from "StageDefinition"')) return [{ id: "stage-old", opportunityTypeId: "type-1", name: "Applied", order: 1 }];
      return [];
    });
  });

  it("masks a hidden field to null on a detail read", async () => {
    const { getOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    const result: any = await getOpportunityForTenant(userWithHiddenAmount, "opp-1");

    expect(result.amount).toBeNull();
    expect(result.amountHidden).toBe(true);
    expect(result.title).toBe("Deal"); // unrelated field unaffected
  });

  it("does NOT overwrite a hidden field's real stored value when an update omits it (regression guard)", async () => {
    (vi.mocked((await import("@/lib/db/transaction")).withTransaction) as any).mockImplementationOnce(
      async (_ctx: unknown, fn: (tx: any) => Promise<unknown>) => {
        const tx = { query: vi.fn().mockResolvedValue({ rows: [{ id: "opp-1", stageId: "stage-old", title: "Renamed", amount: 1000 }] }) };
        lastTxQueryMock = tx.query;
        return fn(tx);
      },
    );

    const { updateOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    // This user cannot see "amount" (masked to null on read) -- updating an unrelated field
    // (title) must not turn that masked null into the ACTUAL stored amount.
    await updateOpportunityForTenant(userWithHiddenAmount, "opp-1", { title: "Renamed" });

    const updateCall = lastTxQueryMock!.mock.calls.find((call) => String(call[0]).startsWith('update "Opportunity"'));
    expect(updateCall).toBeDefined();
    const values = updateCall![1];
    expect(values[2]).toBe(1000); // amount -- real stored value, never null
  });

  it("silently drops a readonly field from the update payload instead of applying it", async () => {
    const { updateOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    await updateOpportunityForTenant(userWithReadonlyTitle, "opp-1", { title: "Attacker-supplied title" });

    const updateCall = lastTxQueryMock!.mock.calls.find((call) => String(call[0]).startsWith('update "Opportunity"'));
    const values = updateCall![1];
    expect(values[1]).toBe("Deal"); // unchanged -- the readonly field write was dropped
  });

  it("behaves exactly as before when no fieldPermissions are configured (backward compatible default)", async () => {
    const { getOpportunityForTenant } = await import("@/lib/repositories/opportunities-postgres");
    const result: any = await getOpportunityForTenant({ id: "user-1", tenantId: "tenant-1" }, "opp-1");

    expect(result.amount).toBe(1000);
    expect(result.amountHidden).toBeUndefined();
  });
});
