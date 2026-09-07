import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, queryOneMock, executeMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryOneMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

const { executeMetricQueryMock } = vi.hoisted(() => ({ executeMetricQueryMock: vi.fn() }));

vi.mock("@/lib/server/reporting-query", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/reporting-query")>("@/lib/server/reporting-query");
  return { ...actual, executeMetricQueryForTenant: executeMetricQueryMock };
});

import {
  computeDueMetricGrainSnapshots,
  createMetricForTenant,
  getMetricGrainSeriesForTenant,
  updateMetricDefinitionForTenant,
} from "@/lib/server/metrics";

// Gap checklist Module 17's semantic metric layer, "grain" sub-item -- daily/weekly/monthly,
// configurable per metric, per explicit user direction. Reuses the pre-existing, previously
// completely unreferenced "DailyMetric" table as period-snapshot storage.
describe("metric grain", () => {
  const managerUser = { id: "user-1", tenantId: "tenant-1", role: { permissions: { modules: { metrics: { manage: true } } } } };
  const baseMetricRow = {
    id: "metric-1", name: "Won Deals", description: null, root: "opportunity", aggregation: "COUNT",
    aggregateObject: null, aggregateField: null, filters: [], groupByObject: null, groupByField: null,
    ownerId: "user-1", certificationStatus: "UNCERTIFIED", certifiedBy: null, certifiedAt: null,
    deprecationStatus: "ACTIVE", deprecatedReason: null, deprecatedAt: null,
    visibility: "PRIVATE", sharedWithTeamId: null, grain: null, createdBy: "user-1", createdAt: "t", updatedAt: "t",
  };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    executeMetricQueryMock.mockReset();
  });

  describe("create/update validation", () => {
    it("rejects a group-by metric with a grain -- it has no single scalar value to track over time", async () => {
      await expect(createMetricForTenant(managerUser, {
        name: "Bad", root: "lead", aggregation: "COUNT", groupBy: { object: "lead", field: "source" }, grain: "DAILY",
      })).rejects.toThrow("group-by dimension can't have a grain");
    });

    it("rejects an invalid grain value", async () => {
      await expect(createMetricForTenant(managerUser, {
        name: "Bad", root: "lead", aggregation: "COUNT", grain: "YEARLY" as any,
      })).rejects.toThrow("Unsupported grain");
    });

    it("creates a metric with a valid grain and no group-by", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "TenantFeature"')) return null;
        if (text.includes('insert into "Metric"')) return { ...baseMetricRow, grain: "DAILY" };
        return null;
      });
      const metric = await createMetricForTenant(managerUser, { name: "Won Deals", root: "opportunity", aggregation: "COUNT", grain: "DAILY" });
      expect(metric.grain).toBe("DAILY");
      const insertCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('insert into "Metric"'));
      expect(insertCall![1]).toContain("DAILY");
    });

    it("rejects adding a group-by to a metric that already has a grain, without clearing it in the same request", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "TenantFeature"')) return null;
        if (text.includes('"createdBy" from "Metric"') || (text.includes('from "Metric"') && text.includes('"ownerId" = $2'))) {
          return { ...baseMetricRow, grain: "DAILY" };
        }
        return null;
      });
      await expect(updateMetricDefinitionForTenant(managerUser, "metric-1", {
        groupBy: { object: "opportunity", field: "stageId" },
      })).rejects.toThrow("clear it before adding a group-by dimension");
    });

    it("allows clearing grain in the same request that adds a group-by", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "TenantFeature"')) return null;
        if (text.includes('from "Metric"') && text.includes('"ownerId" = $2')) return { ...baseMetricRow, grain: "DAILY" };
        if (text.includes('update "Metric"')) return { ...baseMetricRow, grain: null, groupByObject: "opportunity", groupByField: "stageId" };
        return null;
      });
      const updated = await updateMetricDefinitionForTenant(managerUser, "metric-1", {
        groupBy: { object: "opportunity", field: "stageId" },
        grain: null,
      });
      expect(updated.grain).toBeNull();
      expect(updated.groupBy).toEqual({ object: "opportunity", field: "stageId" });
    });
  });

  describe("computeDueMetricGrainSnapshots", () => {
    it("computes and upserts a snapshot for a metric with no existing period row", async () => {
      queryMock.mockResolvedValueOnce([
        { id: "metric-1", tenantId: "tenant-1", root: "opportunity", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], grain: "DAILY" },
      ]);
      queryOneMock.mockResolvedValueOnce(null); // no existing DailyMetric row for this period
      executeMetricQueryMock.mockResolvedValueOnce({ value: 7 });

      const result = await computeDueMetricGrainSnapshots(50);

      expect(result).toEqual({ computed: 1, skipped: 0 });
      const upsertCall = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "DailyMetric"'));
      expect(upsertCall).toBeTruthy();
      expect(upsertCall![1]).toEqual(expect.arrayContaining(["tenant-1", "metric-1", 7]));

      const queryDefinition = executeMetricQueryMock.mock.calls[0][1];
      expect(queryDefinition.groupBy).toBeNull();
      const createdAtFilters = queryDefinition.filters.filter((f: any) => f.field === "createdAt");
      expect(createdAtFilters).toHaveLength(2);
      expect(createdAtFilters[0].operator).toBe("gte");
      expect(createdAtFilters[1].operator).toBe("less_than");
    });

    it("skips a metric whose period already has a stored snapshot, without recomputing", async () => {
      queryMock.mockResolvedValueOnce([
        { id: "metric-1", tenantId: "tenant-1", root: "opportunity", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], grain: "DAILY" },
      ]);
      queryOneMock.mockResolvedValueOnce({ id: "existing-snapshot" });

      const result = await computeDueMetricGrainSnapshots(50);

      expect(result).toEqual({ computed: 0, skipped: 1 });
      expect(executeMetricQueryMock).not.toHaveBeenCalled();
    });

    it("doesn't let one metric's failure block the rest of the batch", async () => {
      queryMock.mockResolvedValueOnce([
        { id: "metric-broken", tenantId: "tenant-1", root: "opportunity", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], grain: "DAILY" },
        { id: "metric-ok", tenantId: "tenant-1", root: "opportunity", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], grain: "WEEKLY" },
      ]);
      queryOneMock.mockResolvedValue(null);
      executeMetricQueryMock
        .mockRejectedValueOnce(new Error("FEATURE_DISABLED:advancedReporting"))
        .mockResolvedValueOnce({ value: 3 });

      const result = await computeDueMetricGrainSnapshots(50);
      expect(result).toEqual({ computed: 1, skipped: 1 });
    });
  });

  describe("getMetricGrainSeriesForTenant", () => {
    it("returns an empty series for a metric with no grain", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "TenantFeature"')) return null;
        if (text.includes('from "Metric"')) return { ...baseMetricRow, grain: null };
        return null;
      });
      const result = await getMetricGrainSeriesForTenant(managerUser, "metric-1");
      expect(result).toEqual({ grain: null, series: [] });
      expect(queryMock).not.toHaveBeenCalled();
    });

    it("returns the stored series in chronological order for a grain-enabled metric", async () => {
      queryOneMock.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes('from "TenantFeature"')) return null;
        if (text.includes('from "Metric"')) return { ...baseMetricRow, grain: "DAILY" };
        return null;
      });
      queryMock.mockResolvedValueOnce([
        { date: "2026-01-03", value: 5 },
        { date: "2026-01-02", value: 4 },
        { date: "2026-01-01", value: 3 },
      ]);
      const result = await getMetricGrainSeriesForTenant(managerUser, "metric-1");
      expect(result.grain).toBe("DAILY");
      expect(result.series.map((point) => point.date)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    });
  });
});
