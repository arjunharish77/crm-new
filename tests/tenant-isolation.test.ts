import { beforeEach, describe, expect, it, vi } from "vitest";

const leadRepoMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  getLeadForTenant: vi.fn(),
  listLeadsForTenant: vi.fn(),
}));

vi.mock("@/lib/repositories/leads-postgres", () => leadRepoMocks);

import { getLeadForTenant, listLeadsForTenant } from "@/lib/server/crm";

const tenantAUser = { id: "user-a1", tenantId: "tenant-a" };
const tenantBUser = { id: "user-b1", tenantId: "tenant-b" };

beforeEach(() => {
  Object.values(leadRepoMocks).forEach((mock) => mock.mockReset());
});

describe("Tenant isolation wrapper boundary", () => {
  it("delegates tenant A record lookup to the direct repository with the tenant-bearing user", async () => {
    leadRepoMocks.getLeadForTenant.mockResolvedValueOnce(null);

    expect(await getLeadForTenant(tenantAUser, "lead-b1")).toBeNull();
    expect(leadRepoMocks.getLeadForTenant).toHaveBeenCalledWith(tenantAUser, "lead-b1");
  });

  it("delegates tenant B record lookup to the direct repository with the tenant-bearing user", async () => {
    leadRepoMocks.getLeadForTenant.mockResolvedValueOnce(null);

    expect(await getLeadForTenant(tenantBUser, "lead-a1")).toBeNull();
    expect(leadRepoMocks.getLeadForTenant).toHaveBeenCalledWith(tenantBUser, "lead-a1");
  });

  it("returns repository-owned tenant scoped results for list calls", async () => {
    leadRepoMocks.listLeadsForTenant.mockResolvedValueOnce({
      data: [{ id: "lead-a1", tenantId: "tenant-a" }],
      meta: { total: 1, page: 1, last_page: 1, limit: 50 },
    });

    const list = await listLeadsForTenant(tenantAUser, 1, 50);
    expect(list.data).toEqual([{ id: "lead-a1", tenantId: "tenant-a" }]);
    expect(leadRepoMocks.listLeadsForTenant).toHaveBeenCalledWith(tenantAUser, 1, 50, null);
  });
});
