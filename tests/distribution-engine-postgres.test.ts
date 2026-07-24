import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

describe("direct Postgres distribution engine", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("round-robins matching rules and updates the assigned lead", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "rule-1",
          name: "Web lead rule",
          entityType: "LEAD",
          priority: 10,
          isActive: true,
          conditions: { source: "Website", __roundRobinCursor: 0 },
          strategy: "ROUND_ROBIN",
          targetGroupId: null,
          targetUserIds: ["user-1", "user-2"],
        },
      ])
      .mockResolvedValueOnce([
        { id: "user-1", name: "A", email: "a@example.com" },
        { id: "user-2", name: "B", email: "b@example.com" },
      ]);
    executeMock.mockResolvedValue(1);

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord(
      { id: "admin-1", tenantId: "tenant-1" },
      "LEAD",
      "lead-1",
      { source: "Website" },
    );

    expect(result.assignedUserId).toBe("user-2");
    expect(executeMock.mock.calls[0][0]).toContain('update "AssignmentRule"');
    expect(executeMock.mock.calls[0][1][0]).toMatchObject({ __roundRobinCursor: 1 });
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('update "Lead" set "ownerId"'))).toBe(true);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "AuditLog"'))).toBe(true);
  });

  it("chooses the least-loaded owner for load-based rules", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "rule-2",
          name: "India applications",
          entityType: "OPPORTUNITY",
          priority: 20,
          isActive: true,
          conditions: { country: "India" },
          strategy: "LOAD_BASED",
          targetGroupId: null,
          targetUserIds: ["user-1", "user-2"],
        },
      ])
      .mockResolvedValueOnce([
        { id: "user-1", name: "A", email: "a@example.com" },
        { id: "user-2", name: "B", email: "b@example.com" },
      ])
      .mockResolvedValueOnce([{ ownerId: "user-1" }, { ownerId: "user-1" }]);
    executeMock.mockResolvedValue(1);

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord(
      { id: "admin-1", tenantId: "tenant-1" },
      "OPPORTUNITY",
      "opp-1",
      { country: "India" },
    );

    expect(result.assignedUserId).toBe("user-2");
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('update "Opportunity" set "ownerId"'))).toBe(true);
  });

  it("uses fallback owner when a matched rule has no available target users", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "rule-3",
        name: "Fallback rule",
        entityType: "LEAD",
        priority: 1,
        isActive: true,
        conditions: { source: "Partner", __fallbackUserId: "fallback-1" },
        strategy: "ROUND_ROBIN",
        targetGroupId: null,
        targetUserIds: [],
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ id: "fallback-1", name: "Fallback", email: "fallback@example.com" });
    executeMock.mockResolvedValue(1);

    const { distributeRecord } = await import("@/lib/server/distribution-engine");
    const result = await distributeRecord(
      { id: "admin-1", tenantId: "tenant-1" },
      "LEAD",
      "lead-2",
      { source: "Partner" },
    );

    expect(result.assignedUserId).toBe("fallback-1");
    expect(result.reason).toContain("used fallback owner");
  });
});
