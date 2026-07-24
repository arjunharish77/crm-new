import { beforeEach, describe, expect, it, vi } from "vitest";

const pgTasksMock = {
  listTasksForTenant: vi.fn(),
  getTaskForTenant: vi.fn(),
  createTaskForTenant: vi.fn(),
  updateTaskForTenant: vi.fn(),
  deleteTaskForTenant: vi.fn(),
  processDueTaskReminders: vi.fn(),
};

vi.mock("@/lib/repositories/tasks-postgres", () => pgTasksMock);

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT, role: { permissions: { recordAccess: "ALL" } } };

describe("Tasks server API", () => {
  beforeEach(() => {
    Object.values(pgTasksMock).forEach((mock) => mock.mockReset());
  });

  it("creates a task through the direct Postgres repository", async () => {
    pgTasksMock.createTaskForTenant.mockResolvedValueOnce({ id: "task-1", title: "Call lead", ownerId: adminUser.id });

    const { createTaskForTenant } = await import("@/lib/server/tasks");
    const task = await createTaskForTenant(adminUser, { title: "Call lead", priority: "HIGH" });

    expect(task.title).toBe("Call lead");
    expect(pgTasksMock.createTaskForTenant).toHaveBeenCalledWith(adminUser, { title: "Call lead", priority: "HIGH" });
  });

  it("lists tasks through the direct Postgres repository", async () => {
    pgTasksMock.listTasksForTenant.mockResolvedValueOnce([{ id: "task-1", title: "Mine" }]);

    const { listTasksForTenant } = await import("@/lib/server/tasks");
    const tasks = await listTasksForTenant(adminUser, { status: "OPEN" });

    expect(tasks).toEqual([{ id: "task-1", title: "Mine" }]);
    expect(pgTasksMock.listTasksForTenant).toHaveBeenCalledWith(adminUser, { status: "OPEN" });
  });

  it("updates tasks through the direct Postgres repository", async () => {
    pgTasksMock.updateTaskForTenant.mockResolvedValueOnce({ id: "task-1", status: "COMPLETED" });

    const { updateTaskForTenant } = await import("@/lib/server/tasks");
    const updated = await updateTaskForTenant(adminUser, "task-1", { status: "COMPLETED" });

    expect(updated?.status).toBe("COMPLETED");
    expect(pgTasksMock.updateTaskForTenant).toHaveBeenCalledWith(adminUser, "task-1", { status: "COMPLETED" });
  });

  it("processes reminders through the direct Postgres repository", async () => {
    const now = new Date("2026-01-02T00:00:00.000Z");
    pgTasksMock.processDueTaskReminders.mockResolvedValueOnce({ processed: [{ taskId: "task-1" }] });

    const { processDueTaskReminders } = await import("@/lib/server/tasks");
    const result = await processDueTaskReminders(now);

    expect(result.processed).toEqual([{ taskId: "task-1" }]);
    expect(pgTasksMock.processDueTaskReminders).toHaveBeenCalledWith(now);
  });
});
