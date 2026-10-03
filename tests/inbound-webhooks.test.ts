import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn(), jsonbParam: (v: unknown) => v }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined), createLeadForTenant: vi.fn() }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);

import {
  captureInboundLead,
  retryInboundWebhookEvent,
  rotateInboundWebhookSecret,
  validateInboundLeadPayload,
  verifyInboundWebhookRequest,
} from "@/lib/server/inbound-webhooks";

// Webhook/integration logic under test; the DATA_PLATFORM module gate itself is covered by
// tests/data-platform-module-gate.test.ts.
vi.mock("@/lib/server/module-entitlements", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/module-entitlements")>()),
  assertTenantModule: vi.fn(async () => undefined),
  assertModuleEnabled: vi.fn(async () => undefined),
  isModuleEnabledForTenant: vi.fn(async () => true),
}));


const TENANT_ID = "tenant-a";
const SECRET = "abc123secret";

function sign(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

describe("inbound webhook governance", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    crmMocks.createLeadForTenant.mockReset();
    delete process.env.WEBHOOK_SIGNING_SECRET;
  });

  describe("verifyInboundWebhookRequest", () => {
    it("accepts the legacy global secret for backward compatibility", async () => {
      process.env.WEBHOOK_SIGNING_SECRET = "legacy-secret";
      const result = await verifyInboundWebhookRequest(TENANT_ID, "{}", { legacySecret: "legacy-secret" });
      expect(result).toEqual({ ok: true, mode: "legacy" });
    });

    it("rejects a request with no signature or legacy secret", async () => {
      const result = await verifyInboundWebhookRequest(TENANT_ID, "{}", {});
      expect(result).toEqual({ ok: false, reason: "MISSING_SIGNATURE" });
    });

    it("rejects a timestamp outside the replay window", async () => {
      const staleTimestamp = String(Math.floor(Date.now() / 1000) - 10 * 60);
      const result = await verifyInboundWebhookRequest(TENANT_ID, "{}", {
        timestamp: staleTimestamp,
        signature: sign(SECRET, staleTimestamp, "{}"),
      });
      expect(result).toEqual({ ok: false, reason: "STALE_TIMESTAMP" });
    });

    it("reports NOT_CONFIGURED when the tenant has no secret set up yet", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const result = await verifyInboundWebhookRequest(TENANT_ID, "{}", { timestamp, signature: sign(SECRET, timestamp, "{}") });
      expect(result).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    });

    it("accepts a valid HMAC signature against the current secret", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "setting-1", config: { currentSecret: SECRET }, isActive: true });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = JSON.stringify({ name: "Test" });
      const result = await verifyInboundWebhookRequest(TENANT_ID, rawBody, { timestamp, signature: sign(SECRET, timestamp, rawBody) });
      expect(result).toEqual({ ok: true, mode: "hmac" });
    });

    it("accepts a valid HMAC signature against the previous secret within the rotation grace window", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({
        id: "setting-1",
        config: { currentSecret: "new-secret", previousSecret: SECRET, previousSecretExpiresAt: new Date(Date.now() + 60_000).toISOString() },
        isActive: true,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = "{}";
      const result = await verifyInboundWebhookRequest(TENANT_ID, rawBody, { timestamp, signature: sign(SECRET, timestamp, rawBody) });
      expect(result).toEqual({ ok: true, mode: "hmac" });
    });

    it("rejects a previous-secret signature once the rotation grace window has expired", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({
        id: "setting-1",
        config: { currentSecret: "new-secret", previousSecret: SECRET, previousSecretExpiresAt: new Date(Date.now() - 60_000).toISOString() },
        isActive: true,
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = "{}";
      const result = await verifyInboundWebhookRequest(TENANT_ID, rawBody, { timestamp, signature: sign(SECRET, timestamp, rawBody) });
      expect(result).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
    });

    it("rejects a signature computed with the wrong secret", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "setting-1", config: { currentSecret: SECRET }, isActive: true });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const result = await verifyInboundWebhookRequest(TENANT_ID, "{}", { timestamp, signature: sign("wrong-secret", timestamp, "{}") });
      expect(result).toEqual({ ok: false, reason: "INVALID_SIGNATURE" });
    });
  });

  describe("validateInboundLeadPayload", () => {
    it("requires a non-empty name", () => {
      expect(validateInboundLeadPayload({})).toMatch(/name is required/);
      expect(validateInboundLeadPayload({ name: "  " })).toMatch(/name is required/);
    });

    it("rejects a malformed email", () => {
      expect(validateInboundLeadPayload({ name: "A", email: "not-an-email" })).toMatch(/valid email/);
    });

    it("accepts a valid payload", () => {
      expect(validateInboundLeadPayload({ name: "A", email: "a@example.com", phone: "555" })).toBeNull();
    });
  });

  describe("captureInboundLead", () => {
    it("creates a lead and logs an ACCEPTED event on the happy path", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "User"')) return { id: "owner-1", tenantId: TENANT_ID };
        return null;
      });
      crmMocks.createLeadForTenant.mockResolvedValueOnce({ id: "lead-1" });

      const result = await captureInboundLead(TENANT_ID, { name: "New Lead" });

      expect(result).toMatchObject({ duplicate: false, leadId: "lead-1" });
      const insertCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('insert into "InboundWebhookEvent"'));
      expect(insertCall![1]).toContain("ACCEPTED");
    });

    it("rejects an invalid payload without touching the database beyond the event log", async () => {
      await expect(captureInboundLead(TENANT_ID, { name: "" })).rejects.toThrow(/VALIDATION:/);
      expect(crmMocks.createLeadForTenant).not.toHaveBeenCalled();
      const insertCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('insert into "InboundWebhookEvent"'));
      expect(insertCall![1]).toContain("REJECTED");
    });

    it("short-circuits a duplicate idempotency key without creating a second lead", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        if (String(sql).includes('"idempotencyKey" = $2')) return { id: "event-1", status: "ACCEPTED", leadId: "lead-1" };
        return null;
      });

      const result = await captureInboundLead(TENANT_ID, { name: "New Lead" }, "key-123");

      expect(result).toEqual({ duplicate: true, leadId: "lead-1" });
      expect(crmMocks.createLeadForTenant).not.toHaveBeenCalled();
    });

    it("logs a FAILED event and rethrows when lead creation itself throws", async () => {
      dbMocks.queryOne.mockImplementation(async (sql: string) => {
        if (String(sql).includes('from "User"')) return { id: "owner-1", tenantId: TENANT_ID };
        return null;
      });
      crmMocks.createLeadForTenant.mockRejectedValueOnce(new Error("db exploded"));

      await expect(captureInboundLead(TENANT_ID, { name: "New Lead" })).rejects.toThrow("db exploded");
      const insertCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('insert into "InboundWebhookEvent"'));
      expect(insertCall![1]).toContain("FAILED");
    });
  });

  describe("rotateInboundWebhookSecret", () => {
    it("moves the current secret to previous and issues a new current secret", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ id: "setting-1", config: { currentSecret: SECRET, previousSecret: null }, isActive: true })
        .mockResolvedValueOnce({ id: "setting-1", config: { currentSecret: "new-secret", previousSecret: SECRET }, isActive: true });

      const rotated = await rotateInboundWebhookSecret({ id: "admin-1", tenantId: TENANT_ID });

      expect(rotated.hasPreviousSecret).toBe(true);
      const updateCall = dbMocks.queryOne.mock.calls[1];
      expect(updateCall[1][0].previousSecret).toBe(SECRET);
      expect(updateCall[1][0].currentSecret).not.toBe(SECRET);
    });
  });

  describe("retryInboundWebhookEvent", () => {
    it("throws when the event isn't in FAILED status", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "event-1", payload: {}, status: "ACCEPTED" });
      await expect(retryInboundWebhookEvent({ id: "admin-1", tenantId: TENANT_ID }, "event-1")).rejects.toThrow(
        "INBOUND_WEBHOOK_EVENT_NOT_RETRYABLE",
      );
    });

    it("throws when the event doesn't exist for this tenant", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(retryInboundWebhookEvent({ id: "admin-1", tenantId: TENANT_ID }, "missing")).rejects.toThrow(
        "INBOUND_WEBHOOK_EVENT_NOT_FOUND",
      );
    });
  });
});
