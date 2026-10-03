import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, queryOneMock, executeMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryOneMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock("@/lib/db/query", () => ({
  // The real helper: lists for jsonb columns are sent as JSON text.
  jsonbParam: (value: unknown) => JSON.stringify(value ?? null),
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

import {
  createCalculatedMetricForTenant,
  deleteCalculatedMetricForTenant,
  getCalculatedMetricValueForTenant,
  listCalculatedMetricsForTenant,
  updateCalculatedMetricForTenant,
} from "@/lib/server/calculated-metrics";

// Gap checklist Module 17, item 16 ("custom calculated fields/measures"). Simple fixed-operator
// math chaining already-defined metrics only -- no free-text formulas.
describe("calculated metrics", () => {
  const managerUser = { id: "user-1", tenantId: "tenant-1", role: { permissions: { modules: { metrics: { manage: true } } } } };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("creates a calculated metric after validating every step's metric exists, is visible, and has no group-by", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "Metric"')) {
        return {
          id: "metric-1", name: "Won Amount", root: "opportunity", aggregation: "SUM",
          aggregateObject: "opportunity", aggregateField: "amount", filters: [], groupByObject: null, groupByField: null,
          ownerId: "user-1", certificationStatus: "UNCERTIFIED", deprecationStatus: "ACTIVE",
          visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t",
        };
      }
      if (text.includes('insert into "CalculatedMetric"')) {
        return {
          id: "calc-1", name: "Won Amount x2", description: null,
          steps: [{ metricId: "metric-1", operator: null }, { metricId: "metric-1", operator: "+" }],
          ownerId: "user-1", visibility: "PRIVATE", sharedWithTeamId: null, createdBy: "user-1", createdAt: "t", updatedAt: "t",
        };
      }
      return null;
    });

    const metric = await createCalculatedMetricForTenant(managerUser, {
      name: "Won Amount x2",
      steps: [{ metricId: "metric-1", operator: null }, { metricId: "metric-1", operator: "+" }],
    });

    expect(metric.id).toBe("calc-1");
    expect(metric.steps).toHaveLength(2);
  });

  it("rejects a step referencing a metric with a group-by dimension -- it has no single scalar value", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "Metric"')) {
        return {
          id: "metric-grouped", name: "Leads by Source", root: "lead", aggregation: "COUNT",
          aggregateObject: null, aggregateField: null, filters: [], groupByObject: "lead", groupByField: "source",
          ownerId: "user-1", certificationStatus: "UNCERTIFIED", deprecationStatus: "ACTIVE",
          visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t",
        };
      }
      return null;
    });

    await expect(
      createCalculatedMetricForTenant(managerUser, {
        name: "Bad calc",
        steps: [{ metricId: "metric-grouped", operator: null }, { metricId: "metric-grouped", operator: "+" }],
      }),
    ).rejects.toThrow("group-by dimension");
  });

  it("rejects a step referencing a metric that doesn't exist or isn't visible to this user", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "Metric"')) return null; // not found / not visible
      return null;
    });

    await expect(
      createCalculatedMetricForTenant(managerUser, {
        name: "Bad calc",
        steps: [{ metricId: "missing-metric", operator: null }, { metricId: "missing-metric", operator: "+" }],
      }),
    ).rejects.toThrow("Metric not found or not visible");
  });

  it("rejects fewer than 2 steps", async () => {
    await expect(
      createCalculatedMetricForTenant(managerUser, { name: "Too short", steps: [{ metricId: "metric-1", operator: null }] }),
    ).rejects.toThrow("at least 2 steps");
  });

  it("lists a viewer's own calculated metrics plus TENANT-shared ones", async () => {
    queryMock.mockResolvedValueOnce([
      { id: "calc-1", name: "Mine", steps: [], ownerId: "user-1", visibility: "PRIVATE", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" },
      { id: "calc-2", name: "Shared", steps: [], ownerId: "user-2", visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" },
    ]);

    const result = await listCalculatedMetricsForTenant(managerUser);
    expect(result).toHaveLength(2);
    expect(result.find((m) => m.id === "calc-1")).toMatchObject({ isOwner: true });
    expect(result.find((m) => m.id === "calc-2")).toMatchObject({ isOwner: false });
  });

  it("rejects updating another user's calculated metric (owner-only)", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('update "CalculatedMetric"')) return null; // owner-scoped WHERE excludes user-1
      return null;
    });

    await expect(
      updateCalculatedMetricForTenant(managerUser, "calc-2", { name: "Renamed" }),
    ).rejects.toThrow("CALCULATED_METRIC_NOT_FOUND");
  });

  it("deletes a calculated metric only via the owner-scoped WHERE clause", async () => {
    await deleteCalculatedMetricForTenant(managerUser, "calc-1");
    expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('delete from "CalculatedMetric"'), ["calc-1", "user-1", "tenant-1"]);
  });

  describe("getCalculatedMetricValueForTenant", () => {
    it("chains metrics left to right with +/-/*// and returns the final scalar", async () => {
      // getMetricValueForTenant's own chain calls getMetricForTenant then
      // executeMetricQueryForTenant (which needs a leads dataset for a COUNT metric). Each of
      // the 3 steps here is a plain COUNT-over-leads metric so the same mocked lead dataset
      // (via queryMock below) drives all 3.
      const metricRows: Record<string, any> = {
        "m-a": { id: "m-a", name: "A", root: "lead", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], groupByObject: null, groupByField: null, ownerId: "user-1", visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" },
        "m-b": { id: "m-b", name: "B", root: "lead", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], groupByObject: null, groupByField: null, ownerId: "user-1", visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" },
        "m-c": { id: "m-c", name: "C", root: "lead", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], groupByObject: null, groupByField: null, ownerId: "user-1", visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" },
      };
      queryOneMock.mockImplementation(async (sql: string, params: any[]) => {
        const text = String(sql);
        if (text.includes('from "TenantFeature"')) return null;
        if (text.includes('from "CalculatedMetric"')) {
          return {
            id: "calc-1", name: "Calc",
            steps: [{ metricId: "m-a", operator: null }, { metricId: "m-b", operator: "+" }, { metricId: "m-c", operator: "-" }],
            ownerId: "user-1", visibility: "PRIVATE", sharedWithTeamId: null, createdAt: "t", updatedAt: "t",
          };
        }
        if (text.includes('from "Metric"')) {
          const id = params[0];
          return metricRows[id] ?? null;
        }
        return null;
      });
      // Each metric is a plain COUNT over leads -- leads dataset returned per metric-value call.
      queryMock.mockResolvedValue([{ id: "lead-1" }, { id: "lead-2" }]); // 2 leads => COUNT = 2, for every call

      const result = await getCalculatedMetricValueForTenant(managerUser, "calc-1");
      // A=2, B=2, C=2 => 2 + 2 - 2 = 2
      expect(result.value).toBe(2);
    });

    it("returns null (not Infinity/NaN) when a division step's divisor metric is 0", async () => {
      queryOneMock.mockImplementation(async (sql: string, params: any[]) => {
        const text = String(sql);
        if (text.includes('from "TenantFeature"')) return null;
        if (text.includes('from "CalculatedMetric"')) {
          return {
            id: "calc-2", name: "Ratio",
            steps: [{ metricId: "m-numerator", operator: null }, { metricId: "m-zero", operator: "/" }],
            ownerId: "user-1", visibility: "PRIVATE", sharedWithTeamId: null, createdAt: "t", updatedAt: "t",
          };
        }
        if (text.includes('from "Metric"')) {
          const id = params[0];
          if (id === "m-numerator") return { id: "m-numerator", name: "N", root: "lead", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], groupByObject: null, groupByField: null, ownerId: "user-1", visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" };
          if (id === "m-zero") return { id: "m-zero", name: "Z", root: "lead", aggregation: "COUNT", aggregateObject: null, aggregateField: null, filters: [], groupByObject: null, groupByField: null, ownerId: "user-1", visibility: "TENANT", sharedWithTeamId: null, createdAt: "t", updatedAt: "t" };
          return null;
        }
        return null;
      });
      // m-numerator's own value-computation call returns 2 leads (COUNT=2); m-zero's returns 0 leads (COUNT=0).
      let leadCallCount = 0;
      queryMock.mockImplementation(async () => {
        leadCallCount += 1;
        return leadCallCount === 1 ? [{ id: "lead-1" }, { id: "lead-2" }] : [];
      });

      const result = await getCalculatedMetricValueForTenant(managerUser, "calc-2");
      expect(result.value).toBeNull();
    });
  });
});
