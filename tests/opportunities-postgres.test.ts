import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_ctx, fn) => {
    const tx = { query: vi.fn().mockResolvedValue({ rows: [{ id: "opp-1", stageId: "stage-new" }] }) };
    return fn(tx);
  }),
}));

vi.mock("@/lib/repositories/leads-postgres", () => ({
  listLeadsForTenant: vi.fn(async () => ({ data: [{ id: "lead-1", name: "Alpha Lead" }] })),
}));

describe("direct Postgres opportunities repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists opportunities with tenant/type scope and whitelisted filters", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "opp-1", leadId: "lead-1", opportunityTypeId: "type-1", stageId: "stage-1", title: "MBA App" }])
      .mockResolvedValueOnce([{ id: "type-1", name: "University 1" }])
      .mockResolvedValueOnce([{ id: "stage-1", opportunityTypeId: "type-1", name: "Application", order: 1 }])
      .mockResolvedValueOnce([]);

    const { listOpportunitiesForTenantByType } = await import("@/lib/repositories/opportunities-postgres");
    const result = await listOpportunitiesForTenantByType(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      20,
      "type-1",
      [
        { field: "title", operator: "contains", value: "MBA" },
        { field: "title; drop table Opportunity", operator: "equals", value: "bad" },
      ],
    );

    expect(result.data).toHaveLength(1);
    expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryMock.mock.calls[0][0]).toContain('"opportunityTypeId" = $2');
    expect(queryMock.mock.calls[0][0]).toContain('"title" ilike $3');
    expect(queryMock.mock.calls[0][0]).not.toContain("drop table");
    expect(queryMock.mock.calls[0][1]).toEqual(["tenant-1", "type-1", "%MBA%", 20]);
  });

  it("short-circuits when predictive score filters match no opportunities", async () => {
    queryMock.mockResolvedValueOnce([]);

    const { listOpportunitiesForTenantByType } = await import("@/lib/repositories/opportunities-postgres");
    const result = await listOpportunitiesForTenantByType(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      10,
      null,
      [{ field: "predictiveScoreBand", operator: "equals", value: "HOT" }],
    );

    expect(result).toEqual({ data: [], meta: { total: 0, page: 1, last_page: 1, limit: 10 } });
  });
});
