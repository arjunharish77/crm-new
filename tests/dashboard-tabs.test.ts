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
  jsonbParam: (v: unknown) => JSON.stringify(v ?? null),
}));

import {
  createDashboardTabForTenant,
  deleteDashboardLayoutSnapshotForTenant,
  deleteDashboardTabForTenant,
  listDashboardTabsForTenant,
  renameDashboardTabForTenant,
  reorderDashboardTabsForTenant,
  restoreDashboardLayoutSnapshotForTenant,
  saveDashboardLayoutSnapshotForTenant,
  setDefaultDashboardTabForTenant,
} from "@/lib/repositories/dashboard-tabs-postgres";

// Gap checklist Module 17, item 4 (advanced dashboard builder: dashboard tabs + saved states).
describe("dashboard tabs", () => {
  const user = { id: "user-1", tenantId: "tenant-1" };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists a user's own tabs ordered by 'order'", async () => {
    queryMock.mockResolvedValueOnce([
      { id: "tab-1", name: "Main", order: 0, isDefault: true, createdAt: "t", updatedAt: "t" },
      { id: "tab-2", name: "Sales", order: 1, isDefault: false, createdAt: "t", updatedAt: "t" },
    ]);
    const tabs = await listDashboardTabsForTenant(user);
    expect(tabs).toHaveLength(2);
    expect(queryMock.mock.calls[0][0]).toContain('from "DashboardTab"');
    expect(queryMock.mock.calls[0][0]).toContain('order by "order" asc');
  });

  it("marks the first tab a user creates as their default", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('insert into "DashboardTab"')) {
        return { id: "tab-1", name: "Main", order: 0, isDefault: true, createdAt: "t", updatedAt: "t" };
      }
      return null;
    });
    queryMock.mockResolvedValueOnce([]); // no existing tabs yet

    const tab = await createDashboardTabForTenant(user, "Main");
    expect(tab.isDefault).toBe(true);
    const insertCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('insert into "DashboardTab"'));
    expect(insertCall![1]).toContain(true); // isDefault param
  });

  it("does not mark a second tab as default, and computes the next order", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('insert into "DashboardTab"')) {
        return { id: "tab-2", name: "Sales", order: 1, isDefault: false, createdAt: "t", updatedAt: "t" };
      }
      return null;
    });
    queryMock.mockResolvedValueOnce([{ id: "tab-1", name: "Main", order: 0, isDefault: true, createdAt: "t", updatedAt: "t" }]);

    const tab = await createDashboardTabForTenant(user, "Sales");
    expect(tab.isDefault).toBe(false);
    const insertCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('insert into "DashboardTab"'));
    expect(insertCall![1]).toContain(1); // next order
  });

  it("rejects a blank tab name", async () => {
    await expect(createDashboardTabForTenant(user, "   ")).rejects.toThrow("TAB_NAME_REQUIRED");
  });

  it("rejects renaming a tab that doesn't exist or isn't owned by this user", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('from "TenantFeature"')) return null;
      return null; // update matches 0 rows
    });
    await expect(renameDashboardTabForTenant(user, "tab-x", "New Name")).rejects.toThrow("DASHBOARD_TAB_NOT_FOUND");
  });

  it("reorders tabs by updating 'order' to each id's new index", async () => {
    queryOneMock.mockResolvedValue(null); // TenantFeature check -> enabled
    queryMock.mockResolvedValueOnce([
      { id: "tab-2", name: "Sales", order: 0, isDefault: false, createdAt: "t", updatedAt: "t" },
      { id: "tab-1", name: "Main", order: 1, isDefault: true, createdAt: "t", updatedAt: "t" },
    ]);

    await reorderDashboardTabsForTenant(user, ["tab-2", "tab-1"]);

    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(executeMock.mock.calls[0][1]).toEqual([0, "tab-2", "user-1", "tenant-1"]);
    expect(executeMock.mock.calls[1][1]).toEqual([1, "tab-1", "user-1", "tenant-1"]);
  });

  it("reassigns a deleted tab's widgets to the default tab, and refuses to delete the only tab", async () => {
    queryOneMock.mockResolvedValue(null); // TenantFeature check -> enabled
    queryMock
      .mockResolvedValueOnce([
        { id: "tab-1", name: "Main", order: 0, isDefault: true, createdAt: "t", updatedAt: "t" },
        { id: "tab-2", name: "Sales", order: 1, isDefault: false, createdAt: "t", updatedAt: "t" },
      ])
      .mockResolvedValueOnce([{ id: "tab-1", name: "Main", order: 0, isDefault: true, createdAt: "t", updatedAt: "t" }]);

    await deleteDashboardTabForTenant(user, "tab-2");

    const reassignCall = executeMock.mock.calls.find((call) => String(call[0]).includes('set "tabId" = $1'));
    expect(reassignCall![1]).toEqual(["tab-1", "tab-2", "user-1", "tenant-1"]);
    const deleteCall = executeMock.mock.calls.find((call) => String(call[0]).includes('delete from "DashboardTab"'));
    expect(deleteCall).toBeTruthy();

    // Only one tab left -- deleting it must be refused.
    queryMock.mockResolvedValueOnce([{ id: "tab-1", name: "Main", order: 0, isDefault: true, createdAt: "t", updatedAt: "t" }]);
    await expect(deleteDashboardTabForTenant(user, "tab-1")).rejects.toThrow("CANNOT_DELETE_LAST_TAB");
  });

  it("promotes the replacement tab to default when the deleted tab was the default", async () => {
    queryOneMock.mockResolvedValue(null);
    queryMock
      .mockResolvedValueOnce([
        { id: "tab-1", name: "Main", order: 0, isDefault: true, createdAt: "t", updatedAt: "t" },
        { id: "tab-2", name: "Sales", order: 1, isDefault: false, createdAt: "t", updatedAt: "t" },
      ])
      .mockResolvedValueOnce([{ id: "tab-2", name: "Sales", order: 1, isDefault: true, createdAt: "t", updatedAt: "t" }]);

    await deleteDashboardTabForTenant(user, "tab-1");

    const promoteCall = executeMock.mock.calls.find((call) => String(call[0]).includes('"isDefault" = true'));
    expect(promoteCall).toBeTruthy();
    expect(promoteCall![1]).toEqual(expect.arrayContaining(["tab-2", "user-1", "tenant-1"]));
  });
});

