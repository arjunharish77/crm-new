import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const rateLimitMocks = vi.hoisted(() => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetSeconds: 60 }) }));
const automationMocks = vi.hoisted(() => ({ runAutomationsForEvent: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/rate-limit", () => rateLimitMocks);
vi.mock("@/lib/repositories/automations-postgres", () => automationMocks);

import {
  MarketplaceAppAuthenticationError,
  authenticateMarketplaceAppRequest,
  fireAppAutomationTrigger,
  hasAppPermission,
} from "@/lib/server/marketplace-inbound";
import { encryptSecretAtRest } from "@/lib/server/secret-encryption";

function appRow(overrides: Record<string, unknown> = {}) {
  return { id: "app-1", isActive: true, rateLimitPerMinute: 60, ...overrides };
}

function installRow(overrides: Record<string, unknown> = {}) {
  return { id: "install-1", ...overrides };
}

// TenantAppSecret is encrypted at rest (gap checklist Module 16's secret-encryption sub-item) --
// a raw DB row fixture must carry real ciphertext, matching what authenticateMarketplaceAppRequest
// actually decrypts, while every test's plaintext bearer-token assertions stay unchanged.
function secretRow(overrides: Record<string, unknown> = {}) {
  const { secret = "current-secret", previousSecret = null, ...rest } = overrides;
  return {
    tenantId: "tenant-a",
    secret: encryptSecretAtRest(secret as string),
    previousSecret: previousSecret !== null ? encryptSecretAtRest(previousSecret as string) : null,
    previousSecretExpiresAt: null,
    ...rest,
  };
}

const request = (auth?: string) =>
  new Request("http://localhost/api/v1/apps/leads", auth ? { headers: { authorization: auth } } : undefined);

// Call order inside authenticateMarketplaceAppRequest: queryOne(app) -> query(all secret rows
// for this appId, across every installing tenant) -> queryOne(install, scoped to the tenant
// whose secret matched) -> checkRateLimit -> query(grants) -> fire-and-forget usage increment.
describe("authenticateMarketplaceAppRequest", () => {
  beforeEach(() => {
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    rateLimitMocks.checkRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 59, resetSeconds: 60 });
  });

  it("throws MISSING_CREDENTIALS when no authorization header is present", async () => {
    await expect(authenticateMarketplaceAppRequest(request())).rejects.toMatchObject({ reason: "MISSING_CREDENTIALS" });
  });

  it("throws MISSING_CREDENTIALS for a bearer token with no '.' separator", async () => {
    await expect(authenticateMarketplaceAppRequest(request("Bearer garbage"))).rejects.toMatchObject({ reason: "MISSING_CREDENTIALS" });
  });

  it("throws APP_NOT_FOUND for an unknown app id", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"))).rejects.toMatchObject({ reason: "APP_NOT_FOUND" });
  });

  it("throws APP_SUSPENDED when the app has been deactivated", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow({ isActive: false }));
    await expect(authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"))).rejects.toMatchObject({ reason: "APP_SUSPENDED" });
  });

  it("throws INVALID_SECRET when no secret row exists at all", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow());
    dbMocks.query.mockResolvedValueOnce([]);
    await expect(authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"))).rejects.toMatchObject({ reason: "INVALID_SECRET" });
  });

  it("throws INVALID_SECRET for a wrong bearer secret", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow());
    dbMocks.query.mockResolvedValueOnce([secretRow()]);
    await expect(authenticateMarketplaceAppRequest(request("Bearer app-1.wrong-secret"))).rejects.toMatchObject({ reason: "INVALID_SECRET" });
  });

  it("throws APP_NOT_INSTALLED when there is no INSTALLED row for the tenant whose secret matched", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow()).mockResolvedValueOnce(null);
    dbMocks.query.mockResolvedValueOnce([secretRow()]);
    await expect(authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"))).rejects.toMatchObject({ reason: "APP_NOT_INSTALLED" });
  });

  it("authenticates with the correct current secret and returns permissions built from grants", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow()).mockResolvedValueOnce(installRow());
    dbMocks.query
      .mockResolvedValueOnce([secretRow()])
      .mockResolvedValueOnce([
        { moduleKey: "leads", scope: "write" },
        { moduleKey: "opportunities", scope: "read" },
      ]);

    const result = await authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"));

    expect(result).toEqual({
      appId: "app-1",
      tenantId: "tenant-a",
      installId: "install-1",
      permissions: { leads: "write", opportunities: "read" },
    });
  });

  it("still accepts the previous secret within its rotation grace window", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow()).mockResolvedValueOnce(installRow());
    dbMocks.query.mockResolvedValueOnce([
      secretRow({ secret: "new-secret", previousSecret: "old-secret", previousSecretExpiresAt: new Date(Date.now() + 60_000).toISOString() }),
    ]);

    const result = await authenticateMarketplaceAppRequest(request("Bearer app-1.old-secret"));
    expect(result.appId).toBe("app-1");
  });

  it("rejects the previous secret once its grace window has expired", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow());
    dbMocks.query.mockResolvedValueOnce([
      secretRow({ secret: "new-secret", previousSecret: "old-secret", previousSecretExpiresAt: new Date(Date.now() - 60_000).toISOString() }),
    ]);

    await expect(authenticateMarketplaceAppRequest(request("Bearer app-1.old-secret"))).rejects.toMatchObject({ reason: "INVALID_SECRET" });
  });

  it("returns an empty permissions map when the install has no grants", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow()).mockResolvedValueOnce(installRow());
    dbMocks.query.mockResolvedValueOnce([secretRow()]).mockResolvedValueOnce([]);

    const result = await authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"));
    expect(result.permissions).toEqual({});
  });

  it("errors are instances of MarketplaceAppAuthenticationError", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"))).rejects.toBeInstanceOf(MarketplaceAppAuthenticationError);
  });

  it("increments an existing usage row's requestCount for today", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow()).mockResolvedValueOnce(installRow()).mockResolvedValueOnce({ id: "usage-1" });
    dbMocks.query.mockResolvedValueOnce([secretRow()]).mockResolvedValueOnce([]);

    await authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"));
    await Promise.resolve();

    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("requestCount"), ["usage-1"]);
  });

  it("inserts a new usage row when none exists for today", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow()).mockResolvedValueOnce(installRow()).mockResolvedValueOnce(null);
    dbMocks.query.mockResolvedValueOnce([secretRow()]).mockResolvedValueOnce([]);

    await authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"));
    await Promise.resolve();

    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("insert into"), expect.arrayContaining(["tenant-a", "app-1"]));
  });

  it("throws RATE_LIMITED once the app's per-minute limit is exceeded", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow()).mockResolvedValueOnce(installRow());
    dbMocks.query.mockResolvedValueOnce([secretRow()]);
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 30 });
    await expect(authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"))).rejects.toMatchObject({ reason: "RATE_LIMITED" });
  });

  it("checks the rate limit per (app, installing tenant), not just per app", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow({ rateLimitPerMinute: 120 })).mockResolvedValueOnce(installRow());
    dbMocks.query.mockResolvedValueOnce([secretRow()]).mockResolvedValueOnce([]);
    await authenticateMarketplaceAppRequest(request("Bearer app-1.current-secret"));
    expect(rateLimitMocks.checkRateLimit).toHaveBeenCalledWith({ key: "marketplace-app:app-1:tenant-a", limit: 120, windowSeconds: 60 });
  });

  // The core regression test for the multi-tenant rework: two different tenants installed the
  // same app, each with their own secret. Presenting tenant B's secret must resolve to tenant
  // B's own data, never tenant A's (the app owner) -- the exact cross-tenant leak this rework
  // closes (previously tenantId was read off the app's own owning tenant, not the matched
  // secret's tenant).
  it("resolves the installing tenant from whichever secret row actually matches, not the app's owning tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow()).mockResolvedValueOnce(installRow());
    dbMocks.query
      .mockResolvedValueOnce([
        secretRow({ tenantId: "tenant-a", secret: "secret-a" }),
        secretRow({ tenantId: "tenant-b", secret: "secret-b" }),
      ])
      .mockResolvedValueOnce([]);

    const result = await authenticateMarketplaceAppRequest(request("Bearer app-1.secret-b"));

    expect(result.tenantId).toBe("tenant-b");
    expect(dbMocks.queryOne).toHaveBeenNthCalledWith(2, expect.stringContaining('"TenantAppInstall"'), ["tenant-b", "app-1"]);
  });
});

