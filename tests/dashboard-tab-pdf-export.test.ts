import { beforeEach, describe, expect, it, vi } from "vitest";

const { listDashboardTabsForTenantMock, listDashboardWidgetsForTenantMock, getDashboardWidgetForTenantMock, queryOneMock } = vi.hoisted(() => ({
  listDashboardTabsForTenantMock: vi.fn(),
  listDashboardWidgetsForTenantMock: vi.fn(),
  getDashboardWidgetForTenantMock: vi.fn(),
  queryOneMock: vi.fn(),
}));

vi.mock("@/lib/repositories/dashboard-tabs-postgres", () => ({
  listDashboardTabsForTenant: listDashboardTabsForTenantMock,
}));
vi.mock("@/lib/repositories/reports-dashboards-postgres", () => ({
  listDashboardWidgetsForTenant: listDashboardWidgetsForTenantMock,
  getDashboardWidgetForTenant: getDashboardWidgetForTenantMock,
}));
// Number widgets count in SQL (round-2 plan wave 3, B1).
vi.mock("@/lib/db/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/query")>()),
  queryOne: queryOneMock,
}));

import { exportDashboardTabPdfForTenant } from "@/lib/server/crm";

const user = { id: "user-1", tenantId: "tenant-1" };

// Gap checklist Module 17's advanced dashboard builder, "export/schedule for a whole dashboard"
// sub-item -- one combined PDF, per explicit user direction. A "dashboard" here is a
// DashboardTab, so this exercises the tab-membership resolution (owned widgets, default-tab
// fallback, excluding another user's shared widgets) that decides which widgets land in the PDF,
// reusing getDashboardWidgetDataForTenant's real data-fetching path unchanged.
describe("exportDashboardTabPdfForTenant", () => {
  beforeEach(() => {
    listDashboardTabsForTenantMock.mockReset();
    listDashboardWidgetsForTenantMock.mockReset();
    getDashboardWidgetForTenantMock.mockReset();
    queryOneMock.mockReset();
  });

  it("throws for a tab that doesn't exist", async () => {
    listDashboardTabsForTenantMock.mockResolvedValue([{ id: "tab-1", name: "Main", isDefault: true }]);
    await expect(exportDashboardTabPdfForTenant(user, "tab-missing")).rejects.toThrow("DASHBOARD_TAB_NOT_FOUND");
  });

  it("includes only this viewer's own widgets assigned to the tab (untagged widgets fall back to the default tab), excluding shared widgets", async () => {
    listDashboardTabsForTenantMock.mockResolvedValue([
      { id: "tab-1", name: "Main", isDefault: true },
      { id: "tab-2", name: "Sales", isDefault: false },
    ]);
    listDashboardWidgetsForTenantMock.mockResolvedValue([
      { id: "widget-own-tagged", title: "My Leads", type: "STAT", config: { module: "LEADS" }, tabId: "tab-1", isOwner: true },
      { id: "widget-own-untagged", title: "Untagged Stat", type: "STAT", config: { module: "LEADS" }, tabId: null, isOwner: true },
      { id: "widget-other-tab", title: "Sales Widget", type: "STAT", config: { module: "LEADS" }, tabId: "tab-2", isOwner: true },
      { id: "widget-shared", title: "Shared Widget", type: "STAT", config: { module: "LEADS" }, tabId: "tab-1", isOwner: false },
    ]);
    getDashboardWidgetForTenantMock.mockImplementation(async (_user: any, id: string) =>
      ({ id, type: "STAT", config: { module: "LEADS" } }),
    );
    queryOneMock.mockResolvedValue({ count: 2 });

    const result = await exportDashboardTabPdfForTenant(user, "tab-1");

    expect(result.tabName).toBe("Main");
    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // widget-own-tagged (explicit tab-1) and widget-own-untagged (falls back to the default tab,
    // which is tab-1) both included; widget-other-tab (tab-2) and widget-shared (not owned) excluded.
    const dataFetchedFor = getDashboardWidgetForTenantMock.mock.calls.map((call) => call[1]);
    expect(dataFetchedFor.sort()).toEqual(["widget-own-tagged", "widget-own-untagged"]);
  });

  it("produces a valid PDF for a tab with zero matching widgets", async () => {
    listDashboardTabsForTenantMock.mockResolvedValue([{ id: "tab-1", name: "Empty", isDefault: true }]);
    listDashboardWidgetsForTenantMock.mockResolvedValue([]);

    const result = await exportDashboardTabPdfForTenant(user, "tab-1");
    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
