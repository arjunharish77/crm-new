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

// Gap checklist Module 17 ("dashboard/report versioning": draft/publish, change history, clone,
// rollback, owner transfer, usage metrics, deprecation workflow). A "dashboard" here is a
// DashboardTab -- there's no separate Dashboard entity -- and a version snapshots the tab's own
// name plus the full definition of every widget on it (per explicit user direction).
describe("dashboard tab versioning", () => {
  const user = { id: "user-1", tenantId: "tenant-1" };
  const baseTab = {
    id: "tab-1", name: "Sales", order: 0, isDefault: true, currentVersion: 0,
    deprecationStatus: "ACTIVE", deprecatedReason: null, deprecatedAt: null,
    viewCount: 0, lastOpenedAt: null, createdAt: "t", updatedAt: "t",
  };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("publishes a version snapshotting the tab name and every widget currently on it", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('where id = $1 and "userId" = $2') && text.includes('"DashboardTab"')) return baseTab;
      if (text.includes('set "currentVersion" = $1')) return { ...baseTab, currentVersion: 1 };
      return null;
    });
    queryMock.mockResolvedValueOnce([
      { id: "widget-1", title: "Won Deals", type: "STAT", config: { module: "OPPORTUNITIES" }, w: 4, h: 3, x: 0, y: 0, visibility: "PRIVATE", sharedWithTeamId: null },
    ]);

    const { publishDashboardTabVersion } = await import("@/lib/repositories/dashboard-tabs-postgres");
    const updated = await publishDashboardTabVersion(user, "tab-1", "First cut");

    expect(updated.currentVersion).toBe(1);
    const insertCall = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "DashboardTabVersion"'));
    expect(insertCall).toBeTruthy();
    const snapshot = insertCall![1][4];
    expect(snapshot).toEqual({ tab: { name: "Sales" }, widgets: [{ id: "widget-1", title: "Won Deals", type: "STAT", config: { module: "OPPORTUNITIES" }, w: 4, h: 3, x: 0, y: 0, visibility: "PRIVATE", sharedWithTeamId: null }] });
    expect(insertCall![1][5]).toBe("First cut");
  });

  it("throws publishing a version for a tab that isn't owned by this user", async () => {
    queryOneMock.mockResolvedValue(null);
    const { publishDashboardTabVersion } = await import("@/lib/repositories/dashboard-tabs-postgres");
    await expect(publishDashboardTabVersion(user, "tab-x", null)).rejects.toThrow("DASHBOARD_TAB_NOT_FOUND");
  });

  it("lists versions newest-first without the full widget snapshot", async () => {
    queryOneMock.mockResolvedValueOnce(baseTab);
    queryMock.mockResolvedValueOnce([
      { id: "v-2", version: 2, publishNotes: "Second", publishedBy: "user-1", publishedAt: "t2" },
      { id: "v-1", version: 1, publishNotes: "First cut", publishedBy: "user-1", publishedAt: "t1" },
    ]);
    const { listDashboardTabVersions } = await import("@/lib/repositories/dashboard-tabs-postgres");
    const versions = await listDashboardTabVersions(user, "tab-1");
    expect(versions).toHaveLength(2);
    expect(versions[0].version).toBe(2);
  });

  it("restores a version's widgets, skips a since-deleted widget, and republishes as a new tip version", async () => {
    const snapshot = {
      tab: { name: "Sales (renamed)" },
      widgets: [
        { id: "widget-1", title: "Won Deals", type: "STAT", config: {}, w: 4, h: 3, x: 0, y: 0, visibility: "PRIVATE", sharedWithTeamId: null },
        { id: "widget-deleted", title: "Gone", type: "STAT", config: {}, w: 4, h: 3, x: 4, y: 0, visibility: "PRIVATE", sharedWithTeamId: null },
      ],
    };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('select snapshot from "DashboardTabVersion"')) return { snapshot };
      if (text.includes('select') && text.includes('from "DashboardTab"')) return { ...baseTab, currentVersion: 1 };
      if (text.includes('update "DashboardTab"') && text.includes('"currentVersion"')) return { ...baseTab, currentVersion: 2 };
      return null;
    });
    queryMock.mockResolvedValueOnce([]); // widget list for the re-publish inside restore
    executeMock.mockImplementation(async (sql: string, values: unknown[]) => {
      if (String(sql).includes('update "DashboardWidget"')) {
        return (values as unknown[]).includes("widget-deleted") ? 0 : 1;
      }
      return 1;
    });

    const { restoreDashboardTabVersion } = await import("@/lib/repositories/dashboard-tabs-postgres");
    const result = await restoreDashboardTabVersion(user, "tab-1", 1);

    expect(result.restored).toBe(1);
    expect(result.skipped).toBe(1);
    const renameCall = executeMock.mock.calls.find((call) => String(call[0]).includes('set name = $1') && String(call[0]).includes('"DashboardTab"'));
    expect(renameCall![1][0]).toBe("Sales (renamed)");
  });

  it("throws restoring a version number that was never published", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('select') && text.includes('from "DashboardTab"')) return baseTab;
      if (text.includes('select snapshot from "DashboardTabVersion"')) return null;
      return null;
    });
    const { restoreDashboardTabVersion } = await import("@/lib/repositories/dashboard-tabs-postgres");
    await expect(restoreDashboardTabVersion(user, "tab-1", 99)).rejects.toThrow("DASHBOARD_TAB_VERSION_NOT_FOUND");
  });

  it("clones a tab and its widgets under a new name, never carrying over version history", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('select') && text.includes('from "DashboardTab"')) return baseTab;
      if (text.includes('insert into "DashboardTab"')) return { ...baseTab, id: "tab-2", name: "Sales (Copy)", isDefault: false, currentVersion: 0 };
      return null;
    });
    queryMock
      .mockResolvedValueOnce([{ title: "Won Deals", type: "STAT", config: {}, w: 4, h: 3, x: 0, y: 0, visibility: "PRIVATE", sharedWithTeamId: null }]) // source widgets
      .mockResolvedValueOnce([baseTab]); // listDashboardTabsForTenant for next-order computation

    const { cloneDashboardTabForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
    const cloned = await cloneDashboardTabForTenant(user, "tab-1", "Sales (Copy)");

    expect(cloned.name).toBe("Sales (Copy)");
    expect(cloned.currentVersion).toBe(0);
    const widgetInsert = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "DashboardWidget"'));
    expect(widgetInsert).toBeTruthy();
  });

  it("rejects cloning with a blank name", async () => {
    const { cloneDashboardTabForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
    await expect(cloneDashboardTabForTenant(user, "tab-1", "  ")).rejects.toThrow("TAB_NAME_REQUIRED");
  });

  it("transfers a tab and its widgets to a new owner", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('where id = $1 and "userId" = $2') && text.includes('"DashboardTab"')) return baseTab;
      if (text.includes('select id from "User"')) return { id: "user-2" };
      if (text.includes('select id from "DashboardTab" where "tenantId"')) return null; // no name conflict
      if (text.includes('update "DashboardTab"') && text.includes('"userId" = $1')) return { ...baseTab, userId: "user-2" };
      return null;
    });

    const { transferDashboardTabOwnerForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
    const updated = await transferDashboardTabOwnerForTenant(user, "tab-1", "user-2");
    expect(updated.userId).toBe("user-2");
    const widgetReassign = executeMock.mock.calls.find((call) => String(call[0]).includes('update "DashboardWidget" set "userId"'));
    expect(widgetReassign![1]).toEqual(["user-2", expect.any(String), "tab-1", "tenant-1"]);
  });

  it("rejects transferring to a user that doesn't exist in this tenant", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('where id = $1 and "userId" = $2') && text.includes('"DashboardTab"')) return baseTab;
      if (text.includes('select id from "User"')) return null;
      return null;
    });
    const { transferDashboardTabOwnerForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
    await expect(transferDashboardTabOwnerForTenant(user, "tab-1", "ghost")).rejects.toThrow("DASHBOARD_TAB_TRANSFER_TARGET_NOT_FOUND");
  });

  it("rejects transferring when the new owner already has a tab with the same name", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('where id = $1 and "userId" = $2') && text.includes('"DashboardTab"')) return baseTab;
      if (text.includes('select id from "User"')) return { id: "user-2" };
      if (text.includes('select id from "DashboardTab" where "tenantId"')) return { id: "tab-conflict" };
      return null;
    });
    const { transferDashboardTabOwnerForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
    await expect(transferDashboardTabOwnerForTenant(user, "tab-1", "user-2")).rejects.toThrow("DASHBOARD_TAB_TRANSFER_NAME_CONFLICT");
  });

  it("sets a tab deprecated with a reason, owner-scoped for a non-admin", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('update "DashboardTab"') && text.includes('"deprecationStatus"')) {
        return { ...baseTab, deprecationStatus: "DEPRECATED", deprecatedReason: "Superseded" };
      }
      return null;
    });
    const { setDashboardTabDeprecationForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
    const updated = await setDashboardTabDeprecationForTenant(user, "tab-1", "DEPRECATED", "Superseded");
    expect(updated.deprecationStatus).toBe("DEPRECATED");
    const updateCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('"deprecationStatus"'));
    expect(updateCall![0]).toContain('"userId" = $');
  });

  it("lets a platform admin deprecate a tab without an owner-scoped clause", async () => {
    const adminUser = { id: "admin-1", tenantId: "tenant-1", isPlatformAdmin: true };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('update "DashboardTab"') && text.includes('"deprecationStatus"')) return { ...baseTab, deprecationStatus: "DEPRECATED" };
      return null;
    });
    const { setDashboardTabDeprecationForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
    await setDashboardTabDeprecationForTenant(adminUser, "tab-1", "DEPRECATED", null);
    const updateCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('"deprecationStatus"'));
    expect(updateCall![0]).not.toContain('"userId"');
  });

  it("rejects an invalid deprecation status", async () => {
    const { setDashboardTabDeprecationForTenant } = await import("@/lib/repositories/dashboard-tabs-postgres");
    await expect(setDashboardTabDeprecationForTenant(user, "tab-1", "BOGUS" as any, null)).rejects.toThrow("Invalid deprecationStatus");
  });

  it("records a tab open as a real usage-metrics increment", async () => {
    const { recordDashboardTabOpened } = await import("@/lib/repositories/dashboard-tabs-postgres");
    await recordDashboardTabOpened(user, "tab-1");
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining('"viewCount" = "viewCount" + 1'),
      [expect.any(String), "tab-1", "user-1", "tenant-1"],
    );
  });
});

