import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboardWidgetForTenantMock, listLeadsForTenantMock, listOpportunitiesForTenantMock } = vi.hoisted(() => ({
  getDashboardWidgetForTenantMock: vi.fn(),
  listLeadsForTenantMock: vi.fn(),
  listOpportunitiesForTenantMock: vi.fn(),
}));

vi.mock("@/lib/repositories/reports-dashboards-postgres", () => ({
  getDashboardWidgetForTenant: getDashboardWidgetForTenantMock,
}));
vi.mock("@/lib/repositories/leads-postgres", () => ({
  listLeadsForTenant: listLeadsForTenantMock,
}));
vi.mock("@/lib/repositories/opportunities-postgres", () => ({
  listOpportunitiesForTenant: listOpportunitiesForTenantMock,
}));

import { getDashboardWidgetDataForTenant } from "@/lib/server/crm";

const user = { id: "user-1", tenantId: "tenant-1" };

const LEADS = {
  data: [
    { id: "lead-1", status: "NEW", source: "Website" },
    { id: "lead-2", status: "QUALIFIED", source: "Website" },
    { id: "lead-3", status: "NEW", source: "Referral" },
  ],
  meta: { total: 3, page: 1, last_page: 1, limit: 500 },
};

const OPPORTUNITIES = {
  data: [
    { id: "opp-1", stage: { name: "Application", order: 0, isWon: false, isClosed: false } },
    { id: "opp-2", stage: { name: "Application", order: 0, isWon: false, isClosed: false } },
    { id: "opp-3", stage: { name: "Enrolled", order: 1, isWon: true, isClosed: true } },
  ],
  meta: { total: 3, page: 1, last_page: 1, limit: 500 },
};

// Gap checklist Module 17, item 4 (advanced dashboard builder: cross-filtering/drill-down).
// getDashboardWidgetDataForTenant had zero test coverage before this pass (confirmed by grep)
// -- these cover both the pre-existing STAT/BAR behavior (unchanged when no filter is active)
// and the new cross-filter narrowing, so a regression in either direction would be caught.
describe("getDashboardWidgetDataForTenant cross-filtering", () => {
  beforeEach(() => {
    getDashboardWidgetForTenantMock.mockReset();
    listLeadsForTenantMock.mockReset();
    listOpportunitiesForTenantMock.mockReset();
  });

  it("STAT/LEADS returns the unfiltered total when no cross-filter is active", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "LEADS" } });
    listLeadsForTenantMock.mockResolvedValue(LEADS);

    const result = await getDashboardWidgetDataForTenant(user, "w1");
    expect(result).toBe(3);
  });

  it("STAT/LEADS narrows to the cross-filtered count when the filter's module matches", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "LEADS" } });
    listLeadsForTenantMock.mockResolvedValue(LEADS);

    const result = await getDashboardWidgetDataForTenant(user, "w1", { module: "LEADS", field: "status", value: "NEW" });
    expect(result).toBe(2);
  });

  it("STAT/LEADS ignores a cross-filter targeting a different module", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "LEADS" } });
    listLeadsForTenantMock.mockResolvedValue(LEADS);

    const result = await getDashboardWidgetDataForTenant(user, "w1", { module: "OPPORTUNITIES", field: "stage", value: "Enrolled" });
    expect(result).toBe(3);
  });

  it("BAR/LEADS groups by the configured field and narrows under an active cross-filter", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "BAR", config: { module: "LEADS", groupBy: "source" } });
    listLeadsForTenantMock.mockResolvedValue(LEADS);

    const unfiltered = await getDashboardWidgetDataForTenant(user, "w1");
    expect(unfiltered).toEqual(expect.arrayContaining([{ group: "Website", value: 2 }, { group: "Referral", value: 1 }]));

    const filtered = await getDashboardWidgetDataForTenant(user, "w1", { module: "LEADS", field: "status", value: "NEW" });
    expect(filtered).toEqual(expect.arrayContaining([{ group: "Website", value: 1 }, { group: "Referral", value: 1 }]));
  });

  it("STAT/OPPORTUNITIES combines the existing isWon/isLost widget filter with an active cross-filter", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "STAT", config: { module: "OPPORTUNITIES", filters: { stage: { isWon: false } } } });
    listOpportunitiesForTenantMock.mockResolvedValue(OPPORTUNITIES);

    const withoutCrossFilter = await getDashboardWidgetDataForTenant(user, "w1");
    expect(withoutCrossFilter).toBe(2); // isWon:false excludes the Enrolled/won opportunity

    const withCrossFilter = await getDashboardWidgetDataForTenant(user, "w1", { module: "OPPORTUNITIES", field: "stage", value: "Application" });
    expect(withCrossFilter).toBe(2); // both remaining open opportunities are already in Application
  });

  it("BAR/OPPORTUNITIES groups by stage name, sorted by stage order, unaffected when no filter is active", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "BAR", config: { module: "OPPORTUNITIES" } });
    listOpportunitiesForTenantMock.mockResolvedValue(OPPORTUNITIES);

    const result = await getDashboardWidgetDataForTenant(user, "w1");
    expect(result).toEqual([{ group: "Application", value: 2 }, { group: "Enrolled", value: 1 }]);
  });

  it("BAR/OPPORTUNITIES narrows to a single stage under an active cross-filter", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue({ id: "w1", type: "BAR", config: { module: "OPPORTUNITIES" } });
    listOpportunitiesForTenantMock.mockResolvedValue(OPPORTUNITIES);

    const result = await getDashboardWidgetDataForTenant(user, "w1", { module: "OPPORTUNITIES", field: "stage", value: "Enrolled" });
    expect(result).toEqual([{ group: "Enrolled", value: 1 }]);
  });

  it("returns null for a widget the viewer can't see, without ever fetching data", async () => {
    getDashboardWidgetForTenantMock.mockResolvedValue(null);
    const result = await getDashboardWidgetDataForTenant(user, "missing");
    expect(result).toBeNull();
    expect(listLeadsForTenantMock).not.toHaveBeenCalled();
    expect(listOpportunitiesForTenantMock).not.toHaveBeenCalled();
  });
});
