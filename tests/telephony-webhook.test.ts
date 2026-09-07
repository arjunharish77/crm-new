import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  createActivityForTenant: vi.fn(),
  ensureSystemActivityType: vi.fn().mockResolvedValue("activity-type-call"),
}));
const automationsMocks = vi.hoisted(() => ({ runAutomationsForEvent: vi.fn().mockResolvedValue([]) }));
const communicationsMocks = vi.hoisted(() => ({ isPhoneSuppressed: vi.fn().mockResolvedValue(false), isPhoneOptedOut: vi.fn().mockResolvedValue(false) }));
const inboundCallerContextMocks = vi.hoisted(() => ({
  getInboundCallerContextForTenant: vi.fn().mockResolvedValue({ phoneNumber: "", leadMatches: [], opportunityMatches: [], partnerMatches: [], recentActivities: [], recentCalls: [] }),
}));
const notificationsMocks = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));
const callQueuesMocks = vi.hoisted(() => ({ queueTelephonyCall: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/repositories/automations-postgres", () => automationsMocks);
vi.mock("@/lib/server/communications", () => communicationsMocks);
vi.mock("@/lib/server/inbound-caller-context", () => inboundCallerContextMocks);
vi.mock("@/lib/server/notifications", () => notificationsMocks);
vi.mock("@/lib/server/call-queues", () => callQueuesMocks);

import {
  checkTelephonyComplianceForCall,
  listTelephonyWebhookEventsForTenant,
  recordTelephonyCallEvent,
  rotateTelephonyWebhookSecret,
  verifyTelephonyWebhookRequest,
} from "@/lib/server/telephony-webhook";

const TENANT_ID = "tenant-a";
const SECRET = "telephony-secret-abc";

function sign(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

describe("telephony webhook security", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    crmMocks.createActivityForTenant.mockReset();
    crmMocks.ensureSystemActivityType.mockReset().mockResolvedValue("activity-type-call");
    automationsMocks.runAutomationsForEvent.mockReset().mockResolvedValue([]);
    communicationsMocks.isPhoneSuppressed.mockReset().mockResolvedValue(false);
    communicationsMocks.isPhoneOptedOut.mockReset().mockResolvedValue(false);
    inboundCallerContextMocks.getInboundCallerContextForTenant
      .mockReset()
      .mockResolvedValue({ phoneNumber: "", leadMatches: [], opportunityMatches: [], partnerMatches: [], recentActivities: [], recentCalls: [] });
    notificationsMocks.createUserNotification.mockReset().mockResolvedValue(undefined);
    callQueuesMocks.queueTelephonyCall.mockReset().mockResolvedValue(undefined);
    delete process.env.WEBHOOK_SIGNING_SECRET;
  });

  describe("checkTelephonyComplianceForCall", () => {
    it("allows the call when nothing blocks it", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "setting-1", config: {}, isActive: true });
      const result = await checkTelephonyComplianceForCall(TENANT_ID, "+919999999999");
      expect(result).toEqual({ allowed: true });
    });

    it("blocks when the number is on the do-not-call list", async () => {
      communicationsMocks.isPhoneSuppressed.mockResolvedValueOnce(true);
      const result = await checkTelephonyComplianceForCall(TENANT_ID, "+919999999999");
      expect(result).toEqual({ allowed: false, reason: "SUPPRESSED" });
    });

    it("blocks when the linked entity has opted out of phone contact", async () => {
      communicationsMocks.isPhoneOptedOut.mockResolvedValueOnce(true);
      const result = await checkTelephonyComplianceForCall(TENANT_ID, "+919999999999", { entityType: "LEAD", entityId: "lead-1" });
      expect(result).toEqual({ allowed: false, reason: "OPTED_OUT" });
      expect(communicationsMocks.isPhoneOptedOut).toHaveBeenCalledWith(TENANT_ID, "LEAD", "lead-1");
    });

    it("blocks when the current time falls inside configured quiet hours", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({
        id: "setting-1",
        config: { callingQuietHours: { enabled: true, start: "00:00", end: "23:59" } },
        isActive: true,
      });
      const result = await checkTelephonyComplianceForCall(TENANT_ID, "+919999999999");
      expect(result).toEqual({ allowed: false, reason: "QUIET_HOURS" });
    });

    it("does not block on quiet hours when disabled", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({
        id: "setting-1",
        config: { callingQuietHours: { enabled: false, start: "00:00", end: "23:59" } },
        isActive: true,
      });
      const result = await checkTelephonyComplianceForCall(TENANT_ID, "+919999999999");
      expect(result).toEqual({ allowed: true });
    });

    it("checks suppression before opt-out and opt-out before quiet hours", async () => {
      communicationsMocks.isPhoneSuppressed.mockResolvedValueOnce(true);
      await checkTelephonyComplianceForCall(TENANT_ID, "+919999999999");
      expect(communicationsMocks.isPhoneOptedOut).not.toHaveBeenCalled();
      expect(dbMocks.queryOne).not.toHaveBeenCalled();
    });
  });

  describe("verifyTelephonyWebhookRequest", () => {
    it("accepts the legacy global secret for backward compatibility", async () => {
      process.env.WEBHOOK_SIGNING_SECRET = "legacy-secret";
      const result = await verifyTelephonyWebhookRequest(TENANT_ID, "{}", { legacySecret: "legacy-secret" });
      expect(result).toEqual({ ok: true, mode: "legacy" });
    });

    it("rejects a request with no signature or legacy secret", async () => {
      const result = await verifyTelephonyWebhookRequest(TENANT_ID, "{}", {});
      expect(result).toEqual({ ok: false, reason: "MISSING_SIGNATURE" });
    });

    it("rejects a stale timestamp", async () => {
      const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
      const result = await verifyTelephonyWebhookRequest(TENANT_ID, "{}", { timestamp: staleTimestamp, signature: sign(SECRET, staleTimestamp, "{}") });
      expect(result).toEqual({ ok: false, reason: "STALE_TIMESTAMP" });
    });

    it("reports NOT_CONFIGURED when the tenant has no secret set up yet", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const result = await verifyTelephonyWebhookRequest(TENANT_ID, "{}", { timestamp, signature: sign(SECRET, timestamp, "{}") });
      expect(result).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    });

    it("accepts a valid HMAC signature against the current secret", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "setting-1", config: { webhookSecret: SECRET }, isActive: true });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = JSON.stringify({ tenantId: TENANT_ID, status: "completed" });
      const result = await verifyTelephonyWebhookRequest(TENANT_ID, rawBody, { timestamp, signature: sign(SECRET, timestamp, rawBody) });
      expect(result).toEqual({ ok: true, mode: "hmac" });
    });

    it("accepts a valid HMAC signature against the previous secret within the rotation grace window", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({
        id: "setting-1",
        config: { webhookSecret: "new-secret", previousWebhookSecret: SECRET, previousWebhookSecretExpiresAt: new Date(Date.now() + 60_000).toISOString() },
        isActive: true,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const result = await verifyTelephonyWebhookRequest(TENANT_ID, "{}", { timestamp, signature: sign(SECRET, timestamp, "{}") });
      expect(result).toEqual({ ok: true, mode: "hmac" });
    });

    it("rejects a signature computed with the wrong secret", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "setting-1", config: { webhookSecret: SECRET }, isActive: true });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const result = await verifyTelephonyWebhookRequest(TENANT_ID, "{}", { timestamp, signature: sign("wrong-secret", timestamp, "{}") });
      expect(result).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
    });
  });

  describe("rotateTelephonyWebhookSecret", () => {
    it("throws when telephony has never been configured for this tenant", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(rotateTelephonyWebhookSecret({ id: "admin-1", tenantId: TENANT_ID })).rejects.toThrow("TELEPHONY_NOT_CONFIGURED");
    });

    it("moves the current secret to previous and issues a new current secret", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "setting-1", config: { webhookSecret: SECRET }, isActive: true })
        .mockResolvedValueOnce({ id: "setting-1", config: { webhookSecret: "new-secret", previousWebhookSecret: SECRET } });

      const result = await rotateTelephonyWebhookSecret({ id: "admin-1", tenantId: TENANT_ID });

      expect(result.hasPreviousSecret).toBe(true);
      const updateCall = dbMocks.queryOne.mock.calls[1];
      expect(updateCall[1][0].previousWebhookSecret).toBe(SECRET);
      expect(updateCall[1][0].webhookSecret).not.toBe(SECRET);
    });
  });

  describe("recordTelephonyCallEvent", () => {
    it("creates a new call log and an Activity when the record is linked to a lead", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
        if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
        if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null; // no existing row
        if (text.includes('insert into "TelephonyCallLog"')) return { id: "log-1", status: "completed", activityId: "activity-1" };
        return null;
      });
      crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

      const result = await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-123", status: "completed", leadId: "lead-1" });

      expect(result.deduped).toBe(false);
      expect(crmMocks.createActivityForTenant).toHaveBeenCalledTimes(1);
    });

    it("computes recordingExpiresAt from the tenant's configured retention when a new call has a recording", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: { recordingRetentionDays: 30 }, isActive: true };
        if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
        if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null;
        if (text.includes('insert into "TelephonyCallLog"')) return { id: "log-1", status: "completed" };
        return null;
      });
      crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

      await recordTelephonyCallEvent(TENANT_ID, {
        provider: "twilio",
        callId: "call-rec-1",
        status: "completed",
        leadId: "lead-1",
        recordingUrl: "https://example.com/rec.mp3",
        startedAt: "2026-01-01T00:00:00.000Z",
      });

      const insertCall = dbMocks.queryOne.mock.calls.find((call) => String(call[0]).includes('insert into "TelephonyCallLog"'));
      expect(insertCall![1][18]).toBe("2026-01-31T00:00:00.000Z");
    });

    it("leaves recordingExpiresAt null when no retention is configured", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
        if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
        if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null;
        if (text.includes('insert into "TelephonyCallLog"')) return { id: "log-1", status: "completed" };
        return null;
      });
      crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

      await recordTelephonyCallEvent(TENANT_ID, {
        provider: "twilio",
        callId: "call-rec-2",
        status: "completed",
        leadId: "lead-1",
        recordingUrl: "https://example.com/rec.mp3",
      });

      const insertCall = dbMocks.queryOne.mock.calls.find((call) => String(call[0]).includes('insert into "TelephonyCallLog"'));
      expect(insertCall![1][18]).toBeNull();
    });

    it("updates the existing row instead of inserting a duplicate when the same callId is retried", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
        if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
        if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider'))
          return { id: "log-1", status: "completed", activityId: "activity-1" };
        if (text.includes('update "TelephonyCallLog"')) return { id: "log-1", status: "completed", activityId: "activity-1" };
        return null;
      });

      const result = await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-123", status: "completed", leadId: "lead-1" });

      expect(result.deduped).toBe(true);
      expect(dbMocks.execute).not.toHaveBeenCalled();
      const insertAttempted = dbMocks.queryOne.mock.calls.some((call) => String(call[0]).includes('insert into "TelephonyCallLog"'));
      expect(insertAttempted).toBe(false);
    });

    it("does not create a second Activity for an intermediate status update on an already-logged call", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
        if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
        if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider'))
          return { id: "log-1", status: "ringing", activityId: null }; // not yet terminal
        if (text.includes('update "TelephonyCallLog"')) return { id: "log-1", status: "answered", activityId: null };
        return null;
      });

      await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-123", status: "answered", leadId: "lead-1" });

      expect(crmMocks.createActivityForTenant).not.toHaveBeenCalled();
    });

    it("creates the Activity on the transition into a terminal status even for an existing row", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
        if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
        if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider'))
          return { id: "log-1", status: "ringing", activityId: null };
        if (text.includes('update "TelephonyCallLog"')) return { id: "log-1", status: "completed", activityId: "activity-1" };
        return null;
      });
      crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

      const result = await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-123", status: "completed", leadId: "lead-1" });

      expect(crmMocks.createActivityForTenant).toHaveBeenCalledTimes(1);
      expect(result.deduped).toBe(true);
    });

    it("resolves the acting user via userAgentMappings when the event's agentId matches", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("from \"IntegrationSetting\"")) {
          return { id: "setting-1", config: { userAgentMappings: [{ agentId: "ext-42", userId: "user-mapped" }] }, isActive: true };
        }
        if (text.includes('from "User" where id = $1 and "tenantId" = $2')) return { id: "user-mapped", tenantId: TENANT_ID };
        if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null;
        if (text.includes('insert into "TelephonyCallLog"')) return { id: "log-1", status: "completed" };
        return null;
      });

      await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-456", status: "completed", agentId: "ext-42" });

      const insertCall = dbMocks.queryOne.mock.calls.find((call) => String(call[0]).includes('insert into "TelephonyCallLog"'));
      expect(insertCall![1][10]).toBe("ext-42"); // agentId column still reflects the raw event value
      expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ id: "user-mapped" }),
        "CREATE",
        "TELEPHONY_CALL_LOG",
        "log-1",
        null,
        expect.anything(),
        null,
      );
    });

    it("throws when no tenant user can be resolved at all", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        const text = String(sql);
        if (text.includes("from \"IntegrationSetting\"")) return null;
        if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return null;
        return null;
      });

      await expect(recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-789" })).rejects.toThrow("NO_TENANT_USER");
    });

    describe("automation triggers", () => {
      function mockNewCallLog(overrides: Record<string, unknown> = {}) {
        dbMocks.queryOne.mockImplementation(async (sql: string) => {
          const text = String(sql);
          if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
          if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
          if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null;
          if (text.includes('insert into "TelephonyCallLog"')) return { id: "log-1", leadId: "lead-1", opportunityId: null, recordingUrl: null, ...overrides };
          return null;
        });
      }

      it("fires CALL_ANSWERED and CALL_COMPLETED when a new call lands directly on completed", async () => {
        mockNewCallLog();
        crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-1", status: "completed", leadId: "lead-1" });

        const eventTypes = automationsMocks.runAutomationsForEvent.mock.calls.map((call) => call[1]);
        expect(eventTypes).toEqual(expect.arrayContaining(["CALL_ANSWERED", "CALL_COMPLETED"]));
        expect(automationsMocks.runAutomationsForEvent.mock.calls[0]).toEqual(
          expect.arrayContaining(["CALL_ANSWERED", "LEAD", "lead-1"]),
        );
      });

      it("fires CALL_MISSED for a missed call", async () => {
        mockNewCallLog();
        crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-2", status: "missed", leadId: "lead-1" });

        const eventTypes = automationsMocks.runAutomationsForEvent.mock.calls.map((call) => call[1]);
        expect(eventTypes).toEqual(["CALL_MISSED"]);
      });

      it("fires CALL_FAILED for a failed call", async () => {
        mockNewCallLog();
        crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-3", status: "failed", leadId: "lead-1" });

        const eventTypes = automationsMocks.runAutomationsForEvent.mock.calls.map((call) => call[1]);
        expect(eventTypes).toEqual(["CALL_FAILED"]);
      });

      it("also fires RECORDING_AVAILABLE when a terminal call has a recording", async () => {
        mockNewCallLog({ recordingUrl: "https://example.com/rec.mp3" });
        crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

        await recordTelephonyCallEvent(TENANT_ID, {
          provider: "twilio",
          callId: "call-4",
          status: "completed",
          leadId: "lead-1",
          recordingUrl: "https://example.com/rec.mp3",
        });

        const eventTypes = automationsMocks.runAutomationsForEvent.mock.calls.map((call) => call[1]);
        expect(eventTypes).toEqual(expect.arrayContaining(["RECORDING_AVAILABLE"]));
      });

      it("does not fire any automation for a non-terminal status like ringing", async () => {
        mockNewCallLog();
        crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-5", status: "ringing", leadId: "lead-1" });

        expect(automationsMocks.runAutomationsForEvent).not.toHaveBeenCalled();
      });

      it("does not re-fire automations when an already-terminal call is updated again", async () => {
        dbMocks.queryOne.mockImplementation(async (sql: string) => {
          const text = String(sql);
          if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
          if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
          if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider'))
            return { id: "log-1", status: "completed", activityId: "activity-1" }; // already terminal
          if (text.includes('update "TelephonyCallLog"')) return { id: "log-1", leadId: "lead-1", status: "completed", activityId: "activity-1" };
          return null;
        });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-6", status: "completed", leadId: "lead-1" });

        expect(automationsMocks.runAutomationsForEvent).not.toHaveBeenCalled();
      });

      it("does not fire automations for a call with no linked lead or opportunity", async () => {
        mockNewCallLog({ leadId: null });
        crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-7", status: "completed" });

        expect(automationsMocks.runAutomationsForEvent).not.toHaveBeenCalled();
      });

      it("targets OPPORTUNITY when only an opportunityId is linked", async () => {
        dbMocks.queryOne.mockImplementation(async (sql: string) => {
          const text = String(sql);
          if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
          if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
          if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null;
          if (text.includes('insert into "TelephonyCallLog"')) return { id: "log-1", leadId: null, opportunityId: "opp-1", recordingUrl: null };
          return null;
        });
        crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-8", status: "completed", opportunityId: "opp-1" });

        expect(automationsMocks.runAutomationsForEvent.mock.calls[0]).toEqual(
          expect.arrayContaining(["CALL_ANSWERED", "OPPORTUNITY", "opp-1"]),
        );
      });
    });

    describe("inbound call popup notification", () => {
      function mockNewInboundCallLog(overrides: Record<string, unknown> = {}) {
        dbMocks.queryOne.mockImplementation(async (sql: string) => {
          const text = String(sql);
          if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
          if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
          if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null;
          if (text.includes('insert into "TelephonyCallLog"'))
            return { id: "log-1", direction: "INBOUND", fromNumber: "+919999999999", leadId: null, opportunityId: null, ...overrides };
          return null;
        });
      }

      it("fires a Notification for a new inbound call with a caller number", async () => {
        mockNewInboundCallLog();

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-in-1", direction: "INBOUND", fromNumber: "+919999999999", status: "ringing" });

        expect(inboundCallerContextMocks.getInboundCallerContextForTenant).toHaveBeenCalledWith({ id: "owner-1", tenantId: TENANT_ID }, "+919999999999");
        expect(notificationsMocks.createUserNotification).toHaveBeenCalledTimes(1);
        const call = notificationsMocks.createUserNotification.mock.calls[0][0];
        expect(call).toMatchObject({ tenantId: TENANT_ID, userId: "owner-1", title: "Incoming call" });
        expect(call.data).toMatchObject({ type: "INBOUND_CALL", callLogId: "log-1" });
      });

      it("includes the matched lead's name in the notification message when a caller match is found", async () => {
        mockNewInboundCallLog();
        inboundCallerContextMocks.getInboundCallerContextForTenant.mockResolvedValueOnce({
          phoneNumber: "+919999999999",
          leadMatches: [{ id: "lead-1", name: "Jane Doe" }],
          opportunityMatches: [],
          partnerMatches: [],
          recentActivities: [],
          recentCalls: [],
        });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-in-2", direction: "INBOUND", fromNumber: "+919999999999", status: "ringing" });

        const call = notificationsMocks.createUserNotification.mock.calls[0][0];
        expect(call.message).toContain("Jane Doe");
      });

      it("does not fire for an outbound call", async () => {
        dbMocks.queryOne.mockImplementation(async (sql: string) => {
          const text = String(sql);
          if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
          if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
          if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null;
          if (text.includes('insert into "TelephonyCallLog"')) return { id: "log-2", direction: "OUTBOUND", fromNumber: null };
          return null;
        });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-out-1", direction: "OUTBOUND", status: "dialing" });

        expect(notificationsMocks.createUserNotification).not.toHaveBeenCalled();
      });

      it("does not fire when the inbound call has no caller number", async () => {
        mockNewInboundCallLog({ fromNumber: null });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-in-3", direction: "INBOUND", status: "ringing" });

        expect(notificationsMocks.createUserNotification).not.toHaveBeenCalled();
      });

      it("does not re-fire when an already-logged inbound call is updated", async () => {
        dbMocks.queryOne.mockImplementation(async (sql: string) => {
          const text = String(sql);
          if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config: {}, isActive: true };
          if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
          if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider'))
            return { id: "log-1", status: "ringing", activityId: null, startedAt: new Date().toISOString(), recordingUrl: null };
          if (text.includes('update "TelephonyCallLog"'))
            return { id: "log-1", direction: "INBOUND", fromNumber: "+919999999999", status: "completed" };
          return null;
        });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-in-4", direction: "INBOUND", fromNumber: "+919999999999", status: "completed" });

        expect(notificationsMocks.createUserNotification).not.toHaveBeenCalled();
      });
    });

    describe("call queue routing", () => {
      function mockNewInboundCallLog(config: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
        dbMocks.queryOne.mockImplementation(async (sql: string) => {
          const text = String(sql);
          if (text.includes("from \"IntegrationSetting\"")) return { id: "setting-1", config, isActive: true };
          if (text.includes('from "User" where "tenantId" = $1 order by "createdAt"')) return { id: "owner-1", tenantId: TENANT_ID };
          if (text.includes('from "TelephonyCallLog" where "tenantId" = $1 and provider')) return null;
          if (text.includes('insert into "TelephonyCallLog"'))
            return { id: "log-1", direction: "INBOUND", fromNumber: "+919999999999", leadId: null, opportunityId: null, ...overrides };
          return null;
        });
      }

      it("routes a new missed inbound call into the MISSED_CALLBACK queue when a default team is configured", async () => {
        mockNewInboundCallLog({ defaultCallQueueTeamId: "team-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-q-1", direction: "INBOUND", fromNumber: "+919999999999", status: "missed" });

        expect(callQueuesMocks.queueTelephonyCall).toHaveBeenCalledWith(TENANT_ID, "log-1", { teamId: "team-1", queueType: "MISSED_CALLBACK" });
      });

      it("routes an unmatched inbound call to the INBOUND queue type when there's no partner match", async () => {
        mockNewInboundCallLog({ defaultCallQueueTeamId: "team-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-q-2", direction: "INBOUND", fromNumber: "+919999999999", status: "ringing" });

        expect(callQueuesMocks.queueTelephonyCall).toHaveBeenCalledWith(TENANT_ID, "log-1", { teamId: "team-1", queueType: "INBOUND" });
      });

      it("routes to the PARTNER queue type when the caller matches a partner", async () => {
        mockNewInboundCallLog({ defaultCallQueueTeamId: "team-1" });
        inboundCallerContextMocks.getInboundCallerContextForTenant.mockResolvedValueOnce({
          phoneNumber: "+919999999999",
          leadMatches: [],
          opportunityMatches: [],
          partnerMatches: [{ id: "partner-1", legalBusinessName: "Acme Partners" }],
          recentActivities: [],
          recentCalls: [],
        });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-q-3", direction: "INBOUND", fromNumber: "+919999999999", status: "ringing" });

        expect(callQueuesMocks.queueTelephonyCall).toHaveBeenCalledWith(TENANT_ID, "log-1", { teamId: "team-1", queueType: "PARTNER" });
      });

      it("does not queue when no default call queue team is configured", async () => {
        mockNewInboundCallLog({});

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-q-4", direction: "INBOUND", fromNumber: "+919999999999", status: "ringing" });

        expect(callQueuesMocks.queueTelephonyCall).not.toHaveBeenCalled();
      });

      it("does not queue a call that already matched a real Lead and isn't missed", async () => {
        mockNewInboundCallLog({ defaultCallQueueTeamId: "team-1" }, { leadId: "lead-1" });
        crmMocks.createActivityForTenant.mockResolvedValueOnce({ id: "activity-1" });

        await recordTelephonyCallEvent(TENANT_ID, { provider: "twilio", callId: "call-q-5", direction: "INBOUND", fromNumber: "+919999999999", status: "completed", leadId: "lead-1" });

        expect(callQueuesMocks.queueTelephonyCall).not.toHaveBeenCalled();
      });
    });
  });

  describe("listTelephonyWebhookEventsForTenant", () => {
    it("scopes the query to the requesting tenant", async () => {
      dbMocks.query.mockResolvedValueOnce([{ id: "log-1" }]);
      const events = await listTelephonyWebhookEventsForTenant({ id: "user-1", tenantId: TENANT_ID }, 10);
      expect(events).toHaveLength(1);
      expect(dbMocks.query.mock.calls[0][1]).toEqual([TENANT_ID, 10]);
    });
  });
});
