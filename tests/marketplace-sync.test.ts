import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const moduleMocks = vi.hoisted(() => ({ assertModuleEnabled: vi.fn().mockResolvedValue(undefined) }));
const crmMocks = vi.hoisted(() => ({
  getLeadForTenant: vi.fn(),
  getOpportunityForTenant: vi.fn(),
  updateLeadForTenant: vi.fn(),
  updateOpportunityForTenant: vi.fn(),
  listLeadsForTenant: vi.fn(),
  listOpportunitiesForTenant: vi.fn(),
}));
const notificationMocks = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/module-entitlements", () => moduleMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/notifications", () => notificationMocks);

import {
  applyFieldMapping,
  resolveUpdateConflict,
  getOrCreateSyncConfig,
  updateSyncConfig,
  listFieldMappingsForInstall,
  setFieldMappings,
  listSyncRunsForInstall,
  runSyncForInstall,
  processDueAppSyncs,
  dryRunSync,
  prepareIncomingPayload,
  triggerSyncNow,
  loadSyncContext,
} from "@/lib/server/marketplace-sync";
import { encryptSecretAtRest } from "@/lib/server/secret-encryption";

const user = { id: "user-1", tenantId: "tenant-a" };

describe("applyFieldMapping", () => {
  const mappings = [
    { crmField: "name", appField: "full_name" },
    { crmField: "email", appField: "contact_email" },
  ];

  it("renames CRM field names to app field names in the toApp direction", () => {
    const result = applyFieldMapping({ name: "Jane", email: "jane@x.com", status: "NEW" }, mappings, "toApp");
    expect(result).toEqual({ full_name: "Jane", contact_email: "jane@x.com", status: "NEW" });
  });

  it("renames app field names back to CRM field names in the toCrm direction", () => {
    const result = applyFieldMapping({ full_name: "Jane", contact_email: "jane@x.com", status: "NEW" }, mappings, "toCrm");
    expect(result).toEqual({ name: "Jane", email: "jane@x.com", status: "NEW" });
  });

  it("returns a shallow copy unchanged when there are no mappings", () => {
    const record = { name: "Jane" };
    const result = applyFieldMapping(record, [], "toApp");
    expect(result).toEqual(record);
    expect(result).not.toBe(record);
  });

  it("leaves fields with no matching mapping untouched", () => {
    const result = applyFieldMapping({ unrelated: "value" }, mappings, "toApp");
    expect(result).toEqual({ unrelated: "value" });
  });
});

describe("resolveUpdateConflict", () => {
  it("allows the update when no expectedUpdatedAt is provided", () => {
    expect(resolveUpdateConflict("CRM_WINS", "2026-01-02T00:00:00.000Z", undefined)).toEqual({ allowed: true });
  });

  it("allows the update when expectedUpdatedAt matches the current record", () => {
    expect(resolveUpdateConflict("CRM_WINS", "2026-01-02T00:00:00.000Z", "2026-01-02T00:00:00.000Z")).toEqual({ allowed: true });
  });

  it("rejects a stale update under CRM_WINS", () => {
    const result = resolveUpdateConflict("CRM_WINS", "2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    expect(result.allowed).toBe(false);
  });

  it("allows a stale update under APP_WINS", () => {
    const result = resolveUpdateConflict("APP_WINS", "2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    expect(result.allowed).toBe(true);
  });

  it("rejects a stale update under NEWEST_WINS (degrades to trusting the CRM's current state)", () => {
    const result = resolveUpdateConflict("NEWEST_WINS", "2026-01-02T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    expect(result.allowed).toBe(false);
  });
});

describe("getOrCreateSyncConfig", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws APP_INSTALL_NOT_FOUND when the install doesn't belong to this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(getOrCreateSyncConfig(user, "install-1")).rejects.toThrow("APP_INSTALL_NOT_FOUND");
  });

  it("returns the existing config without inserting", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", appId: "app-1" }).mockResolvedValueOnce({ id: "config-1", installId: "install-1" });
    const config = await getOrCreateSyncConfig(user, "install-1");
    expect(config).toEqual({ id: "config-1", installId: "install-1" });
    expect(dbMocks.queryOne).toHaveBeenCalledTimes(2);
  });

  it("creates a default config row when none exists yet", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "config-1", installId: "install-1" });
    const config = await getOrCreateSyncConfig(user, "install-1");
    expect(config).toEqual({ id: "config-1", installId: "install-1" });
    expect(String(dbMocks.queryOne.mock.calls[2][0])).toContain('insert into "TenantAppSyncConfig"');
  });
});

