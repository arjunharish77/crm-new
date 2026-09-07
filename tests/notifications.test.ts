import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { createUserNotification } from "@/lib/server/notifications";

// Gap checklist Module 10's "user workspace personalization" item, "notification preferences"
// sub-item -- a real category per notification, checked against the target user's own mute list
// at CREATION time (not just filtered at display time).
describe("createUserNotification", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
  });

  it("inserts normally when no category is given (uncategorized, always delivered)", async () => {
    await createUserNotification({ tenantId: "tenant-1", userId: "user-1", title: "Hi", message: "msg" });
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('insert into "Notification"'), expect.arrayContaining(["tenant-1", "user-1", "Hi", "msg"]));
  });

  it("inserts with the category stored as a real column", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ preferences: {} });
    await createUserNotification({ tenantId: "tenant-1", userId: "user-1", title: "Task due", message: "msg", category: "TASKS" });
    const call = dbMocks.execute.mock.calls[0];
    expect(call[1]).toContain("TASKS");
  });

  it("skips the insert entirely when the target user has muted this category", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ preferences: { notifications: { mutedCategories: ["TASKS"] } } });
    await createUserNotification({ tenantId: "tenant-1", userId: "user-1", title: "Task due", message: "msg", category: "TASKS" });
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it("still delivers a different, non-muted category", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ preferences: { notifications: { mutedCategories: ["TASKS"] } } });
    await createUserNotification({ tenantId: "tenant-1", userId: "user-1", title: "Reassigned", message: "msg", category: "REASSIGNMENT" });
    expect(dbMocks.execute).toHaveBeenCalled();
  });

  it("never checks preferences (or gets muted) for SECURITY -- a hard floor, not a preference", async () => {
    await createUserNotification({ tenantId: "tenant-1", userId: "user-1", title: "Suspicious login", message: "msg", category: "SECURITY" });
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
    expect(dbMocks.execute).toHaveBeenCalled();
  });

  it("delivers normally when the user has no preferences row at all yet", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await createUserNotification({ tenantId: "tenant-1", userId: "user-1", title: "Task due", message: "msg", category: "TASKS" });
    expect(dbMocks.execute).toHaveBeenCalled();
  });
});
