import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/db/access-mode", () => ({
  isPostgresMode: () => true,
}));

describe("direct Postgres reports and dashboards", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists dashboard widgets scoped to the current user and tenant", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "widget-1",
        title: "My Leads",
        type: "STAT",
        config: { module: "LEADS" },
        w: 1,
        h: 1,
        x: 0,
        y: 0,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const { listDashboardWidgetsForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
    const result = await listDashboardWidgetsForTenant({ id: "user-1", tenantId: "tenant-1" });

    expect(result[0].layout).toEqual({ w: 1, h: 1, x: 0, y: 0 });
    expect(queryMock.mock.calls[0][0]).toContain('"userId" = $1');
    expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $2');
    expect(queryMock.mock.calls[0][1]).toEqual(["user-1", "tenant-1"]);
  });

  it("creates custom reports without allowing saved-view records through this path", async () => {
    queryOneMock.mockResolvedValueOnce({
      id: "report-1",
      name: "Admissions Conversion",
      description: null,
      module: "LEADS",
      config: { queryDefinition: { root: "lead", fields: [{ object: "lead", field: "source" }] } },
      chartType: "TABLE",
      isPublic: false,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const { createCustomReportForTenant } = await import("@/lib/repositories/reports-dashboards-postgres");
    const result = await createCustomReportForTenant(
      { id: "user-1", tenantId: "tenant-1" },
      { name: " Admissions Conversion ", module: "leads", config: { queryDefinition: { root: "lead", fields: [{ object: "lead", field: "source" }] } } },
    );

    expect(result.id).toBe("report-1");
    expect(queryOneMock.mock.calls[0][0]).toContain('insert into "CustomReport"');
    expect(queryOneMock.mock.calls[0][1][4]).toBe("LEADS");
    expect(queryOneMock.mock.calls[0][1][6]).toBe("TABLE");
  });

  it("executes structured report queries from direct Postgres datasets", async () => {
    queryMock
      .mockResolvedValueOnce([
        { id: "lead-1", name: "Alpha", email: "alpha@example.com", source: "Website", status: "NEW", ownerId: "user-1" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
    const result = await executeReportQueryForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } },
      {
        root: "lead",
        fields: [{ object: "lead", field: "name", label: "Lead Name" }],
        filters: [{ object: "lead", field: "source", operator: "equals", value: "Website" }],
      },
    );

    expect(result.columns[0].label).toBe("Lead Name");
    expect(result.rows).toEqual([{ "lead.name": "Alpha" }]);
    expect(queryMock.mock.calls[0][0]).toContain('from "Lead"');
    expect(queryMock.mock.calls[0][0]).toContain('"ownerId" = $2');
  });
});
