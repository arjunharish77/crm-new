import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/repositories/opportunities-postgres", () => ({
  listOpportunityTypesForTenant: vi.fn(async () => []),
}));

describe("direct Postgres activities repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists activities with tenant scope and whitelisted filters", async () => {
    queryOneMock.mockResolvedValueOnce({ count: 1 });
    queryMock
      .mockResolvedValueOnce([{ id: "activity-1", typeId: "type-1", createdBy: "user-1" }])
      .mockResolvedValueOnce([{ id: "type-1", name: "Call" }])
      .mockResolvedValueOnce([{ id: "user-1", name: "User One" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { listActivitiesForTenant } = await import("@/lib/repositories/activities-postgres");
    const result = await listActivitiesForTenant(
      { id: "user-1", tenantId: "tenant-1" },
      50,
      {
        conditions: [
          { field: "notes", operator: "contains", value: "call" },
          { field: "notes; drop table Activity", operator: "equals", value: "bad" },
        ],
      },
    );

    expect(result.meta.total).toBe(1);
    expect(queryOneMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryOneMock.mock.calls[0][0]).toContain('"notes" ilike $2');
    expect(queryOneMock.mock.calls[0][0]).not.toContain("drop table");
    expect(queryOneMock.mock.calls[0][1]).toEqual(["tenant-1", "%call%"]);
  });
});
