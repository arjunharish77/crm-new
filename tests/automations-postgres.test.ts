import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const queryOneMock = vi.fn();
const executeMock = vi.fn();
const withAdvisoryLockMock = vi.fn(async (_client, _lockKey, callback) => callback());

vi.mock("@/lib/db/query", () => ({
  query: queryMock,
  queryOne: queryOneMock,
  execute: executeMock,
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: vi.fn(async (_user, callback) => callback(undefined)),
  withAdvisoryLock: withAdvisoryLockMock,
}));

describe("direct Postgres automations repository", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryOneMock.mockReset();
    executeMock.mockReset();
    withAdvisoryLockMock.mockClear();
  });

  it("lists automations with execution counts", async () => {
    queryMock
      .mockResolvedValueOnce([
        {
          id: "automation-1",
          name: "Admissions SLA",
          trigger: { type: "LEAD_CREATED" },
          workflow: { nodes: [], edges: [] },
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([{ automationId: "automation-1", count: 4 }]);

    const { listAutomationsForTenant } = await import("@/lib/repositories/automations-postgres");
    const result = await listAutomationsForTenant({ id: "user-1", tenantId: "tenant-1" });

    expect(result[0]._count.executions).toBe(4);
    expect(queryMock.mock.calls[0][0]).toContain('from "AutomationV2"');
    expect(queryMock.mock.calls[0][0]).toContain('"tenantId" = $1');
  });

  it("runs matching automations and records execution logs", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "automation-1",
        name: "Tag hot leads",
        trigger: { type: "LEAD_CREATED", conditions: [{ field: "source", operator: "equals", value: "FORM" }] },
        workflow: {
          nodes: [
            { id: "trigger", data: { type: "trigger" } },
            { id: "tag", data: { type: "tag_lead", value: "HOT" } },
          ],
          edges: [{ source: "trigger", target: "tag" }],
        },
        isActive: true,
      },
    ]);
    queryOneMock.mockResolvedValueOnce({ tags: ["FORM"] });
    executeMock.mockResolvedValue(undefined);

    const { runAutomationsForEvent } = await import("@/lib/repositories/automations-postgres");
    const result = await runAutomationsForEvent(
      { id: "user-1", tenantId: "tenant-1" },
      "LEAD_CREATED",
      "LEAD",
      "lead-1",
      { id: "lead-1", source: "FORM" },
    );

    expect(result).toEqual([{ automationId: "automation-1", status: "COMPLETED" }]);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('update "Lead" set'))).toBe(true);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "AutomationExecution"'))).toBe(true);
  });

  it("processes due queue jobs under an advisory lock", async () => {
    queryMock.mockResolvedValueOnce([
      {
        id: "queue-1",
        tenantId: "tenant-1",
        userId: "user-1",
        automationId: "automation-1",
        entityType: "LEAD",
        entityId: "lead-1",
        record: { id: "lead-1" },
        resumeNodeIds: ["notify"],
        attempts: 0,
      },
    ]);
    queryOneMock
      .mockResolvedValueOnce({ id: "user-1", tenantId: "tenant-1" })
      .mockResolvedValueOnce({
        id: "automation-1",
        tenantId: "tenant-1",
        isActive: true,
        trigger: { type: "LEAD_CREATED" },
        workflow: { nodes: [{ id: "notify", data: { type: "notify_user", title: "Follow up" } }], edges: [] },
      });
    executeMock.mockResolvedValue(undefined);

    const { processDueAutomationJobs } = await import("@/lib/repositories/automations-postgres");
    const result = await processDueAutomationJobs(10);

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(withAdvisoryLockMock).toHaveBeenCalled();
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "Notification"'))).toBe(true);
    expect(executeMock.mock.calls.some((call) => String(call[0]).includes('insert into "AutomationExecution"'))).toBe(true);
  });
});
