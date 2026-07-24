import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

const partnerUser = {
  id: "partner-1",
  tenantId: "tenant-a",
  role: { permissions: { isPartnerRole: true, recordAccess: "ALL" } },
};

const repUser = {
  id: "rep-1",
  tenantId: "tenant-a",
  role: { permissions: { recordAccess: "ALL" } },
};

describe("Partner owner-scoping in direct Postgres lead access", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("forces ownerId filtering for partner lead detail lookup even when recordAccess is ALL", async () => {
    queryOneMock.mockResolvedValueOnce({ id: "lead-own", ownerId: "partner-1" });
    queryMock.mockResolvedValueOnce([]);

    const { getLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await getLeadForTenant(partnerUser, "lead-own");

    expect(queryOneMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryOneMock.mock.calls[0][0]).toContain('"ownerId" = $2');
    expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-a", "partner-1", "lead-own"]);
  });

  it("forces ownerId filtering for partner lead lists", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock.mockResolvedValueOnce([{ id: "lead-own", ownerId: "partner-1" }]).mockResolvedValueOnce([]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    await listLeadsForTenant(partnerUser, 1, 50);

    expect(queryOneMock.mock.calls[0][0]).toContain('"ownerId" = $2');
    expect(queryMock.mock.calls[0][0]).toContain('"ownerId" = $2');
    expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-a", "partner-1"]);
  });

  it("does not owner-scope a non-partner rep with recordAccess ALL", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 2 });
    queryMock.mockResolvedValueOnce([{ id: "lead-own" }, { id: "lead-other" }]).mockResolvedValueOnce([]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    await listLeadsForTenant(repUser, 1, 50);

    expect(queryOneMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryOneMock.mock.calls[0][0]).not.toContain('"ownerId"');
    expect(queryMock.mock.calls[0][0]).not.toContain('where "tenantId" = $1 and "ownerId"');
    expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-a"]);
  });

  it("uses owner scope in update because update resolves the existing record through scoped lookup", async () => {
    queryOneMock
      .mockResolvedValueOnce({ id: "lead-own", name: "Own", ownerId: "partner-1", status: "NEW" })
      .mockResolvedValueOnce({ id: "lead-own", name: "Updated", ownerId: "partner-1", status: "NEW" });
    queryMock.mockResolvedValueOnce([]);

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await updateLeadForTenant(partnerUser, "lead-own", { name: "Updated" });

    expect(queryOneMock.mock.calls[0][0]).toContain('"ownerId" = $2');
    expect(queryOneMock.mock.calls[1][0]).toContain('where "tenantId" = $9 and id = $10');
    expect(executeMock).toHaveBeenCalled();
  });
});
