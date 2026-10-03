import { beforeEach, describe, expect, it, vi } from "vitest";

// Real module-entitlements + real marketplace auth/events/sync code; only the database, secret
// decryption and the network are faked. A tenant whose MARKETPLACE module is off must not be
// reachable by, or send data to, installed third-party apps.
const db = vi.hoisted(() => ({ statements: [] as { sql: string; params: unknown[] }[], status: "DISABLED" as string | null }));

vi.mock("@/lib/db/query", () => {
  const rows = (sql: string, params: unknown[]) => {
    db.statements.push({ sql, params });
    if (sql.includes('from "TenantModuleEntitlement"')) return db.status ? [{ status: db.status }] : [];
    if (sql.includes('from "MarketplaceApp" where id = $1 limit 1')) return [{ id: "app-1", isActive: true, rateLimitPerMinute: 600 }];
    if (sql.includes('from "TenantAppSecret" where "appId" = $1')) return [{ tenantId: "t1", secret: "s3cret", previousSecret: null, previousSecretExpiresAt: null }];
    if (sql.includes('from "TenantAppInstall"') && sql.includes("status = 'INSTALLED'") && sql.includes('"recordAccess"')) return [{ id: "inst-1", recordAccess: "ALL", ownerUserId: null, fieldPermissions: null }];
    if (sql.includes('from "TenantAppEventSubscription"')) return [{ appId: "app-1", dailyDeliveryLimit: null }];
    if (sql.includes('from "TenantAppSyncConfig" where "installId"')) return [{ installId: "inst-1", syncDirection: "BIDIRECTIONAL" }];
    if (sql.includes('from "TenantAppInstall" where id = $1')) return [{ tenantId: "t1", appId: "app-1" }];
    if (sql.includes('select "webhookUrl", name from "MarketplaceApp"')) return [{ webhookUrl: "https://app.example.com/hook", name: "App" }];
    return [];
  };
  const one = async (sql: string, params: unknown[] = []) => rows(sql, params)[0] ?? null;
  const many = async (sql: string, params: unknown[] = []) => rows(sql, params);
  return {
    query: vi.fn(many), queryAsSystem: vi.fn(many), queryOne: vi.fn(one), queryOneAsSystem: vi.fn(one),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => { rows(sql, params); return { rowCount: 1 }; }),
    jsonbParam: (value: unknown) => JSON.stringify(value ?? null),
  };
});
vi.mock("@/lib/server/secret-encryption", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/secret-encryption")>()),
  decryptSecretAtRestOrNull: (value: string | null | undefined) => value ?? null,
}));

const writes = () => db.statements.filter(({ sql }) => /^\s*(insert|update|delete)/i.test(sql));

beforeEach(() => {
  db.statements = [];
  db.status = "DISABLED";
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
});

describe("Marketplace module gate", () => {
  it("refuses installed-app credentials while the tenant's Marketplace is off, and accepts them when on", async () => {
    const { authenticateMarketplaceAppRequest } = await import("@/lib/server/marketplace-inbound");
    const request = () => new Request("http://localhost/api/v1/apps/leads", { headers: { authorization: "Bearer app-1.s3cret" } });
    await expect(authenticateMarketplaceAppRequest(request())).rejects.toMatchObject({ reason: "MODULE_DISABLED" });
    const { marketplaceAppAuthErrorResponse } = await import("@/lib/server/http");
    const response = marketplaceAppAuthErrorResponse("MODULE_DISABLED");
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe("Marketplace is not enabled for this workspace");
    db.status = null; // no entitlement row = enabled
    await expect(authenticateMarketplaceAppRequest(request())).resolves.toMatchObject({ tenantId: "t1" });
  });

  it("queues no app event for a disabled tenant, without failing the record write", async () => {
    const { enqueueAppEvent } = await import("@/lib/server/marketplace-events");
    await expect(enqueueAppEvent("t1", "lead.created" as any, { id: "l1" })).resolves.toBeUndefined();
    expect(writes()).toEqual([]);
  });

  it("cancels (does not send) a delivery queued before Marketplace was switched off", async () => {
    const { queryAsSystem, queryOneAsSystem } = await import("@/lib/db/query");
    vi.mocked(queryAsSystem).mockResolvedValueOnce([{ id: "d-1" }] as any);
    vi.mocked(queryOneAsSystem).mockResolvedValueOnce({ id: "d-1", tenantId: "t1", appId: "app-1", eventType: "lead.created", payload: {}, attempts: 0 } as any);
    const { processAppEventDeliveries } = await import("@/lib/server/marketplace-events");
    await processAppEventDeliveries(5);
    expect(fetch).not.toHaveBeenCalled();
    expect(writes().some(({ sql, params }) => sql.includes("status = 'CANCELLED'") && params.includes("d-1"))).toBe(true);
  });

  it("skips a scheduled CRM-to-app sync for a disabled tenant without pushing data", async () => {
    const { runSyncForInstall } = await import("@/lib/server/marketplace-sync");
    await expect(runSyncForInstall("inst-1")).resolves.toEqual({ skipped: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
  });
});
