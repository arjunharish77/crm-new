import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const leadsRepoMocks = vi.hoisted(() => ({ getLeadForTenant: vi.fn() }));
const opportunitiesRepoMocks = vi.hoisted(() => ({ getOpportunityForTenant: vi.fn() }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/repositories/leads-postgres", () => leadsRepoMocks);
vi.mock("@/lib/repositories/opportunities-postgres", () => opportunitiesRepoMocks);

import { listCallRecordingsForTenant, getCallRecordingForTenant, expireCallRecordings } from "@/lib/server/call-recordings";

const user = { id: "user-1", tenantId: "tenant-a" };
const admin = { id: "admin-1", tenantId: "tenant-a", isTenantAdmin: true };

describe("call recording governance", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    leadsRepoMocks.getLeadForTenant.mockReset();
    opportunitiesRepoMocks.getOpportunityForTenant.mockReset();
  });

  describe("listCallRecordingsForTenant", () => {
    it("returns an empty list when neither leadId nor opportunityId is given", async () => {
      const result = await listCallRecordingsForTenant(user, {});
      expect(result).toEqual([]);
      expect(dbMocks.query).not.toHaveBeenCalled();
    });

    it("throws LEAD_NOT_FOUND when the lead isn't accessible", async () => {
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce(null);
      await expect(listCallRecordingsForTenant(user, { leadId: "lead-1" })).rejects.toThrow("LEAD_NOT_FOUND");
    });

    it("throws OPPORTUNITY_NOT_FOUND when the opportunity isn't accessible", async () => {
      opportunitiesRepoMocks.getOpportunityForTenant.mockResolvedValueOnce(null);
      await expect(listCallRecordingsForTenant(user, { opportunityId: "opp-1" })).rejects.toThrow("OPPORTUNITY_NOT_FOUND");
    });

    it("marks a call expired when recordingExpiresAt is in the past", async () => {
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1" });
      dbMocks.query.mockResolvedValueOnce([
        { id: "call-1", hasRecording: true, recordingExpiresAt: "2020-01-01T00:00:00.000Z" },
        { id: "call-2", hasRecording: true, recordingExpiresAt: "2099-01-01T00:00:00.000Z" },
        { id: "call-3", hasRecording: false, recordingExpiresAt: null },
      ]);

      const result = await listCallRecordingsForTenant(user, { leadId: "lead-1" });

      expect(result.find((c) => c.id === "call-1")!.isExpired).toBe(true);
      expect(result.find((c) => c.id === "call-2")!.isExpired).toBe(false);
      expect(result.find((c) => c.id === "call-3")!.isExpired).toBe(false);
    });

    it("exposes only a hasRecording boolean, never the raw recordingUrl, in the returned rows", async () => {
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1" });
      dbMocks.query.mockResolvedValueOnce([{ id: "call-1", hasRecording: true, recordingExpiresAt: null }]);

      const result = await listCallRecordingsForTenant(user, { leadId: "lead-1" });

      expect(result[0]).not.toHaveProperty("recordingUrl");
      expect(result[0].hasRecording).toBe(true);
      const sql = String(dbMocks.query.mock.calls[0][0]);
      expect(sql).toContain('"recordingUrl" is not null) as "hasRecording"');
    });
  });

  describe("getCallRecordingForTenant", () => {
    it("throws CALL_LOG_NOT_FOUND when the call doesn't exist for this tenant", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(getCallRecordingForTenant(user, "call-1", "PLAY")).rejects.toThrow("CALL_LOG_NOT_FOUND");
    });

    it("throws FORBIDDEN when the user has no admin, agent, or record access", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "call-1", recordingUrl: "https://x/rec.mp3", agentId: "someone-else", leadId: "lead-1" });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce(null);
      await expect(getCallRecordingForTenant(user, "call-1", "PLAY")).rejects.toThrow("FORBIDDEN");
    });

    it("allows a tenant admin regardless of agent/record access", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "call-1", recordingUrl: "https://x/rec.mp3", agentId: "someone-else", leadId: null, opportunityId: null });
      const result = await getCallRecordingForTenant(admin, "call-1", "PLAY");
      expect(result.recordingUrl).toBe("https://x/rec.mp3");
    });

    it("allows the agent who was on the call", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "call-1", recordingUrl: "https://x/rec.mp3", agentId: user.id, leadId: null, opportunityId: null });
      const result = await getCallRecordingForTenant(user, "call-1", "PLAY");
      expect(result.recordingUrl).toBe("https://x/rec.mp3");
    });

    it("allows a user with record access to the linked lead", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "call-1", recordingUrl: "https://x/rec.mp3", agentId: "someone-else", leadId: "lead-1", opportunityId: null });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce({ id: "lead-1" });
      const result = await getCallRecordingForTenant(user, "call-1", "PLAY");
      expect(result.recordingUrl).toBe("https://x/rec.mp3");
    });

    it("falls through to opportunity access when lead access fails", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({
        id: "call-1",
        recordingUrl: "https://x/rec.mp3",
        agentId: "someone-else",
        leadId: "lead-1",
        opportunityId: "opp-1",
      });
      leadsRepoMocks.getLeadForTenant.mockResolvedValueOnce(null);
      opportunitiesRepoMocks.getOpportunityForTenant.mockResolvedValueOnce({ id: "opp-1" });
      const result = await getCallRecordingForTenant(user, "call-1", "PLAY");
      expect(result.recordingUrl).toBe("https://x/rec.mp3");
    });

    it("throws RECORDING_NOT_AVAILABLE when there's no recording", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "call-1", recordingUrl: null, agentId: user.id });
      await expect(getCallRecordingForTenant(user, "call-1", "PLAY")).rejects.toThrow("RECORDING_NOT_AVAILABLE");
    });

    it("throws RECORDING_EXPIRED when past recordingExpiresAt", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({
        id: "call-1",
        recordingUrl: "https://x/rec.mp3",
        agentId: user.id,
        recordingExpiresAt: "2020-01-01T00:00:00.000Z",
      });
      await expect(getCallRecordingForTenant(user, "call-1", "PLAY")).rejects.toThrow("RECORDING_EXPIRED");
    });

    it("writes an audit log entry with the requested action", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "call-1", recordingUrl: "https://x/rec.mp3", agentId: user.id });
      await getCallRecordingForTenant(user, "call-1", "DOWNLOAD");
      expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "DOWNLOAD", "TELEPHONY_RECORDING", "call-1", null, { action: "DOWNLOAD" }, null);
    });
  });

  describe("expireCallRecordings", () => {
    it("nulls recordingUrl for every due row and reports the count processed", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "call-1" }, { id: "call-2" }]);
      dbMocks.execute.mockResolvedValue(1);

      const result = await expireCallRecordings(100);

      expect(result.processed).toBe(2);
      expect(dbMocks.execute).toHaveBeenCalledTimes(2);
      expect(dbMocks.execute.mock.calls[0][1]).toEqual(["call-1"]);
    });

    it("is a no-op when nothing is due", async () => {
      dbMocks.query.mockResolvedValueOnce([]);
      const result = await expireCallRecordings(100);
      expect(result.processed).toBe(0);
      expect(dbMocks.execute).not.toHaveBeenCalled();
    });
  });
});
