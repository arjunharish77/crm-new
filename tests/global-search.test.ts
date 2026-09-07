import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: vi.fn(),
  execute: vi.fn(),
}));

const TENANT_USER = { id: "user-1", tenantId: "tenant-1" };

describe("searchTenantData", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("returns empty groups for every module without querying the database on a blank term", async () => {
    const { searchTenantData } = await import("@/lib/server/crm");
    const results = await searchTenantData(TENANT_USER, "   ");

    expect(results).toEqual({ leads: [], opportunities: [], activities: [], tasks: [], partners: [] });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("searches leads, opportunities, activities, tasks, and partners in parallel and maps friendly fields", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "lead-1", name: "Ada Lovelace", company: "Acme" }])
      .mockResolvedValueOnce([{ id: "opp-1", title: "Acme Renewal", amount: "5000" }])
      .mockResolvedValueOnce([{ id: "act-1", notes: "Called Acme about renewal" }])
      .mockResolvedValueOnce([{ id: "task-1", title: "Follow up with Acme" }])
      .mockResolvedValueOnce([{ id: "partner-1", legalBusinessName: "Acme Partners LLC", name: "Grace Hopper", email: "grace@acme.com" }]);

    const { searchTenantData } = await import("@/lib/server/crm");
    const results = await searchTenantData(TENANT_USER, "acme");

    expect(results.leads).toEqual([{ id: "lead-1", type: "lead", name: "Ada Lovelace", company: "Acme" }]);
    expect(results.opportunities).toEqual([{ id: "opp-1", type: "opportunity", title: "Acme Renewal", amount: 5000 }]);
    expect(results.activities).toEqual([{ id: "act-1", type: "activity", notes: "Called Acme about renewal" }]);
    expect(results.tasks).toEqual([{ id: "task-1", type: "task", title: "Follow up with Acme" }]);
    expect(results.partners).toEqual([{ id: "partner-1", type: "partner", name: "Grace Hopper", company: "Acme Partners LLC" }]);

    // Every query must stay tenant-scoped -- the tenant id is always the second bound param.
    expect(queryMock).toHaveBeenCalledTimes(5);
    queryMock.mock.calls.forEach((call) => {
      expect(call[1]).toEqual(["%acme%", "tenant-1"]);
    });
  });

  it("falls back to the partner's legal business name when the linked user has no name", async () => {
    queryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "partner-1", legalBusinessName: "Acme Partners LLC", name: null, email: "grace@acme.com" }]);

    const { searchTenantData } = await import("@/lib/server/crm");
    const results = await searchTenantData(TENANT_USER, "acme");

    expect(results.partners).toEqual([{ id: "partner-1", type: "partner", name: "Acme Partners LLC", company: "Acme Partners LLC" }]);
  });
});