describe("saved dashboard layout snapshots", () => {
  const user = { id: "user-1", tenantId: "tenant-1" };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("captures every current widget's tab + grid position when saving a snapshot", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('insert into "DashboardLayoutSnapshot"')) {
        return { id: "snap-1", name: "Q1 Review", snapshot: [], createdAt: "t" };
      }
      return null;
    });
    queryMock.mockResolvedValueOnce([
      { id: "widget-1", tabId: "tab-1", w: 4, h: 3, x: 0, y: 0 },
      { id: "widget-2", tabId: "tab-2", w: 8, h: 3, x: 4, y: 0 },
    ]);

    await saveDashboardLayoutSnapshotForTenant(user, "Q1 Review");

    const insertCall = queryOneMock.mock.calls.find((call) => String(call[0]).includes('insert into "DashboardLayoutSnapshot"'));
    const snapshotArg = insertCall![1][4];
    // Real bug found while verifying WP10 (F18) against a real running worker (see
    // 25_AUDIT_REMEDIATION_PLAN.md WP11): a raw array parameter for a jsonb column is
    // misserialized by node-postgres, so the snapshot array must be JSON.stringify'd (via
    // jsonbParam) before being passed as a query parameter -- asserting on the parsed string
    // here (rather than the raw array) proves that actually happened, not just that the
    // in-memory computation of the snapshot itself was correct.
    expect(typeof snapshotArg).toBe("string");
    expect(JSON.parse(snapshotArg)).toEqual([
      { widgetId: "widget-1", tabId: "tab-1", layout: { x: 0, y: 0, w: 4, h: 3 } },
      { widgetId: "widget-2", tabId: "tab-2", layout: { x: 4, y: 0, w: 8, h: 3 } },
    ]);
  });

  it("rejects saving a snapshot with a blank name", async () => {
    await expect(saveDashboardLayoutSnapshotForTenant(user, "  ")).rejects.toThrow("SNAPSHOT_NAME_REQUIRED");
  });

  it("restores each entry, skipping a widgetId that no longer exists", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.includes('select snapshot from "DashboardLayoutSnapshot"')) {
        return {
          snapshot: [
            { widgetId: "widget-1", tabId: "tab-1", layout: { x: 0, y: 0, w: 4, h: 3 } },
            { widgetId: "widget-deleted", tabId: "tab-1", layout: { x: 4, y: 0, w: 4, h: 3 } },
          ],
        };
      }
      return null;
    });
    executeMock.mockImplementation(async (sql: string, values: unknown[]) => {
      // Simulate widget-deleted no longer matching any row.
      return (values as unknown[]).includes("widget-deleted") ? 0 : 1;
    });

    const result = await restoreDashboardLayoutSnapshotForTenant(user, "snap-1");
    expect(result).toEqual({ restored: 1, skipped: 1 });
  });

  it("throws when the snapshot doesn't exist", async () => {
    queryOneMock.mockResolvedValue(null);
    await expect(restoreDashboardLayoutSnapshotForTenant(user, "missing")).rejects.toThrow("SNAPSHOT_NOT_FOUND");
  });

  it("deletes a snapshot scoped to its owner", async () => {
    await deleteDashboardLayoutSnapshotForTenant(user, "snap-1");
    expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('delete from "DashboardLayoutSnapshot"'), ["snap-1", "user-1", "tenant-1"]);
  });
});

// Gap checklist Module 10's user workspace personalization item, "preferred dashboard" sub-item.
describe("setDefaultDashboardTabForTenant", () => {
  const user = { id: "user-1", tenantId: "tenant-1" };

  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("throws DASHBOARD_TAB_NOT_FOUND without clearing any other tab's default flag first", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.startsWith('select id from "DashboardTab"')) return null;
      return null;
    });
    await expect(setDefaultDashboardTabForTenant(user, "tab-x")).rejects.toThrow("DASHBOARD_TAB_NOT_FOUND");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("clears every other tab's isDefault flag, then sets exactly the target one", async () => {
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from "TenantFeature"')) return null;
      if (text.startsWith('select id from "DashboardTab"')) return { id: "tab-2" };
      if (text.startsWith('update "DashboardTab" set "isDefault" = true')) {
        return { id: "tab-2", name: "Sales", order: 1, isDefault: true, createdAt: "t", updatedAt: "t" };
      }
      return null;
    });

    const result = await setDefaultDashboardTabForTenant(user, "tab-2");

    expect(result.isDefault).toBe(true);
    const clearCall = executeMock.mock.calls.find((call) => String(call[0]).includes('set "isDefault" = false'));
    expect(clearCall).toBeTruthy();
    expect(clearCall![1]).toContain("user-1");
  });
});
