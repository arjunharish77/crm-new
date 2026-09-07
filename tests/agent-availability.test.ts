import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);

import {
  getMyAvailabilityForTenant,
  setMyAvailabilityStatus,
  listAgentAvailabilityForTenant,
  supervisorUpdateAgentAvailability,
} from "@/lib/server/agent-availability";

const user = { id: "user-1", tenantId: "tenant-a" };
const admin = { id: "admin-1", tenantId: "tenant-a", isTenantAdmin: true };

describe("agent availability and capacity", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  describe("getMyAvailabilityForTenant", () => {
    it("returns a synthetic OFFLINE default when no row exists yet", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      const result = await getMyAvailabilityForTenant(user);
      expect(result).toMatchObject({ status: "OFFLINE", userId: "user-1" });
      expect(dbMocks.execute).not.toHaveBeenCalled();
    });

    it("returns the real row when one exists", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ userId: "user-1", status: "ONLINE" });
      const result = await getMyAvailabilityForTenant(user);
      expect(result.status).toBe("ONLINE");
    });
  });

  describe("setMyAvailabilityStatus", () => {
    it("throws on an invalid status value", async () => {
      await expect(setMyAvailabilityStatus(user, "AWAY")).rejects.toThrow("INVALID_STATUS");
    });

    it("upserts the caller's own row, attributing the change to themselves", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ userId: "user-1", status: "BREAK" });
      await setMyAvailabilityStatus(user, "BREAK", "Lunch");
      const insertCall = dbMocks.queryOne.mock.calls[0];
      // tenantId, userId, status, reason positions
      expect(insertCall[1][1]).toBe("tenant-a");
      expect(insertCall[1][2]).toBe("user-1");
      expect(insertCall[1][3]).toBe("BREAK");
      expect(insertCall[1][4]).toBe("Lunch");
      expect(insertCall[1][5]).toBe("user-1"); // lastStatusChangedBy = self
    });
  });

  describe("listAgentAvailabilityForTenant", () => {
    it("throws FORBIDDEN for a non-admin caller", async () => {
      await expect(listAgentAvailabilityForTenant(user)).rejects.toThrow("FORBIDDEN");
    });

    it("computes callsToday/openTaskWorkload and cap flags, defaulting users with no availability row", async () => {
      dbMocks.query
        .mockResolvedValueOnce([
          { id: "user-1", name: "Jane", email: "jane@example.com", managerId: null },
          { id: "user-2", name: "Sam", email: "sam@example.com", managerId: null },
        ])
        .mockResolvedValueOnce([{ userId: "user-1", status: "ONLINE", dailyCallCap: 5, maxSimultaneousAssignments: 2, workingHours: {} }])
        .mockResolvedValueOnce([{ agentId: "user-1", count: 5 }])
        .mockResolvedValueOnce([{ ownerId: "user-1", count: 1 }]);

      const result = await listAgentAvailabilityForTenant(admin);

      const jane = result.find((r) => r.userId === "user-1")!;
      expect(jane.callsToday).toBe(5);
      expect(jane.isOverCallCap).toBe(true);
      expect(jane.openTaskWorkload).toBe(1);
      expect(jane.isOverAssignmentCap).toBe(false);

      const sam = result.find((r) => r.userId === "user-2")!;
      expect(sam.status).toBe("OFFLINE");
      expect(sam.callsToday).toBe(0);
      expect(sam.isOverCallCap).toBe(false);
    });
  });

  describe("supervisorUpdateAgentAvailability", () => {
    it("throws USER_NOT_FOUND when the target isn't a tenant user", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(supervisorUpdateAgentAvailability(admin, "ghost", { status: "ONLINE" })).rejects.toThrow("USER_NOT_FOUND");
    });

    it("throws FORBIDDEN for a caller who is neither admin nor the target's manager", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "target-1", managerId: "someone-else" });
      await expect(supervisorUpdateAgentAvailability(user, "target-1", { status: "ONLINE" })).rejects.toThrow("FORBIDDEN");
    });

    it("allows the target's manager to override", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "target-1", managerId: user.id })
        .mockResolvedValueOnce(null) // existing availability row lookup
        .mockResolvedValueOnce({ userId: "target-1", status: "OFFLINE" });

      const result = await supervisorUpdateAgentAvailability(user, "target-1", { status: "OFFLINE", statusReason: "Escalated" });
      expect(result.status).toBe("OFFLINE");
    });

    it("allows a tenant admin regardless of manager relationship", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "target-1", managerId: "nobody-related" })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ userId: "target-1", status: "ONLINE" });

      const result = await supervisorUpdateAgentAvailability(admin, "target-1", { status: "ONLINE" });
      expect(result.status).toBe("ONLINE");
    });

    it("preserves fields not included in a partial patch instead of resetting them", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "target-1", managerId: null })
        .mockResolvedValueOnce({ userId: "target-1", status: "ONLINE", statusReason: "In a meeting", workingHours: { enabled: true }, dailyCallCap: 10, maxSimultaneousAssignments: 3 })
        .mockResolvedValueOnce({ userId: "target-1", status: "ONLINE", dailyCallCap: 20 });

      await supervisorUpdateAgentAvailability(admin, "target-1", { dailyCallCap: 20 });

      const upsertCall = dbMocks.queryOne.mock.calls[2];
      // status, statusReason, workingHours, dailyCallCap, maxSimultaneousAssignments
      expect(upsertCall[1][3]).toBe("ONLINE"); // status preserved
      expect(upsertCall[1][4]).toBe("In a meeting"); // statusReason preserved
      expect(upsertCall[1][6]).toBe(20); // dailyCallCap updated
      expect(upsertCall[1][7]).toBe(3); // maxSimultaneousAssignments preserved
    });

    it("throws INVALID_STATUS for a bad status value in the patch", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "target-1", managerId: null });
      await expect(supervisorUpdateAgentAvailability(admin, "target-1", { status: "AWAY" })).rejects.toThrow("INVALID_STATUS");
    });

    it("writes an audit log entry for the override", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "target-1", managerId: null })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ userId: "target-1", status: "ONLINE" });

      await supervisorUpdateAgentAvailability(admin, "target-1", { status: "ONLINE" });

      expect(crmMocks.createAuditLog).toHaveBeenCalledWith(admin, "UPDATE", "AGENT_AVAILABILITY", "target-1", null, expect.anything(), null);
    });
  });
});
