import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboardWidgetForTenantMock, queryMock, queryOneMock } = vi.hoisted(() => ({
  getDashboardWidgetForTenantMock: vi.fn(),
  queryMock: vi.fn(),
  queryOneMock: vi.fn(),
}));

vi.mock("@/lib/repositories/reports-dashboards-postgres", () => ({
  getDashboardWidgetForTenant: getDashboardWidgetForTenantMock,
}));
vi.mock("@/lib/db/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/query")>()),
  query: queryMock,
  queryOne: queryOneMock,
}));

import { getDashboardWidgetDataForTenant } from "@/lib/server/crm";

const user = { id: "user-1", tenantId: "tenant-1" };
const lastSql = (mock: typeof queryMock) => String(mock.mock.calls.at(-1)?.[0] ?? "");
const lastValues = (mock: typeof queryMock) => (mock.mock.calls.at(-1)?.[1] ?? []) as unknown[];

// Gap checklist Module 17, item 4 (cross-filtering/drill-down). Round-2 plan wave 3 (B1): widgets
// count in SQL over every record the viewer can see instead of the newest 500, so these check the
// query each widget sends (scope, cross-filter, field permissions) and how its rows are shaped.
// The counts themselves are checked against a real database in scripts/report-scope-smoke.ts.
describe("getDashboardWidgetDataForTenant cross-filtering", () => {
  beforeEach(() => {
    getDashboardWidgetForTenantMock.mockReset();
    queryMock.mockReset();
    queryOneMock.mockReset();
  });

  it("STAT/LEADS counts the viewer's leads in SQL when no cross-filter is active", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "LEADS" } });
    queryOneMock.mockResolvedValue({ count: 1201 });

    expect(await getDashboardWidgetDataForTenant(user, "w1")).toBe(1201);
    expect(lastSql(queryOneMock)).toMatch(/select count\(\*\)::int as count from \(select id from "Lead" where "tenantId" = \$1 and "mergedIntoId" is null\) r$/);
    expect(lastValues(queryOneMock)).toEqual(["tenant-1"]);
  });

  it("STAT/LEADS binds the cross-filter value against an allowed column", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "LEADS" } });
    queryOneMock.mockResolvedValue({ count: 2 });

    expect(await getDashboardWidgetDataForTenant(user, "w1", { module: "LEADS", field: "status", value: "NEW" })).toBe(2);
    expect(lastSql(queryOneMock)).toContain(`where coalesce("status", 'Unknown') = $2`);
    expect(lastValues(queryOneMock)).toEqual(["tenant-1", "NEW"]);
  });

  it("STAT/LEADS ignores a cross-filter targeting a different module", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "LEADS" } });
    queryOneMock.mockResolvedValue({ count: 3 });

    expect(await getDashboardWidgetDataForTenant(user, "w1", { module: "OPPORTUNITIES", field: "stage", value: "Enrolled" })).toBe(3);
    expect(lastSql(queryOneMock)).not.toContain("coalesce");
  });

  it("never puts an unexpected cross-filter field into the SQL", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "LEADS" } });
    queryOneMock.mockResolvedValue({ count: 0 });

    await getDashboardWidgetDataForTenant(user, "w1", { module: "LEADS", field: 'email" or 1=1 --', value: "Unknown" });
    expect(lastSql(queryOneMock)).toContain(`where coalesce(null::text, 'Unknown') = $2`);
    expect(lastSql(queryOneMock)).not.toContain("1=1");
  });

  it("treats a field hidden by field permissions as empty, as the masked list rows do", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "BAR", config: { module: "LEADS", groupBy: "source" } });
    queryMock.mockResolvedValue([{ group: "Unknown", value: 4 }]);
    const restricted = { ...user, role: { permissions: { fieldPermissions: { leads: { source: "hidden" } } } } };

    expect(await getDashboardWidgetDataForTenant(restricted as any, "w1")).toEqual([{ group: "Unknown", value: 4 }]);
    expect(lastSql(queryMock)).toContain(`coalesce(null::text, 'Unknown') as "group"`);
  });

  it("BAR/LEADS groups by the configured field and narrows under an active cross-filter", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "BAR", config: { module: "LEADS", groupBy: "source" } });
    queryMock.mockResolvedValue([{ group: "Website", value: 2 }, { group: "Referral", value: 1 }]);

    expect(await getDashboardWidgetDataForTenant(user, "w1")).toEqual([{ group: "Website", value: 2 }, { group: "Referral", value: 1 }]);
    expect(lastSql(queryMock)).toContain(`coalesce("source", 'Unknown') as "group"`);
    expect(lastSql(queryMock)).toContain(`order by max("createdAt") desc`);

    queryMock.mockResolvedValue([{ group: "Website", value: 1 }]);
    await getDashboardWidgetDataForTenant(user, "w1", { module: "LEADS", field: "status", value: "NEW" });
    expect(lastSql(queryMock)).toContain(`where coalesce("status", 'Unknown') = $2`);
    expect(lastValues(queryMock)).toEqual(["tenant-1", "NEW"]);
  });

  it("BAR/OPPORTUNITIES groups by stage name, sorted by stage order", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "BAR", config: { module: "OPPORTUNITIES" } });
    queryMock.mockResolvedValue([
      { group: "Enrolled", value: 1, order: 1 },
      { group: "Application", value: 2, order: 0 },
    ]);

    expect(await getDashboardWidgetDataForTenant(user, "w1")).toEqual([
      { group: "Application", value: 2 },
      { group: "Enrolled", value: 1 },
    ]);
    expect(lastSql(queryMock)).toContain(`left join "StageDefinition" sd on sd.id = o."stageId"`);
  });

  it("BAR/OPPORTUNITIES narrows to a single stage under an active cross-filter", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "BAR", config: { module: "OPPORTUNITIES" } });
    queryMock.mockResolvedValue([{ group: "Application", value: 2, order: 0 }]);

    expect(await getDashboardWidgetDataForTenant(user, "w1", { module: "OPPORTUNITIES", field: "stage", value: "Application" })).toEqual([{ group: "Application", value: 2 }]);
    expect(lastSql(queryMock)).toContain(`where coalesce(sd.name, 'Unassigned') = $2`);
    expect(lastValues(queryMock)).toEqual(["tenant-1", "Application"]);
  });

  it("STAT/OPPORTUNITIES combines the isWon/isLost widget filter with an active cross-filter", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({
      id: "w1",
      type: "STAT",
      config: { module: "OPPORTUNITIES", filters: { stage: { isWon: false, isLost: false } } },
    });
    queryOneMock.mockResolvedValue({ count: 2 });

    expect(await getDashboardWidgetDataForTenant(user, "w1", { module: "OPPORTUNITIES", field: "stage", value: "Application" })).toBe(2);
    const sql = lastSql(queryOneMock);
    expect(sql).toContain(`not coalesce(sd."isWon", false)`);
    expect(sql).toContain(`not (coalesce(sd."isClosed", false) and not coalesce(sd."isWon", false))`);
    expect(sql).toContain(`coalesce(sd.name, 'Unassigned') = $2`);
  });

  it("follows the viewer's record access (own records only for an OWN role)", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "LEADS" } });
    queryOneMock.mockResolvedValue({ count: 147 });
    const rep = { ...user, role: { permissions: { recordAccess: "OWN" } } };

    expect(await getDashboardWidgetDataForTenant(rep as any, "w1")).toBe(147);
    expect(lastSql(queryOneMock)).toContain(`("ownerId" = $2`);
    expect(lastValues(queryOneMock)).toEqual(["tenant-1", "user-1"]);
  });
});
