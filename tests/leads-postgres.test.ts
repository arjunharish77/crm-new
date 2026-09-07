import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

describe("direct Postgres leads repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists leads with tenant scope, owner scope, and whitelisted filters", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock
      .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await listLeadsForTenant(
      {
        id: "user-1",
        tenantId: "tenant-1",
        role: { permissions: { recordAccess: "OWN" } },
      },
      1,
      25,
      [
        { field: "name", operator: "contains", value: "Alpha" },
        { field: "name; drop table Lead", operator: "equals", value: "bad" },
      ],
    );

    expect(result.meta.total).toBe(1);
    expect(queryOneMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryOneMock.mock.calls[0][0]).toContain('"ownerId" = $2');
    expect(queryOneMock.mock.calls[0][0]).toContain('"name" ilike $3');
    expect(queryOneMock.mock.calls[0][0]).not.toContain("drop table");
    expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-1", "user-1", "%Alpha%"]);
  });

  it("returns an empty page when predictive score filters match no records", async () => {
    queryMock.mockResolvedValueOnce([]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await listLeadsForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      1,
      10,
      [{ field: "predictiveScoreBand", operator: "equals", value: "HOT" }],
    );

    expect(result).toEqual({ data: [], meta: { total: 0, page: 1, last_page: 1, limit: 10 } });
    expect(queryOneMock).not.toHaveBeenCalled();
  });

  it("enriches listed leads with a bulk pending-next-best-action count", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock
      .mockResolvedValueOnce([{ id: "lead-1", name: "Alpha", ownerId: "user-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ recordId: "lead-1", count: 3 }]);

    const { listLeadsForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await listLeadsForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      1,
      25,
    );

    expect(result.data[0].pendingNbaCount).toBe(3);
    const nbaCall = queryMock.mock.calls.find((call) => String(call[0]).includes('from "NextBestActionRecommendation"'));
    expect(nbaCall![0]).toContain("'PENDING'");
    expect(nbaCall![0]).toContain("group by");
  });

  describe("getLeadStatusCountsForTenant (gap checklist Module 17, item 25 -- view-level count chips)", () => {
    it("groups by status, scoped to the tenant and merged-away leads excluded", async () => {
      queryMock.mockResolvedValueOnce([
        { status: "NEW", count: 5 },
        { status: "QUALIFIED", count: 2 },
      ]);

      const { getLeadStatusCountsForTenant } = await import("@/lib/repositories/leads-postgres");
      const result = await getLeadStatusCountsForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } });

      expect(result).toEqual([
        { status: "NEW", count: 5 },
        { status: "QUALIFIED", count: 2 },
      ]);
      expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
      expect(queryMock.mock.calls[0][0]).toContain('"mergedIntoId" is null');
      expect(queryMock.mock.calls[0][0]).toContain("group by status");
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1"]);
    });

    it("scopes to the viewer's own leads for an OWN-record-access user, same as listLeadsForTenant", async () => {
      queryMock.mockResolvedValueOnce([{ status: "NEW", count: 1 }]);

      const { getLeadStatusCountsForTenant } = await import("@/lib/repositories/leads-postgres");
      await getLeadStatusCountsForTenant({ id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } });

      expect(queryMock.mock.calls[0][0]).toContain('"ownerId" = $2');
      expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "user-1"]);
    });
  });
});

// Gap checklist Module 10's tests bullet -- "inline edit audit logs" (Leads' inline status-cell
// edit calls this same updateLeadForTenant path).
describe("updateLeadForTenant audit logging", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    queryMock.mockResolvedValue([]);
    executeMock.mockResolvedValue(undefined);
  });

  it("writes an AuditLog UPDATE entry with a diff reflecting the changed status field", async () => {
    const existingRow = {
      id: "lead-1", tenantId: "tenant-1", name: "Alpha", email: "a@x.com", phone: null,
      company: null, source: null, status: "NEW", ownerId: null,
    };
    const updatedRow = { ...existingRow, status: "QUALIFIED" };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "Lead"')) return updatedRow;
      if (text.includes('from "Lead"')) return existingRow;
      return null;
    });

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await updateLeadForTenant({ id: "user-1", tenantId: "tenant-1" }, "lead-1", { status: "QUALIFIED" });

    const auditCall = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "AuditLog"'));
    expect(auditCall).toBeDefined();
    const values = auditCall![1];
    expect(values[3]).toBe("UPDATE");
    expect(values[4]).toBe("LEAD");
    expect(values[5]).toBe("lead-1");
    expect(values[8]).toMatchObject({ status: { before: "NEW", after: "QUALIFIED" } });
  });

  it("does not write an AuditLog entry when the update is a no-op (nothing actually changed)", async () => {
    const existingRow = {
      id: "lead-1", tenantId: "tenant-1", name: "Alpha", email: "a@x.com", phone: null,
      company: null, source: null, status: "NEW", ownerId: null,
    };
    queryOneMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.startsWith('update "Lead"')) return existingRow;
      if (text.includes('from "Lead"')) return existingRow;
      return null;
    });

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    await updateLeadForTenant({ id: "user-1", tenantId: "tenant-1" }, "lead-1", {});

    const auditCall = executeMock.mock.calls.find((call) => String(call[0]).includes('insert into "AuditLog"'));
    expect(auditCall).toBeDefined();
    const values = auditCall![1];
    expect(values[8]).toBeNull(); // diff is null when nothing changed
  });

  it("returns null and writes no audit entry when the lead doesn't exist for this tenant", async () => {
    queryOneMock.mockResolvedValue(null);

    const { updateLeadForTenant } = await import("@/lib/repositories/leads-postgres");
    const result = await updateLeadForTenant({ id: "user-1", tenantId: "tenant-1" }, "missing-lead", { status: "QUALIFIED" });

    expect(result).toBeNull();
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "AuditLog"'))).toBe(false);
  });
});