describe("updateSyncConfig", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  function mockExistingConfig() {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", appId: "app-1" }).mockResolvedValueOnce({ id: "config-1" });
  }

  it("rejects an invalid sync direction", async () => {
    mockExistingConfig();
    await expect(updateSyncConfig(user, "install-1", { syncDirection: "SIDEWAYS" })).rejects.toThrow("INVALID_SYNC_DIRECTION");
  });

  it("rejects an invalid conflict resolution strategy", async () => {
    mockExistingConfig();
    await expect(updateSyncConfig(user, "install-1", { conflictResolution: "COIN_FLIP" })).rejects.toThrow("INVALID_CONFLICT_RESOLUTION");
  });

  it("rejects an invalid enabled module", async () => {
    mockExistingConfig();
    await expect(updateSyncConfig(user, "install-1", { enabledModules: ["tasks"] })).rejects.toThrow("INVALID_ENABLED_MODULE");
  });

  it("updates only the provided fields", async () => {
    mockExistingConfig();
    dbMocks.queryOne.mockResolvedValueOnce({ id: "config-1", syncDirection: "APP_TO_CRM" });
    const updated = await updateSyncConfig(user, "install-1", { syncDirection: "APP_TO_CRM" });
    expect((updated as any).syncDirection).toBe("APP_TO_CRM");
  });
});

describe("listFieldMappingsForInstall / setFieldMappings", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.query.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a crmField that isn't a real mappable column for the module", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", appId: "app-1" });
    await expect(setFieldMappings(user, "install-1", "leads", [{ crmField: "notARealField", appField: "x" }])).rejects.toThrow("INVALID_CRM_FIELD:notARealField");
  });

  it("rejects a mapping with a blank appField", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", appId: "app-1" });
    await expect(setFieldMappings(user, "install-1", "leads", [{ crmField: "name", appField: "  " }])).rejects.toThrow("APP_FIELD_REQUIRED");
  });

  it("replaces all mappings for the module (delete then insert)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", appId: "app-1" }).mockResolvedValueOnce({ id: "install-1", appId: "app-1" });
    dbMocks.query.mockResolvedValueOnce([{ id: "m1", module: "leads", crmField: "name", appField: "full_name" }]);
    const result = await setFieldMappings(user, "install-1", "leads", [{ crmField: "name", appField: "full_name" }]);
    expect(result).toEqual([{ id: "m1", module: "leads", crmField: "name", appField: "full_name" }]);
    const deleteCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("delete from"));
    expect(deleteCall?.[1]).toEqual(["install-1", "leads"]);
    const insertCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("insert into"));
    expect(insertCall?.[1]).toEqual(expect.arrayContaining(["tenant-a", "install-1", "leads", "name", "full_name"]));
  });
});

describe("listSyncRunsForInstall / triggerSyncNow", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.query.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("listSyncRunsForInstall throws APP_INSTALL_NOT_FOUND for another tenant's install", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(listSyncRunsForInstall(user, "install-1")).rejects.toThrow("APP_INSTALL_NOT_FOUND");
  });

  it("listSyncRunsForInstall scopes the query to the install", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", appId: "app-1" });
    dbMocks.query.mockResolvedValueOnce([{ id: "run-1" }]);
    const runs = await listSyncRunsForInstall(user, "install-1");
    expect(runs).toHaveLength(1);
    expect(dbMocks.query.mock.calls[0][1]).toEqual(["install-1", 50]);
  });
});

describe("runSyncForInstall", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.query.mockReset().mockResolvedValue([]);
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.listLeadsForTenant.mockReset();
    crmMocks.listOpportunitiesForTenant.mockReset();
    notificationMocks.createUserNotification.mockReset().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  it("skips when no sync config exists for the install", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const result = await runSyncForInstall("install-1");
    expect(result).toEqual({ skipped: true });
  });

  it("skips when syncDirection is APP_TO_CRM (nothing for the CRM to push)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ installId: "install-1", syncDirection: "APP_TO_CRM" });
    const result = await runSyncForInstall("install-1");
    expect(result).toEqual({ skipped: true });
  });

  it("marks the config FAILED when the app has no webhookUrl configured", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ installId: "install-1", syncDirection: "CRM_TO_APP", enabledModules: ["leads"] })
      .mockResolvedValueOnce({ tenantId: "tenant-a", appId: "app-1" })
      .mockResolvedValueOnce({ webhookUrl: null, name: "Test App" });

    const result = await runSyncForInstall("install-1");
    expect(result).toEqual({ skipped: true });
    const updateCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("TenantAppSyncConfig"));
    expect(String(updateCall?.[0])).toContain("'FAILED'");
  });

  it("pushes only records updated since lastSyncedAt, mapped, to the app's webhookUrl, and records a SUCCESS run", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ installId: "install-1", syncDirection: "CRM_TO_APP", enabledModules: ["leads"], lastSyncedAt: "2026-01-01T00:00:00.000Z" })
      .mockResolvedValueOnce({ tenantId: "tenant-a", appId: "app-1" })
      .mockResolvedValueOnce({ webhookUrl: "https://example.com/sync", name: "Test App" })
      .mockResolvedValueOnce({ signingSecret: encryptSecretAtRest("sign-1") })
      .mockResolvedValueOnce(null); // incrementSyncCount existing-row lookup
    dbMocks.query
      .mockResolvedValueOnce([]) // field mappings for leads
      ;
    crmMocks.listLeadsForTenant.mockResolvedValueOnce({
      data: [
        { id: "lead-1", name: "Old", updatedAt: "2025-12-01T00:00:00.000Z" },
        { id: "lead-2", name: "New", updatedAt: "2026-01-05T00:00:00.000Z" },
      ],
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runSyncForInstall("install-1");

    expect(result).toMatchObject({ recordsSynced: 1, status: "SUCCESS" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/sync");
    const body = JSON.parse(options.body);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].id).toBe("lead-2");
    expect(options.headers["x-app-signature"]).toBeTruthy();

    const runInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppSyncRun"'));
    expect(runInsert?.[1]).toEqual(expect.arrayContaining(["tenant-a", "install-1", "SUCCESS", 1]));
  });

  it("records a FAILED run and notifies when the push fails and notifyOnFailure is true", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ installId: "install-1", syncDirection: "CRM_TO_APP", enabledModules: ["leads"], lastSyncedAt: null, notifyOnFailure: true })
      .mockResolvedValueOnce({ tenantId: "tenant-a", appId: "app-1" })
      .mockResolvedValueOnce({ webhookUrl: "https://example.com/sync", name: "Test App" })
      .mockResolvedValueOnce({ signingSecret: null })
      .mockResolvedValueOnce({ id: "owner-1" }); // owner lookup for notification
    dbMocks.query.mockResolvedValueOnce([]);
    crmMocks.listLeadsForTenant.mockResolvedValueOnce({ data: [{ id: "lead-1", name: "X", updatedAt: "2026-01-01T00:00:00.000Z" }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await runSyncForInstall("install-1");

    expect(result.status).toBe("FAILED");
    expect(notificationMocks.createUserNotification).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", userId: "owner-1", title: "App sync failed" }));
  });
});