// --- CustomReport versioning ---
describe("custom report versioning", () => {
  const owner = { id: "user-1", tenantId: "tenant-1" };
  const admin = { id: "admin-1", tenantId: "tenant-1", isTenantAdmin: true };
  const baseReport = {
    id: "report-1", name: "Conversion", description: null, module: "LEADS", config: { root: "lead" },
    chartType: "TABLE", isPublic: false, isActive: true, createdBy: "user-1", currentVersion: 0,
    deprecationStatus: "ACTIVE", deprecatedReason: null, deprecatedAt: null, viewCount: 0, lastOpenedAt: null,
    createdAt: "t", updatedAt: "t",
  };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("publishes a version snapshotting the report's own definition", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "CustomReport"') && text.includes('"createdBy"')) return baseReport;
      if (text.includes('update "CustomReport"') && text.includes('"currentVersion"')) return { ...baseReport, currentVersion: 1 };
      return null;
    });
    const { publishCustomReportVersion } = await import("@/lib/repositories/reports-dashboards-postgres");
    const updated = await publishCustomReportVersion(owner, "report-1", "v1");
    expect(updated.currentVersion).toBe(1);
    const insertCall = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "CustomReportVersion"'));
    expect(insertCall![1][4]).toEqual({ name: "Conversion", description: null, module: "LEADS", config: { root: "lead" }, chartType: "TABLE" });
  });

  it("rejects publishing a version for someone else's report when the caller isn't an admin", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "CustomReport"') && text.includes('"createdBy"')) return { ...baseReport, createdBy: "someone-else" };
      return null;
    });
    const { publishCustomReportVersion } = await import("@/lib/repositories/reports-dashboards-postgres");
    await expect(publishCustomReportVersion(owner, "report-1", null)).rejects.toThrow("FORBIDDEN");
  });

  it("lets a tenant admin publish a version for someone else's report", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "CustomReport"') && text.includes('"createdBy"')) return { ...baseReport, createdBy: "someone-else" };
      if (text.includes('update "CustomReport"') && text.includes('"currentVersion"')) return { ...baseReport, currentVersion: 1, createdBy: "someone-else" };
      return null;
    });
    const { publishCustomReportVersion } = await import("@/lib/repositories/reports-dashboards-postgres");
    const updated = await publishCustomReportVersion(admin, "report-1", null);
    expect(updated.currentVersion).toBe(1);
  });

  it("restores a report's definition from an old version and republishes as a new tip version", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "CustomReport"') && text.includes('"createdBy"')) return { ...baseReport, currentVersion: 2 };
      if (text.includes('select snapshot from "CustomReportVersion"')) {
        return { snapshot: { name: "Old Name", description: "old", module: "LEADS", config: { root: "lead" }, chartType: "TABLE" } };
      }
      if (text.includes('update "CustomReport"') && text.includes('"currentVersion"')) return { ...baseReport, currentVersion: 3, name: "Old Name" };
      return null;
    });
    const { restoreCustomReportVersion } = await import("@/lib/repositories/reports-dashboards-postgres");
    const result = await restoreCustomReportVersion(owner, "report-1", 1);
    expect(result.currentVersion).toBe(3);
    const restoreUpdate = executeMock.mock.calls.find((call) => String(call[0]).includes('set name = $1') && String(call[0]).includes('"CustomReport"'));
    expect(restoreUpdate![1][0]).toBe("Old Name");
  });

  it("throws restoring a version that doesn't exist", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "CustomReport"') && text.includes('"createdBy"')) return baseReport;
      if (text.includes('select snapshot from "CustomReportVersion"')) return null;
      return null;
    });
    const { restoreCustomReportVersion } = await import("@/lib/repositories/reports-dashboards-postgres");
    await expect(restoreCustomReportVersion(owner, "report-1", 99)).rejects.toThrow("CUSTOM_REPORT_VERSION_NOT_FOUND");
  });

  it("clones a report under a new name with a fresh currentVersion of 0", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('select name, description, module, config')) return { name: "Conversion", description: null, module: "LEADS", config: { root: "lead" }, chartType: "TABLE", isPublic: false };
      if (text.includes('insert into "CustomReport"')) return { ...baseReport, id: "report-2", name: "Conversion (Copy)", currentVersion: 0 };
      return null;
    });
    const { cloneCustomReportForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
    const cloned = await cloneCustomReportForTenant(owner, "report-1", "Conversion (Copy)");
    expect(cloned.name).toBe("Conversion (Copy)");
    expect(cloned.currentVersion).toBe(0);
  });

  it("transfers report ownership to a new user", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "CustomReport"') && text.includes('"createdBy"')) return baseReport;
      if (text.includes('select id from "User"')) return { id: "user-2" };
      if (text.includes('update "CustomReport"') && text.includes('"createdBy" = $1')) return { ...baseReport, createdBy: "user-2" };
      return null;
    });
    const { transferCustomReportOwnerForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
    const updated = await transferCustomReportOwnerForTenant(owner, "report-1", "user-2");
    expect(updated.createdBy).toBe("user-2");
  });

  it("rejects transferring to a user outside the tenant", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "CustomReport"') && text.includes('"createdBy"')) return baseReport;
      if (text.includes('select id from "User"')) return null;
      return null;
    });
    const { transferCustomReportOwnerForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
    await expect(transferCustomReportOwnerForTenant(owner, "report-1", "ghost")).rejects.toThrow("CUSTOM_REPORT_TRANSFER_TARGET_NOT_FOUND");
  });

  it("sets a report deprecated with a reason", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('from "CustomReport"') && text.includes('"createdBy"')) return baseReport;
      if (text.includes('update "CustomReport"') && text.includes('"deprecationStatus"')) return { ...baseReport, deprecationStatus: "DEPRECATED", deprecatedReason: "Old" };
      return null;
    });
    const { setCustomReportDeprecationForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
    const updated = await setCustomReportDeprecationForTenant(owner, "report-1", "DEPRECATED", "Old");
    expect(updated.deprecationStatus).toBe("DEPRECATED");
  });

  it("only increments viewCount for real reports, never chartType='SAVED_VIEW' rows", async () => {
    const { recordCustomReportOpened } = await import("@/lib/repositories/reports-dashboards-postgres");
    await recordCustomReportOpened(owner, "report-1");
    expect(executeMock).toHaveBeenCalledWith(
      expect.stringContaining(`"chartType" <> 'SAVED_VIEW'`),
      [expect.any(String), "report-1", "tenant-1"],
    );
  });
});
