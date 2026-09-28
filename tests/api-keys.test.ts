import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseError } from "@/lib/db/errors";

const dbMocks = vi.hoisted(() => {
  const query = vi.fn();
  const queryOne = vi.fn();
  const execute = vi.fn();
  return { query, queryOne, execute, queryAsSystem: query, queryOneAsSystem: queryOne, executeAsSystem: execute };
});
const entitlementsMocks = vi.hoisted(() => ({
  assertFeatureEnabled: vi.fn().mockResolvedValue(undefined),
  isFeatureEnabledForTenant: vi.fn().mockResolvedValue(true),
}));
const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetSeconds: 60 }),
  clientIpFromRequest: vi.fn().mockReturnValue("203.0.113.10"),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/entitlements", () => entitlementsMocks);
vi.mock("@/lib/server/rate-limit", () => rateLimitMocks);

import {
  createApiKeyForTenant,
  listApiKeysForTenant,
  updateApiKeyForTenant,
  revokeApiKeyForTenant,
  rotateApiKeyForTenant,
  authenticateApiKeyRequest,
  hasApiKeyPermission,
  ApiKeyAuthenticationError,
} from "@/lib/repositories/api-keys-postgres";

const user = { id: "user-1", tenantId: "tenant-a" };

function apiKeyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "key-1",
    tenantId: "tenant-a",
    name: "Test Key",
    secret: "current-secret",
    previousSecret: null,
    previousSecretExpiresAt: null,
    permissions: { leads: "full" },
    ipAllowlist: null,
    rateLimitPerMinute: 60,
    expiresAt: null,
    lastUsedAt: null,
    lastUsedIp: null,
    isActive: true,
    revokedAt: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("api key CRUD", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
    entitlementsMocks.assertFeatureEnabled.mockReset().mockResolvedValue(undefined);
    entitlementsMocks.isFeatureEnabledForTenant.mockReset().mockResolvedValue(true);
  });

  describe("createApiKeyForTenant", () => {
    it("throws without a tenant", async () => {
      await expect(createApiKeyForTenant({ id: "u1", tenantId: null }, { name: "x" })).rejects.toThrow("TENANT_CONTEXT_REQUIRED");
    });

    it("throws API_KEY_NAME_REQUIRED for a blank name", async () => {
      await expect(createApiKeyForTenant(user, { name: "   " })).rejects.toThrow("API_KEY_NAME_REQUIRED");
    });

    it("propagates a disabled apiAccessEnabled feature", async () => {
      entitlementsMocks.assertFeatureEnabled.mockRejectedValueOnce(new Error("FEATURE_DISABLED:apiAccessEnabled"));
      await expect(createApiKeyForTenant(user, { name: "Key" })).rejects.toThrow("FEATURE_DISABLED");
    });

    it("creates a key and returns the plaintext secret exactly once", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow());
      const created = await createApiKeyForTenant(user, { name: "Test Key", permissions: { leads: "full" } });
      expect(created.secret).toMatch(/^[0-9a-f]{48}$/);
      expect((created as any).previousSecret).toBeUndefined();
    });

    it("throws DUPLICATE_API_KEY_NAME on a unique-constraint violation", async () => {
      dbMocks.queryOne.mockRejectedValueOnce(new DatabaseError("duplicate", { code: "23505" }));
      await expect(createApiKeyForTenant(user, { name: "Dup" })).rejects.toThrow("DUPLICATE_API_KEY_NAME");
    });
  });

  describe("listApiKeysForTenant", () => {
    it("never returns the secret or previousSecret fields", async () => {
      dbMocks.query.mockResolvedValueOnce([apiKeyRow({ previousSecret: "old-secret" })]);
      const keys = await listApiKeysForTenant(user);
      expect((keys[0] as any).secret).toBeUndefined();
      expect((keys[0] as any).previousSecret).toBeUndefined();
    });
  });

  describe("updateApiKeyForTenant", () => {
    it("throws API_KEY_NOT_FOUND when the row doesn't exist for this tenant", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(updateApiKeyForTenant(user, "missing", { name: "New" })).rejects.toThrow("API_KEY_NOT_FOUND");
    });

    it("throws DUPLICATE_API_KEY_NAME on rename collision", async () => {
      dbMocks.queryOne.mockRejectedValueOnce(new DatabaseError("duplicate", { code: "23505" }));
      await expect(updateApiKeyForTenant(user, "key-1", { name: "Taken" })).rejects.toThrow("DUPLICATE_API_KEY_NAME");
    });
  });

  describe("revokeApiKeyForTenant", () => {
    it("throws API_KEY_NOT_FOUND when the row doesn't exist", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(revokeApiKeyForTenant(user, "missing")).rejects.toThrow("API_KEY_NOT_FOUND");
    });

    it("sets isActive false and stamps revokedAt", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow({ isActive: false, revokedAt: "2026-01-02T00:00:00.000Z" }));
      const revoked = await revokeApiKeyForTenant(user, "key-1");
      expect(revoked.isActive).toBe(false);
      expect(revoked.revokedAt).toBe("2026-01-02T00:00:00.000Z");
    });
  });

  describe("rotateApiKeyForTenant", () => {
    it("throws API_KEY_NOT_FOUND when the row doesn't exist", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(rotateApiKeyForTenant(user, "missing")).rejects.toThrow("API_KEY_NOT_FOUND");
    });

    it("blocks credential rotation while impersonating, without even looking up the key", async () => {
      const impersonatingUser = { ...user, isImpersonating: true };
      await expect(rotateApiKeyForTenant(impersonatingUser, "key-1")).rejects.toThrow("IMPERSONATION_BLOCKED:rotate_api_key");
      expect(dbMocks.queryOne).not.toHaveBeenCalled();
    });

    it("moves the current secret into previousSecret and returns a new plaintext secret", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce(apiKeyRow({ secret: "old-secret" })) // existence lookup
        .mockResolvedValueOnce(apiKeyRow({ secret: "new-secret", previousSecret: "old-secret", previousSecretExpiresAt: "2026-01-02T00:00:00.000Z" }));

      const rotated = await rotateApiKeyForTenant(user, "key-1");

      expect(rotated.secret).not.toBe("old-secret");
      const updateCall = dbMocks.queryOne.mock.calls[1];
      expect(updateCall[1]).toContain("old-secret"); // previousSecret param carries the outgoing secret
    });
  });
});

