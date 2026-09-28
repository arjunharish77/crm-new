// Keep delivery tests independent of real DNS; destination guard has its own security tests.
vi.mock("node:dns/promises", () => ({ default: { lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]) } }));
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn() }));
const eventsMocks = vi.hoisted(() => ({
  APP_EVENT_TYPES: ["LEAD_CREATED", "LEAD_UPDATED", "OPPORTUNITY_CREATED", "OPPORTUNITY_UPDATED", "STAGE_CHANGED"],
  getAppHealthForTenant: vi.fn().mockResolvedValue({ status: "OK" }),
  getAppUsageForTenant: vi.fn().mockResolvedValue([]),
  listAppDeliveriesForTenant: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/marketplace-events", () => eventsMocks);

import { sendTestAppEvent, replayAppDelivery, exportAppDeliveryLogsCsv, generateAppSupportBundle } from "@/lib/server/marketplace-diagnostics";
import { encryptSecretAtRest } from "@/lib/server/secret-encryption";

const user = { id: "user-1", tenantId: "tenant-a" };

describe("sendTestAppEvent", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    vi.unstubAllGlobals();
  });

  it("throws TENANT_REQUIRED without a tenantId", async () => {
    await expect(sendTestAppEvent({ id: "u1", tenantId: null }, "app-1")).rejects.toThrow("TENANT_REQUIRED");
  });

  it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(sendTestAppEvent(user, "missing")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("throws APP_HAS_NO_WEBHOOK_URL when the app has no configured endpoint", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", webhookUrl: null, eventSubscriptions: [] });
    await expect(sendTestAppEvent(user, "app-1")).rejects.toThrow("APP_HAS_NO_WEBHOOK_URL");
  });

  it("sends a real signed request and returns the exact request and response, without touching TenantAppDelivery", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "app-1", webhookUrl: "https://example.com/hook", eventSubscriptions: ["LEAD_CREATED"] })
      .mockResolvedValueOnce({ signingSecret: encryptSecretAtRest("sign-secret") });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ok" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTestAppEvent(user, "app-1");

    expect(result.httpStatus).toBe(200);
    expect(result.error).toBeNull();
    expect(result.request.url).toBe("https://example.com/hook");
    expect(result.request.headers["x-app-signature"]).toBeTruthy();
  });

  it("falls back to a generic error, not a thrown exception, on network failure", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "app-1", webhookUrl: "https://example.com/hook", eventSubscriptions: [] })
      .mockResolvedValueOnce(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await sendTestAppEvent(user, "app-1");

    expect(result.error).toBe("ECONNREFUSED");
    expect(result.httpStatus).toBeNull();
  });
});

describe("replayAppDelivery", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("throws APP_DELIVERY_NOT_FOUND when the original delivery doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(replayAppDelivery(user, "missing")).rejects.toThrow("APP_DELIVERY_NOT_FOUND");
  });

  it("inserts a fresh PENDING delivery with the same payload/eventType and a distinct idempotency key", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ appId: "app-1", eventType: "LEAD_CREATED", payload: { id: "lead-1" } })
      .mockResolvedValueOnce({ id: "delivery-new" });

    const result = await replayAppDelivery(user, "delivery-old");

    expect(result.deliveryId).toBe("delivery-new");
    const insertCall = dbMocks.queryOne.mock.calls[1];
    expect(String(insertCall[0])).toContain('insert into "TenantAppDelivery"');
    expect(String(insertCall[0])).toContain("'PENDING'");
    expect(insertCall[1][2]).toBe("app-1");
    expect(insertCall[1][3]).toBe("LEAD_CREATED");
    expect(insertCall[1][5]).toContain("replay:delivery-old:");
  });
});

describe("exportAppDeliveryLogsCsv", () => {
  beforeEach(() => {
    eventsMocks.listAppDeliveriesForTenant.mockReset();
  });

  it("produces a header row plus one row per delivery", async () => {
    eventsMocks.listAppDeliveriesForTenant.mockResolvedValueOnce([
      { id: "d1", eventType: "LEAD_CREATED", status: "DELIVERED", attempts: 0, httpStatus: 200, latencyMs: 120, error: null, createdAt: "2026-01-01T00:00:00.000Z", processedAt: "2026-01-01T00:00:01.000Z" },
    ]);

    const csv = await exportAppDeliveryLogsCsv(user, "app-1");

    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("id,eventType,status,attempts,httpStatus,latencyMs,error,createdAt,processedAt");
    expect(lines[1]).toContain("d1,LEAD_CREATED,DELIVERED,0,200,120");
  });

  it("escapes commas and quotes in error messages", async () => {
    eventsMocks.listAppDeliveriesForTenant.mockResolvedValueOnce([
      { id: "d1", eventType: "LEAD_CREATED", status: "FAILED", attempts: 5, httpStatus: 500, latencyMs: 50, error: 'Server said "bad, request"', createdAt: "2026-01-01T00:00:00.000Z", processedAt: null },
    ]);

    const csv = await exportAppDeliveryLogsCsv(user, "app-1");

    expect(csv).toContain('"Server said ""bad, request"""');
  });
});

describe("generateAppSupportBundle", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    eventsMocks.getAppHealthForTenant.mockReset().mockResolvedValue({ status: "OK" });
    eventsMocks.getAppUsageForTenant.mockReset().mockResolvedValue([]);
    eventsMocks.listAppDeliveriesForTenant.mockReset().mockResolvedValue([]);
  });

  it("throws TENANT_REQUIRED without a tenantId", async () => {
    await expect(generateAppSupportBundle({ id: "u1", tenantId: null }, "app-1")).rejects.toThrow("TENANT_REQUIRED");
  });

  it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(generateAppSupportBundle(user, "missing")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("never includes TenantAppSecret fields, and composes install/health/usage/deliveries", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "app-1", name: "Test App", webhookUrl: "https://example.com/hook" })
      .mockResolvedValueOnce({ id: "install-1", status: "INSTALLED" });
    dbMocks.query.mockResolvedValueOnce([{ moduleKey: "leads", scope: "read" }]);
    eventsMocks.getAppHealthForTenant.mockResolvedValueOnce({ status: "OK", queueBacklog: 0 });
    eventsMocks.getAppUsageForTenant.mockResolvedValueOnce([{ date: "2026-01-01", webhookDeliveryCount: 3 }]);
    eventsMocks.listAppDeliveriesForTenant.mockResolvedValueOnce([{ id: "d1", status: "DELIVERED" }]);

    const bundle = await generateAppSupportBundle(user, "app-1");

    expect(bundle.app.name).toBe("Test App");
    expect((bundle.app as any).secret).toBeUndefined();
    expect((bundle.app as any).signingSecret).toBeUndefined();
    expect(bundle.install?.status).toBe("INSTALLED");
    expect(bundle.permissionGrants).toEqual([{ moduleKey: "leads", scope: "read" }]);
    expect(bundle.health?.status).toBe("OK");
    expect(bundle.usage).toHaveLength(1);
    expect(bundle.recentDeliveries).toHaveLength(1);
  });

  it("returns a null install and empty grants for an app that was registered but never had an install row", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "app-1", name: "Test App" })
      .mockResolvedValueOnce(null);

    const bundle = await generateAppSupportBundle(user, "app-1");

    expect(bundle.install).toBeNull();
    expect(bundle.permissionGrants).toEqual([]);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});
