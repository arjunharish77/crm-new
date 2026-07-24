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
  withTransaction: vi.fn(async (_ctx, fn) => fn({ query: vi.fn() })),
}));

describe("direct Postgres tasks repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
  });

  it("lists tasks with tenant and owner scope", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "task-1", ownerId: "user-1", createdBy: "user-1" }])
      .mockResolvedValueOnce([{ id: "user-1", name: "User One" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { listTasksForTenant } = await import("@/lib/repositories/tasks-postgres");
    const result = await listTasksForTenant(
      { id: "user-1", tenantId: "tenant-1", role: { permissions: { recordAccess: "OWN" } } },
      { due: "upcoming" },
    );

    expect(result).toHaveLength(1);
    expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
    expect(queryMock.mock.calls[0][0]).toContain('"ownerId" = $2');
    expect(queryMock.mock.calls[0][0]).toContain('"dueAt" >= $3');
  });

  it("processes due reminders and clears reminderAt", async () => {
    queryMock.mockResolvedValueOnce([{ id: "task-1" }, { id: "task-2" }]);

    const { processDueTaskReminders } = await import("@/lib/repositories/tasks-postgres");
    const result = await processDueTaskReminders(new Date("2026-07-18T00:00:00.000Z"));

    expect(result).toEqual({ processed: [{ taskId: "task-1" }, { taskId: "task-2" }] });
    expect(executeMock).toHaveBeenCalledTimes(2);
    expect(executeMock.mock.calls[0][0]).toContain('"reminderAt" = null');
  });
});
