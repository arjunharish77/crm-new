import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_user, callback) => callback(undefined)),
}));

describe("direct Postgres views repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
  });

  it("lists only tenant-visible saved views and supports multi-tab module matching", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "view-owned",
          name: "Owned",
          module: "LEADS",
          isPublic: false,
          createdBy: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          config: {
            scope: "PRIVATE",
            tabs: [{ id: "leads", name: "Leads", module: "LEADS", filters: { conditions: [], logic: "AND" } }],
          },
        },
        {
          id: "view-team",
          name: "Team Activity Desk",
          module: "LEADS",
          isPublic: true,
          createdBy: "admin-1",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          config: {
            scope: "SHARED",
            sharedTeamIds: ["team-1"],
            tabs: [{ id: "activities", name: "Activities", module: "ACTIVITIES", filters: { conditions: [], logic: "AND" } }],
          },
        },
        {
          id: "view-hidden",
          name: "Hidden",
          module: "TASKS",
          isPublic: false,
          createdBy: "admin-1",
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
          config: { scope: "PRIVATE" },
        },
      ])
      .mockResolvedValueOnce([{ roleId: "role-1", teamId: null }])
      .mockResolvedValueOnce([{ teamId: "team-1" }])
      .mockResolvedValueOnce([]);

    const { listSavedViewsForTenant } = await import("@/lib/repositories/views-postgres");
    const result = await listSavedViewsForTenant({ id: "user-1", tenantId: "tenant-1", roleId: null }, "ACTIVITIES");

    expect(result.map((view: any) => view.id)).toEqual(["view-team"]);
    expect(result[0].tabs[0].module).toBe("ACTIVITIES");
    expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1"]);
  });

  it("creates a default view and clears other defaults in the same tenant", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "old-default",
        config: { isDefault: true, tabs: [{ id: "default", name: "Default", module: "LEADS", filters: { conditions: [], logic: "AND" } }] },
      },
    ]);
    queryMock.mockResolvedValueOnce([]);
    queryOneMock.mockResolvedValueOnce({
      id: "new-view",
      name: "Admissions Desk",
      module: "LEADS",
      isPublic: true,
      createdBy: "admin-1",
      createdAt: "2026-01-04T00:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
      config: {
        isDefault: true,
        scope: "TENANT_DEFAULT",
        tabs: [{ id: "leads", name: "Leads", module: "LEADS", filters: { conditions: [], logic: "AND" } }],
      },
    });

    const { createSavedViewForTenant } = await import("@/lib/repositories/views-postgres");
    const result = await createSavedViewForTenant(
      { id: "admin-1", tenantId: "tenant-1" },
      {
        name: "Admissions Desk",
        module: "LEADS",
        filters: { conditions: [], logic: "AND" },
        isDefault: true,
        scope: "TENANT_DEFAULT",
      },
    );

    expect(result.id).toBe("new-view");
    expect(result.isDefault).toBe(true);
    expect(queryMock.mock.calls[0][1]).toEqual(["LEADS", "tenant-1"]);
    expect(queryMock.mock.calls[1][0]).toContain('update "CustomReport" set config = $1');
    expect(queryOneMock.mock.calls[0][0]).toContain('insert into "CustomReport"');
  });
});