describe("processDueAppSyncs", () => {
  it("runs every due sync config", async () => {
    dbMocks.query.mockReset().mockResolvedValueOnce([{ installId: "install-1" }, { installId: "install-2" }]);
    dbMocks.queryOne.mockReset().mockResolvedValue(null); // each runSyncForInstall call short-circuits (no config found on 2nd lookup)
    const result = await processDueAppSyncs(25);
    expect(result.processed).toBe(2);
  });
});

describe("dryRunSync", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.query.mockReset().mockResolvedValue([]);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
    crmMocks.listLeadsForTenant.mockReset();
    dbMocks.execute.mockReset();
  });

  it("throws SYNC_CONFIG_NOT_FOUND when sync was never configured", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", appId: "app-1" }).mockResolvedValueOnce(null);
    await expect(dryRunSync(user, "install-1")).rejects.toThrow("SYNC_CONFIG_NOT_FOUND");
  });

  it("computes a preview without ever calling execute (no delivery, no run row written)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", appId: "app-1" }).mockResolvedValueOnce({ syncDirection: "CRM_TO_APP", enabledModules: ["leads"], lastSyncedAt: null });
    crmMocks.listLeadsForTenant.mockResolvedValueOnce({ data: [{ id: "lead-1", name: "Jane", updatedAt: "2026-01-01T00:00:00.000Z" }] });

    const result = await dryRunSync(user, "install-1");

    expect(result.preview.leads.count).toBe(1);
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });
});

describe("prepareIncomingPayload", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.query.mockReset();
  });

  it("returns the body unchanged when no sync config/mapping exists", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    dbMocks.query.mockResolvedValueOnce([]);
    const result = await prepareIncomingPayload("install-1", "leads", { name: "Jane" });
    expect(result).toEqual({ name: "Jane" });
  });

  it("fills in defaultOwnerId when the incoming payload doesn't specify one", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ defaultOwnerId: "user-42" });
    dbMocks.query.mockResolvedValueOnce([]);
    const result = await prepareIncomingPayload("install-1", "leads", { name: "Jane" });
    expect(result.ownerId).toBe("user-42");
  });

  it("does not override an ownerId the app already specified", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ defaultOwnerId: "user-42" });
    dbMocks.query.mockResolvedValueOnce([]);
    const result = await prepareIncomingPayload("install-1", "leads", { name: "Jane", ownerId: "user-1" });
    expect(result.ownerId).toBe("user-1");
  });

  it("applies field mapping before checking for an owner", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    dbMocks.query.mockResolvedValueOnce([{ crmField: "name", appField: "full_name" }]);
    const result = await prepareIncomingPayload("install-1", "leads", { full_name: "Jane" });
    expect(result).toEqual({ name: "Jane" });
  });
});

describe("loadSyncContext", () => {
  it("returns null config and empty mappings when never configured", async () => {
    dbMocks.queryOne.mockReset().mockResolvedValueOnce(null);
    dbMocks.query.mockReset().mockResolvedValueOnce([]);
    const { config, mappings } = await loadSyncContext("install-1", "leads");
    expect(config).toBeNull();
    expect(mappings).toEqual([]);
  });
});
