import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboardWidgetForTenantMock, queryMock, getMetricForTenantMock, executePivotQueryForTenantMock } = vi.hoisted(() => ({
  getDashboardWidgetForTenantMock: vi.fn(),
  queryMock: vi.fn(),
  getMetricForTenantMock: vi.fn(),
  executePivotQueryForTenantMock: vi.fn(),
}));

vi.mock("@/lib/repositories/reports-dashboards-postgres", () => ({
  getDashboardWidgetForTenant: getDashboardWidgetForTenantMock,
}));
// Round-2 plan wave 3 (B1): the sankey counts flows in SQL over every visible opportunity.
vi.mock("@/lib/db/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/query")>()),
  query: queryMock,
}));
vi.mock("@/lib/server/metrics", () => ({
  getMetricForTenant: getMetricForTenantMock,
}));
vi.mock("@/lib/server/reporting-query", () => ({
  executePivotQueryForTenant: executePivotQueryForTenantMock,
}));

import { getDashboardWidgetDataForTenant } from "@/lib/server/crm";

const user = { id: "user-1", tenantId: "tenant-1" };

// Gap checklist Module 17's chart-library expansion (sankey diagram, pivot table sub-items).
describe("getDashboardWidgetDataForTenant -- SANKEY and PIVOT", () => {
  beforeEach(() => {
    getDashboardWidgetForTenantMock.mockReset();
    queryMock.mockReset();
    getMetricForTenantMock.mockReset();
    executePivotQueryForTenantMock.mockReset();
  });

  describe("SANKEY", () => {
    it("builds a source-node -> stage-node link graph from the opportunity pipeline's own lead-source/stage data", async () => {
      getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "SANKEY", config: {} });
      // One row per (source, stage) flow with its newest opportunity; nodes are most recent first.
      queryMock.mockResolvedValue([
        { source: "Website", stage: "Application", value: 2, lastAt: "2026-10-20T10:00:00Z" },
        { source: "Website", stage: "Enrolled", value: 1, lastAt: "2026-10-19T10:00:00Z" },
        { source: "Referral", stage: "Application", value: 1, lastAt: "2026-10-18T10:00:00Z" },
      ]);

      const result = await getDashboardWidgetDataForTenant(user, "w1");

      expect(result.nodes).toEqual([{ name: "Website" }, { name: "Referral" }, { name: "Application" }, { name: "Enrolled" }]);
      // Website(0) -> Application(2, index 0 in stage list -> offset by 2 source nodes) = 2
      expect(result.links).toEqual(expect.arrayContaining([
        { source: 0, target: 2, value: 2 }, // Website -> Application
        { source: 0, target: 3, value: 1 }, // Website -> Enrolled
        { source: 1, target: 2, value: 1 }, // Referral -> Application
      ]));
    });

    it("falls back to Unknown/Unassigned for opportunities with no resolvable lead source or stage", async () => {
      getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "SANKEY", config: {} });
      queryMock.mockResolvedValue([{ source: "Unknown", stage: "Unassigned", value: 1, lastAt: "2026-10-20T10:00:00Z" }]);

      const result = await getDashboardWidgetDataForTenant(user, "w1");
      expect(String(queryMock.mock.calls[0][0])).toContain(`coalesce(l.source, 'Unknown') as source, coalesce(sd.name, 'Unassigned') as stage`);
      expect(result.nodes).toEqual([{ name: "Unknown" }, { name: "Unassigned" }]);
      expect(result.links).toEqual([{ source: 0, target: 1, value: 1 }]);
    });
  });

  describe("PIVOT", () => {
    it("resolves the referenced metric's own groupBy as the row dimension and delegates to executePivotQueryForTenant", async () => {
      getDashboardWidgetForTenantMock.mockResolvedValue({
        id: "w1", type: "PIVOT",
        config: { pivot: { metricId: "metric-1", columnGroupBy: { object: "lead", field: "status" } } },
      });
      getMetricForTenantMock.mockResolvedValue({
        id: "metric-1", root: "lead", aggregation: "COUNT", aggregateField: null, filters: [],
        groupBy: { object: "lead", field: "source" },
      });
      executePivotQueryForTenantMock.mockResolvedValue({ rowLabels: ["Website"], columnLabels: ["NEW"], cells: { Website: { NEW: 5 } } });

      const result = await getDashboardWidgetDataForTenant(user, "w1");

      expect(executePivotQueryForTenantMock).toHaveBeenCalledWith(user, {
        root: "lead",
        aggregation: "COUNT",
        aggregateField: null,
        filters: [],
        rowGroupBy: { object: "lead", field: "source" },
        columnGroupBy: { object: "lead", field: "status" },
      });
      expect(result).toEqual({ rowLabels: ["Website"], columnLabels: ["NEW"], cells: { Website: { NEW: 5 } } });
    });

    it("returns an empty pivot when the referenced metric has no group-by dimension", async () => {
      getDashboardWidgetForTenantMock.mockResolvedValue({
        id: "w1", type: "PIVOT",
        config: { pivot: { metricId: "metric-1", columnGroupBy: { object: "lead", field: "status" } } },
      });
      getMetricForTenantMock.mockResolvedValue({ id: "metric-1", root: "lead", aggregation: "COUNT", groupBy: null });

      const result = await getDashboardWidgetDataForTenant(user, "w1");
      expect(result).toEqual({ rowLabels: [], columnLabels: [], cells: {} });
      expect(executePivotQueryForTenantMock).not.toHaveBeenCalled();
    });

    it("returns an empty pivot when the widget's own config is incomplete", async () => {
      getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "PIVOT", config: {} });
      const result = await getDashboardWidgetDataForTenant(user, "w1");
      expect(result).toEqual({ rowLabels: [], columnLabels: [], cells: {} });
      expect(getMetricForTenantMock).not.toHaveBeenCalled();
    });
  });
});