describe("hasAppPermission", () => {
  it("grants read for a 'read' scope but not write", () => {
    expect(hasAppPermission({ leads: "read" }, "leads", "read")).toBe(true);
    expect(hasAppPermission({ leads: "read" }, "leads", "write")).toBe(false);
  });

  it("a 'write' scope implies both read and write", () => {
    expect(hasAppPermission({ leads: "write" }, "leads", "read")).toBe(true);
    expect(hasAppPermission({ leads: "write" }, "leads", "write")).toBe(true);
  });

  it("denies access for a module with no grant at all", () => {
    expect(hasAppPermission({ leads: "write" }, "opportunities", "read")).toBe(false);
    expect(hasAppPermission({}, "leads", "read")).toBe(false);
  });
});

// Gap checklist Module 16's app event bus, "triggers" half -- built per explicit user decision.
describe("fireAppAutomationTrigger", () => {
  beforeEach(() => {
    automationMocks.runAutomationsForEvent.mockReset().mockResolvedValue([]);
  });

  it("throws AUTOMATIONS_WRITE_PERMISSION_REQUIRED without an 'automations':'write' grant", async () => {
    await expect(
      fireAppAutomationTrigger({ appId: "app-1", tenantId: "tenant-a", permissions: { automations: "read" } }, "order.completed", {}),
    ).rejects.toThrow("AUTOMATIONS_WRITE_PERMISSION_REQUIRED");
    expect(automationMocks.runAutomationsForEvent).not.toHaveBeenCalled();
  });

  it("throws EVENT_NAME_REQUIRED for a blank event name", async () => {
    await expect(
      fireAppAutomationTrigger({ appId: "app-1", tenantId: "tenant-a", permissions: { automations: "write" } }, "   ", {}),
    ).rejects.toThrow("EVENT_NAME_REQUIRED");
  });

  it("fires runAutomationsForEvent with a synthetic app-scoped user, the APP_EVENT type, and the event/payload in the record", async () => {
    await fireAppAutomationTrigger({ appId: "app-1", tenantId: "tenant-a", permissions: { automations: "write" } }, "order.completed", { orderId: "o-1" });

    expect(automationMocks.runAutomationsForEvent).toHaveBeenCalledTimes(1);
    const [user, eventType, entityType, entityId, record] = automationMocks.runAutomationsForEvent.mock.calls[0];
    expect(user).toEqual({ id: "app-1", tenantId: "tenant-a" });
    expect(eventType).toBe("APP_EVENT");
    expect(entityType).toBe("APP_EVENT");
    expect(typeof entityId).toBe("string");
    expect(record).toEqual({ appId: "app-1", eventName: "order.completed", payload: { orderId: "o-1" } });
  });

  it("returns whatever runAutomationsForEvent returns", async () => {
    automationMocks.runAutomationsForEvent.mockResolvedValueOnce([{ automationId: "auto-1", status: "COMPLETED" }]);
    const result = await fireAppAutomationTrigger({ appId: "app-1", tenantId: "tenant-a", permissions: { automations: "write" } }, "order.completed", {});
    expect(result).toEqual([{ automationId: "auto-1", status: "COMPLETED" }]);
  });
});
