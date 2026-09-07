import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboardWidgetForTenantMock, listOpportunitiesForTenantMock, getMetricForTenantMock, executePivotQueryForTenantMock } = vi.hoisted(() => ({
  getDashboardWidgetForTenantMock: vi.fn(),
  listOpportunitiesForTenantMock: vi.fn(),
  getMetricForTenantMock: vi.fn(),
  executePivotQueryForTenantMock: vi.fn(),
}));

vi.mock("@/lib/repositories/reports-dashboards-postgres", () => ({
  getDashboardWidgetForTenant: getDashboardWidgetForTenantMock,
}));
vi.mock("@/lib/repositories/opportunities-postgres", () => ({
  listOpportunitiesForTenant: listOpportunitiesForTenantMock,
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
    listOpportunitiesForTenantMock.mockReset();
    getMetricForTenantMock.mockReset();
    executePivotQueryForTenantMock.mockReset();
  });

  describe("SANKEY", () => {
    it("builds a source-node -> stage-node link graph from the opportunity pipeline's own lead-source/stage data", async () => {
      getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "SANKEY", config: {} });
      listOpportunitiesForTenantMock.mockResolvedValue({
        data: [
          { id: "opp-1", lead: { source: "Website" }, stage: { name: "Application" } },
          { id: "opp-2", lead: { source: "Website" }, stage: { name: "Application" } },
          { id: "opp-3", lead: { source: "Website" }, stage: { name: "Enrolled" } },
          { id: "opp-4", lead: { source: "Referral" }, stage: { name: "Application" } },
        ],
      });

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
      listOpportunitiesForTenantMock.mockResolvedValue({ data: [{ id: "opp-1", lead: null, stage: null }] });

      const result = await getDashboardWidgetDataForTenant(user, "w1");
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
