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
});
