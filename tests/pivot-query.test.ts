import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/db/access-mode", () => ({
  isPostgresMode: () => true,
}));

// Gap checklist Module 17's chart-library expansion, "pivot table" sub-item. Deliberately reuses
// the exact fetchDataSets/buildJoinContexts/matchesFilters helpers executeMetricQueryForTenant
// already reuses -- this exercises the join engine with two simultaneous group-by dimensions
// (row + column) rather than the metric layer's single groupBy.
describe("executePivotQueryForTenant", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("aggregates COUNT into a row x column grid from a single lead-rooted dataset", async () => {
    queryMock.mockResolvedValueOnce([
      { id: "lead-1", source: "Website", status: "NEW", ownerId: "user-1" },
      { id: "lead-2", source: "Website", status: "QUALIFIED", ownerId: "user-1" },
      { id: "lead-3", source: "Referral", status: "NEW", ownerId: "user-1" },
      { id: "lead-4", source: "Website", status: "NEW", ownerId: "user-1" },
    ]);

    const { executePivotQueryForTenant } = await import("@/lib/server/reporting-query");
    const result = await executePivotQueryForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      {
        root: "lead",
        aggregation: "COUNT",
        rowGroupBy: { object: "lead", field: "source" },
        columnGroupBy: { object: "lead", field: "status" },
      },
    );

    expect(result.rowLabels).toEqual(["Website", "Referral"]);
    expect(result.columnLabels).toEqual(["NEW", "QUALIFIED"]);
    expect(result.cells.Website.NEW).toBe(2);
    expect(result.cells.Website.QUALIFIED).toBe(1);
    expect(result.cells.Referral.NEW).toBe(1);
    expect(result.cells.Referral.QUALIFIED).toBe(0);
  });

  it("aggregates SUM of a numeric field into the grid", async () => {
    queryMock.mockResolvedValueOnce([
      { id: "opp-1", stageId: "stage-open", ownerId: "user-1", amount: 100 },
      { id: "opp-2", stageId: "stage-open", ownerId: "user-1", amount: 50 },
      { id: "opp-3", stageId: "stage-won", ownerId: "user-1", amount: 200 },
    ]);

    const { executePivotQueryForTenant } = await import("@/lib/server/reporting-query");
    const result = await executePivotQueryForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "ALL" } } },
      {
        root: "opportunity",
        aggregation: "SUM",
        aggregateField: { object: "opportunity", field: "amount" },
        rowGroupBy: { object: "opportunity", field: "stageId" },
        columnGroupBy: { object: "opportunity", field: "ownerId" },
      },
    );

    expect(result.cells["stage-open"]["user-1"]).toBe(150);
    expect(result.cells["stage-won"]["user-1"]).toBe(200);
  });

  it("rejects an unsupported root", async () => {
    const { executePivotQueryForTenant } = await import("@/lib/server/reporting-query");
    await expect(executePivotQueryForTenant(
      { id: "user-1", tenantId: "tenant-1" },
      { root: "task" as any, aggregation: "COUNT", rowGroupBy: { object: "lead", field: "source" }, columnGroupBy: { object: "lead", field: "status" } },
    )).rejects.toThrow("Unsupported metric root");
  });

  it("rejects a non-COUNT aggregation with no aggregateField", async () => {
    const { executePivotQueryForTenant } = await import("@/lib/server/reporting-query");
    await expect(executePivotQueryForTenant(
      { id: "user-1", tenantId: "tenant-1" },
      { root: "lead", aggregation: "AVG", rowGroupBy: { object: "lead", field: "source" }, columnGroupBy: { object: "lead", field: "status" } },
    )).rejects.toThrow("aggregateField is required");
  });

  it("rejects a field not in FIELD_CATALOG", async () => {
    const { executePivotQueryForTenant } = await import("@/lib/server/reporting-query");
    await expect(executePivotQueryForTenant(
      { id: "user-1", tenantId: "tenant-1" },
      { root: "lead", aggregation: "COUNT", rowGroupBy: { object: "lead", field: "notAField" }, columnGroupBy: { object: "lead", field: "status" } },
    )).rejects.toThrow("Unsupported report field");
  });
});
