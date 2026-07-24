import { beforeEach, describe, expect, it, vi } from "vitest";

const leadRepoMocks = vi.hoisted(() => ({
  createLeadForTenant: vi.fn(),
  getLeadForTenant: vi.fn(),
  updateLeadForTenant: vi.fn(),
  listLeadsForTenant: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("@/lib/repositories/leads-postgres", () => leadRepoMocks);

import { createLeadForTenant, getLeadForTenant, updateLeadForTenant, listLeadsForTenant } from "@/lib/server/crm";

const tenantAUser = { id: "user-a1", tenantId: "tenant-a", name: "Alice", email: "alice@a.com", role: null };

beforeEach(() => {
  Object.values(leadRepoMocks).forEach((mock) => mock.mockReset());
});

describe("Lead CRUD server wrapper", () => {
  it("delegates create -> get -> update -> list to the direct Postgres repository", async () => {
    const createdLead = { id: "lead-1", name: "Acme Co", email: "acme@example.com", status: "NEW" };
    leadRepoMocks.createLeadForTenant.mockResolvedValueOnce(createdLead);
    leadRepoMocks.getLeadForTenant.mockResolvedValueOnce(createdLead);
    leadRepoMocks.updateLeadForTenant.mockResolvedValueOnce({ ...createdLead, name: "Acme Corp", status: "QUALIFIED" });
    leadRepoMocks.listLeadsForTenant.mockResolvedValueOnce({ data: [createdLead], meta: { total: 1, page: 1, last_page: 1, limit: 10 } });

    const created = await createLeadForTenant(tenantAUser, {
      name: "Acme Co",
      email: "acme@example.com",
      status: "NEW",
    });
    expect(created.id).toBe("lead-1");

    const fetched = await getLeadForTenant(tenantAUser, created.id);
    expect(fetched?.email).toBe("acme@example.com");

    const updated = await updateLeadForTenant(tenantAUser, created.id, {
      name: "Acme Corp",
      status: "QUALIFIED",
    });
    expect(updated?.name).toBe("Acme Corp");

    const list = await listLeadsForTenant(tenantAUser, 1, 10);
    expect(list.meta.total).toBe(1);
    expect(leadRepoMocks.createLeadForTenant).toHaveBeenCalledWith(tenantAUser, {
      name: "Acme Co",
      email: "acme@example.com",
      status: "NEW",
    });
    expect(leadRepoMocks.getLeadForTenant).toHaveBeenCalledWith(tenantAUser, "lead-1");
    expect(leadRepoMocks.updateLeadForTenant).toHaveBeenCalledWith(tenantAUser, "lead-1", {
      name: "Acme Corp",
      status: "QUALIFIED",
    });
    expect(leadRepoMocks.listLeadsForTenant).toHaveBeenCalledWith(tenantAUser, 1, 10, null);
  });
});
