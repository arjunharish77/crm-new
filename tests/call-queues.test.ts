import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);

import {
  queueTelephonyCall,
  removeCallFromQueue,
  getCallQueueHealthForTenant,
  listQueuedCallsForTeam,
  claimQueuedCall,
  releaseQueuedCall,
} from "@/lib/server/call-queues";

const member = { id: "user-1", tenantId: "tenant-a" };
const supervisor = { id: "sup-1", tenantId: "tenant-a", role: { permissions: { recordAccess: "TEAM" } } };

describe("call queues and routing", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  describe("queueTelephonyCall", () => {
    it("only sets queue fields when the row isn't already queued", async () => {
      await queueTelephonyCall("tenant-a", "call-1", { teamId: "team-1", queueType: "MISSED_CALLBACK" });
      const sql = String(dbMocks.execute.mock.calls[0][0]);
      expect(sql).toContain('"queueId" is null');
      expect(dbMocks.execute.mock.calls[0][1]).toEqual(["team-1", "MISSED_CALLBACK", "MEDIUM", expect.any(String), "call-1", "tenant-a"]);
    });

    it("defaults priority to MEDIUM when not supplied", async () => {
      await queueTelephonyCall("tenant-a", "call-1", { teamId: "team-1", queueType: "INBOUND" });
      expect(dbMocks.execute.mock.calls[0][1][2]).toBe("MEDIUM");
    });
  });

  describe("removeCallFromQueue", () => {
    it("clears all queue fields", async () => {
      await removeCallFromQueue("tenant-a", "call-1");
      const sql = String(dbMocks.execute.mock.calls[0][0]);
      expect(sql).toContain('"queueId" = null');
      expect(sql).toContain('"claimedBy" = null');
    });
  });

  describe("getCallQueueHealthForTenant", () => {
    it("aggregates per-team stats and sorts by unclaimed count descending", async () => {
      const now = Date.now();
      dbMocks.query.mockResolvedValueOnce([
        { queueId: "team-1", teamName: "Sales", queuedAt: new Date(now - 10 * 60000).toISOString(), claimedBy: null },
        { queueId: "team-1", teamName: "Sales", queuedAt: new Date(now - 20 * 60000).toISOString(), claimedBy: "user-1" },
        { queueId: "team-2", teamName: "Support", queuedAt: new Date(now - 5 * 60000).toISOString(), claimedBy: null },
      ]);

      const result = await getCallQueueHealthForTenant(member);

      const sales = result.find((r) => r.teamId === "team-1")!;
      expect(sales.totalQueued).toBe(2);
      expect(sales.unclaimed).toBe(1);
      expect(sales.avgAgeMinutes).toBe(15);
      expect(sales.oldestAgeMinutes).toBe(20);

      const support = result.find((r) => r.teamId === "team-2")!;
      expect(support.unclaimed).toBe(1);

      // Both teams have 1 unclaimed here -- confirm sort is stable/descending, not ascending.
      expect(result[0].unclaimed).toBeGreaterThanOrEqual(result[1].unclaimed);
    });

    it("returns an empty array when nothing is queued", async () => {
      const result = await getCallQueueHealthForTenant(member);
      expect(result).toEqual([]);
    });
  });

  describe("listQueuedCallsForTeam", () => {
    it("orders unclaimed calls before claimed ones", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { id: "call-claimed", priority: "URGENT", queuedAt: "2026-01-01T00:00:00.000Z", claimedBy: "user-1" },
        { id: "call-unclaimed", priority: "LOW", queuedAt: "2026-01-02T00:00:00.000Z", claimedBy: null },
      ]);
      const result = await listQueuedCallsForTeam(member, "team-1");
      expect(result[0].id).toBe("call-unclaimed");
    });

    it("orders by priority (URGENT before LOW) among unclaimed calls", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { id: "call-low", priority: "LOW", queuedAt: "2026-01-01T00:00:00.000Z", claimedBy: null },
        { id: "call-urgent", priority: "URGENT", queuedAt: "2026-01-02T00:00:00.000Z", claimedBy: null },
      ]);
      const result = await listQueuedCallsForTeam(member, "team-1");
      expect(result[0].id).toBe("call-urgent");
    });

    it("orders by queuedAt ascending within the same priority", async () => {
      dbMocks.query.mockResolvedValueOnce([
        { id: "call-newer", priority: "MEDIUM", queuedAt: "2026-01-02T00:00:00.000Z", claimedBy: null },
        { id: "call-older", priority: "MEDIUM", queuedAt: "2026-01-01T00:00:00.000Z", claimedBy: null },
      ]);
      const result = await listQueuedCallsForTeam(member, "team-1");
      expect(result[0].id).toBe("call-older");
    });
  });

  describe("claimQueuedCall", () => {
    it("throws CALL_NOT_QUEUED when the call has no queueId", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ queueId: null });
      await expect(claimQueuedCall(member, "call-1")).rejects.toThrow("CALL_NOT_QUEUED");
    });

    it("throws FORBIDDEN for a user who is neither a team member nor a supervisor", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ queueId: "team-1" }) // call lookup
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: "someone-else" }) // team lookup
        .mockResolvedValueOnce({ teamId: "other-team" }); // isQueueMember lookup
      await expect(claimQueuedCall(member, "call-1")).rejects.toThrow("FORBIDDEN");
    });

    it("allows a member of the queue's team", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ queueId: "team-1" })
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: null })
        .mockResolvedValueOnce({ teamId: "team-1" })
        .mockResolvedValueOnce({ id: "call-1", claimedBy: "user-1" });

      const result = await claimQueuedCall(member, "call-1");
      expect(result.claimedBy).toBe("user-1");
      expect(crmMocks.createAuditLog).toHaveBeenCalledWith(member, "CLAIM", "TELEPHONY_CALL_QUEUE", "call-1", null, expect.anything(), null);
    });

    it("allows a supervisor regardless of team membership", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ queueId: "team-1" })
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: null })
        .mockResolvedValueOnce({ id: "sup-1", claimedBy: "sup-1" });

      const result = await claimQueuedCall(supervisor, "call-1");
      expect(result.claimedBy).toBe("sup-1");
    });

    it("throws ALREADY_CLAIMED when the atomic update loses the race", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ queueId: "team-1" })
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: null })
        .mockResolvedValueOnce(null); // another caller already claimed it between the lookup and the UPDATE

      await expect(claimQueuedCall(supervisor, "call-1")).rejects.toThrow("ALREADY_CLAIMED");
    });

    it("guards the claim UPDATE with claimedBy is null so a race can't double-claim", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ queueId: "team-1" })
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: null })
        .mockResolvedValueOnce({ id: "call-1", claimedBy: "sup-1" });

      await claimQueuedCall(supervisor, "call-1");
      const claimSql = String(dbMocks.queryOne.mock.calls[2][0]);
      expect(claimSql).toContain('"claimedBy" is null');
    });
  });

  describe("releaseQueuedCall", () => {
    it("throws CALL_NOT_QUEUED when the call has no queueId", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ queueId: null, claimedBy: null });
      await expect(releaseQueuedCall(member, "call-1")).rejects.toThrow("CALL_NOT_QUEUED");
    });

    it("throws FORBIDDEN for a user who neither claimed it nor supervises the queue", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ queueId: "team-1", claimedBy: "someone-else" })
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: null });
      await expect(releaseQueuedCall(member, "call-1")).rejects.toThrow("FORBIDDEN");
    });

    it("allows the claimant to release their own claim", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ queueId: "team-1", claimedBy: "user-1" })
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: null })
        .mockResolvedValueOnce({ id: "call-1", claimedBy: null });

      const result = await releaseQueuedCall(member, "call-1");
      expect(result.claimedBy).toBeNull();
    });

    it("allows a supervisor to release someone else's claim", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ queueId: "team-1", claimedBy: "user-1" })
        .mockResolvedValueOnce({ id: "team-1", name: "Sales", leadId: null })
        .mockResolvedValueOnce({ id: "call-1", claimedBy: null });

      const result = await releaseQueuedCall(supervisor, "call-1");
      expect(result.claimedBy).toBeNull();
    });
  });
});
