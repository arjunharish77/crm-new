import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboardWidgetForTenantMock, getAppReportDataMock } = vi.hoisted(() => ({
  getDashboardWidgetForTenantMock: vi.fn(),
  getAppReportDataMock: vi.fn(),
}));

vi.mock("@/lib/repositories/reports-dashboards-postgres", () => ({
  getDashboardWidgetForTenant: getDashboardWidgetForTenantMock,
}));
vi.mock("@/lib/repositories/marketplace-postgres", () => ({
  getAppReportData: getAppReportDataMock,
}));

import { getDashboardWidgetDataForTenant } from "@/lib/server/crm";

const user = { id: "user-1", tenantId: "tenant-1" };

// Gap checklist Module 16's app-backed reports, "expose ... through ... widgets" half -- built
// per explicit user decision, reusing getAppReportData's own permission-checked cached fetch.
describe("getDashboardWidgetDataForTenant -- app-backed reports", () => {
  beforeEach(() => {
    getDashboardWidgetForTenantMock.mockReset();
    getAppReportDataMock.mockReset();
  });

  it("returns a raw row count for a STAT widget with no metric column configured", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({
      id: "w1", type: "STAT", config: { appReportAppId: "app-1", appReportKey: "orders", metric: "__count__" },
    });
    getAppReportDataMock.mockResolvedValue({ rows: [{ region: "West", total: 10 }, { region: "East", total: 5 }], columnSchema: [] });

    const result = await getDashboardWidgetDataForTenant(user, "w1");

    expect(getAppReportDataMock).toHaveBeenCalledWith(user, "app-1", "orders");
    expect(result).toBe(2);
  });

  it("sums the configured metric column for a STAT widget", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({
      id: "w1", type: "STAT", config: { appReportAppId: "app-1", appReportKey: "orders", metric: "total" },
    });
    getAppReportDataMock.mockResolvedValue({ rows: [{ region: "West", total: 10 }, { region: "East", total: 5 }], columnSchema: [] });

    const result = await getDashboardWidgetDataForTenant(user, "w1");
    expect(result).toBe(15);
  });

  it("treats a non-numeric metric value as 0 when summing", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({
      id: "w1", type: "STAT", config: { appReportAppId: "app-1", appReportKey: "orders", metric: "total" },
    });
    getAppReportDataMock.mockResolvedValue({ rows: [{ total: 10 }, { total: "not-a-number" }], columnSchema: [] });

    const result = await getDashboardWidgetDataForTenant(user, "w1");
    expect(result).toBe(10);
  });

  it("maps rows to {group, value} for a BAR widget using the configured group/value columns", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({
      id: "w1", type: "BAR",
      config: { appReportAppId: "app-1", appReportKey: "orders", groupField: "region", valueField: "total" },
    });
    getAppReportDataMock.mockResolvedValue({
      rows: [{ region: "West", total: 10 }, { region: "East", total: 5 }],
      columnSchema: [{ key: "region", label: "Region", type: "text" }, { key: "total", label: "Total", type: "number" }],
    });

    const result = await getDashboardWidgetDataForTenant(user, "w1");
    expect(result).toEqual([{ group: "West", value: 10 }, { group: "East", value: 5 }]);
  });

  it("falls back to the report's own first/second columns for a BAR widget when group/value aren't configured", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({
      id: "w1", type: "BAR", config: { appReportAppId: "app-1", appReportKey: "orders" },
    });
    getAppReportDataMock.mockResolvedValue({
      rows: [{ region: "West", total: 10 }],
      columnSchema: [{ key: "region", label: "Region", type: "text" }, { key: "total", label: "Total", type: "number" }],
    });

    const result = await getDashboardWidgetDataForTenant(user, "w1");
    expect(result).toEqual([{ group: "West", value: 10 }]);
  });

  it("returns raw rows unchanged for a TABLE widget", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({
      id: "w1", type: "TABLE", config: { appReportAppId: "app-1", appReportKey: "orders" },
    });
    const rows = [{ region: "West", total: 10 }, { region: "East", total: 5 }];
    getAppReportDataMock.mockResolvedValue({ rows, columnSchema: [] });

    const result = await getDashboardWidgetDataForTenant(user, "w1");
    expect(result).toEqual(rows);
  });
});