describe("hasApiKeyPermission", () => {
  it("grants any action when the module scope is 'full'", () => {
    expect(hasApiKeyPermission({ leads: "full" }, "leads", "create")).toBe(true);
    expect(hasApiKeyPermission({ leads: "full" }, "leads", "read")).toBe(true);
  });

  it("grants only the explicitly-true action for an object scope", () => {
    expect(hasApiKeyPermission({ leads: { read: true } }, "leads", "read")).toBe(true);
    expect(hasApiKeyPermission({ leads: { read: true } }, "leads", "create")).toBe(false);
  });

  it("denies access for a module with no scope at all", () => {
    expect(hasApiKeyPermission({ leads: "full" }, "opportunities", "read")).toBe(false);
    expect(hasApiKeyPermission(undefined, "leads", "read")).toBe(false);
  });
});

describe("authenticateApiKeyRequest", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(undefined);
    entitlementsMocks.isFeatureEnabledForTenant.mockReset().mockResolvedValue(true);
    rateLimitMocks.checkRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 59, resetSeconds: 60 });
    rateLimitMocks.clientIpFromRequest.mockReset().mockReturnValue("203.0.113.10");
  });

  const ctx = { method: "GET", path: "/api/v1/leads", rawBody: "" };

  it("throws MISSING_CREDENTIALS when no auth headers are present at all", async () => {
    const request = new Request("http://localhost/api/v1/leads");
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "MISSING_CREDENTIALS" });
  });

  it("throws MISSING_CREDENTIALS for a bearer token with no '.' separator", async () => {
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer garbage" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "MISSING_CREDENTIALS" });
  });

  it("throws API_KEY_NOT_FOUND for an unknown key id", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "API_KEY_NOT_FOUND" });
  });

  it("throws API_KEY_REVOKED for a revoked key", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow({ isActive: false }));
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "API_KEY_REVOKED" });
  });

  it("throws API_KEY_EXPIRED for a key past its expiresAt", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow({ expiresAt: "2020-01-01T00:00:00.000Z" }));
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "API_KEY_EXPIRED" });
  });

  it("throws FEATURE_DISABLED when the tenant has since disabled API access", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow());
    entitlementsMocks.isFeatureEnabledForTenant.mockResolvedValueOnce(false);
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "FEATURE_DISABLED" });
  });

  it("throws INVALID_SECRET for a wrong bearer secret", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow());
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.wrong-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "INVALID_SECRET" });
  });

  it("authenticates successfully with the correct bearer secret and records last-used", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow());
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    const result = await authenticateApiKeyRequest(request, ctx);
    expect(result.mode).toBe("bearer");
    expect(result.tenantId).toBe("tenant-a");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("lastUsedAt"), expect.arrayContaining(["203.0.113.10", "key-1"]));
  });

  it("still accepts the previous secret within its rotation grace window", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(
      apiKeyRow({ secret: "new-secret", previousSecret: "old-secret", previousSecretExpiresAt: new Date(Date.now() + 60_000).toISOString() }),
    );
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.old-secret" } });
    const result = await authenticateApiKeyRequest(request, ctx);
    expect(result.mode).toBe("bearer");
  });

  it("rejects the previous secret once its grace window has expired", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(
      apiKeyRow({ secret: "new-secret", previousSecret: "old-secret", previousSecretExpiresAt: new Date(Date.now() - 60_000).toISOString() }),
    );
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.old-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "INVALID_SECRET" });
  });

  it("throws STALE_TIMESTAMP for a signed request outside the replay window", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow());
    const request = new Request("http://localhost/api/v1/leads", {
      headers: { "x-api-key-id": "key-1", "x-api-timestamp": "100", "x-api-signature": "deadbeef" },
    });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "STALE_TIMESTAMP" });
  });

  it("throws INVALID_SIGNATURE for a signed request with a wrong signature", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const request = new Request("http://localhost/api/v1/leads", {
      headers: { "x-api-key-id": "key-1", "x-api-timestamp": timestamp, "x-api-signature": "deadbeef" },
    });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "INVALID_SIGNATURE" });
  });

  it("authenticates successfully with a real, correctly-computed HMAC signature", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signedPayload = `${timestamp}.${ctx.method.toUpperCase()}.${ctx.path}.${ctx.rawBody}`;
    const signature = createHmac("sha256", "current-secret").update(signedPayload).digest("hex");
    const request = new Request("http://localhost/api/v1/leads", {
      headers: { "x-api-key-id": "key-1", "x-api-timestamp": timestamp, "x-api-signature": signature },
    });
    const result = await authenticateApiKeyRequest(request, ctx);
    expect(result.mode).toBe("signed");
  });

  it("throws IP_NOT_ALLOWED when the caller's IP isn't on the key's allowlist", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow({ ipAllowlist: ["198.51.100.1"] }));
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "IP_NOT_ALLOWED" });
  });

  it("allows the request when the caller's IP is on the key's allowlist", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow({ ipAllowlist: ["203.0.113.10"] }));
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    const result = await authenticateApiKeyRequest(request, ctx);
    expect(result.mode).toBe("bearer");
  });

  it("throws RATE_LIMITED once the key's per-minute limit is exceeded", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(apiKeyRow());
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetSeconds: 30 });
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toMatchObject({ reason: "RATE_LIMITED" });
  });

  it("errors from authenticateApiKeyRequest are instances of ApiKeyAuthenticationError", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const request = new Request("http://localhost/api/v1/leads", { headers: { authorization: "Bearer key-1.current-secret" } });
    await expect(authenticateApiKeyRequest(request, ctx)).rejects.toBeInstanceOf(ApiKeyAuthenticationError);
  });
});
