import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  catalog: [{ key: "NEXT_BEST_ACTION", name: "Next-Best Action", category: "ANALYTICS", isCore: false }],
  entitlements: [] as any[],
  auditLog: [] as any[],
}));

function resetState() {
  state.catalog = [{ key: "NEXT_BEST_ACTION", name: "Next-Best Action", category: "ANALYTICS", isCore: false }];
  state.entitlements = [];
  state.auditLog = [];
}
resetState();

vi.mock("@/lib/db/query", () => ({
  query: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('from "PlatformModule"')) return state.catalog;
    if (sql.includes('from "TenantModuleEntitlement"')) return state.entitlements.filter((row) => row.tenantId === params[0]);
    return [];
  }),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('select status from "TenantModuleEntitlement"')) {
      return state.entitlements.find((row) => row.tenantId === params[0] && row.moduleKey === params[1]) ?? null;
    }
    if (sql.includes('select id from "TenantModuleEntitlement"')) {
      return state.entitlements.find((row) => row.tenantId === params[0] && row.moduleKey === params[1]) ?? null;
    }
    if (sql.includes('from "PlatformModule"')) {
      return state.catalog.find((row) => row.key === params[0]) ?? null;
    }
    return null;
  }),
  execute: vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('insert into "TenantModuleEntitlement"') && sql.includes("on conflict")) {
      const existing = state.entitlements.find((item) => item.tenantId === params[1] && item.moduleKey === params[2]);
      if (existing) {
        Object.assign(existing, { status: params[3], reason: params[4] });
      } else {
        state.entitlements.push({ id: params[0], tenantId: params[1], moduleKey: params[2], status: params[3], reason: params[4] });
      }
    }
    if (sql.includes('insert into "TenantModuleAuditLog"')) {
      state.auditLog.push({ tenantId: params[1], moduleKey: params[2], action: params[3], reason: params[4], performedBy: params[5] });
    }
    return { rowCount: 1 };
  }),
}));

const PLATFORM_ADMIN = { id: "platform-admin-1", tenantId: null, isPlatformAdmin: true };

describe("Module entitlements", () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  it("defaults a module with no explicit entitlement row to enabled", async () => {
    const { isModuleEnabledForTenant } = await import("@/lib/server/module-entitlements");
    expect(await isModuleEnabledForTenant("tenant-1", "NEXT_BEST_ACTION")).toBe(true);
  });

  it("assertModuleEnabled passes when no row exists (default enabled)", async () => {
    const { assertModuleEnabled } = await import("@/lib/server/module-entitlements");
    await expect(assertModuleEnabled("tenant-1", "NEXT_BEST_ACTION")).resolves.toBeUndefined();
  });

  it("disables a module and assertModuleEnabled then throws", async () => {
    const { setTenantModuleStatus, assertModuleEnabled, isModuleEnabledForTenant } = await import("@/lib/server/module-entitlements");
    await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "NEXT_BEST_ACTION", "DISABLED", "Not paid for this tier");

    expect(await isModuleEnabledForTenant("tenant-1", "NEXT_BEST_ACTION")).toBe(false);
    await expect(assertModuleEnabled("tenant-1", "NEXT_BEST_ACTION")).rejects.toThrow("MODULE_DISABLED:NEXT_BEST_ACTION");
  });

  it("writes an audit log entry on every status change", async () => {
    const { setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
    await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "NEXT_BEST_ACTION", "SUSPENDED", "Billing hold");

    expect(state.auditLog).toHaveLength(1);
    expect(state.auditLog[0]).toMatchObject({ tenantId: "tenant-1", moduleKey: "NEXT_BEST_ACTION", action: "SUSPENDED", reason: "Billing hold" });
  });

  it("bypasses the check entirely for platform admins", async () => {
    const { assertModuleEnabled, setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
    await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "NEXT_BEST_ACTION", "DISABLED");
    await expect(assertModuleEnabled("tenant-1", "NEXT_BEST_ACTION", { isPlatformAdmin: true })).resolves.toBeUndefined();
  });

  it("refuses to disable a core module", async () => {
    state.catalog.push({ key: "LEADS", name: "Leads", category: "CORE", isCore: true });
    const { setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
    await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "LEADS", "DISABLED")).rejects.toThrow("CORE_MODULE_CANNOT_BE_DISABLED");
  });

  it("rejects an unknown module key", async () => {
    const { setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
    await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "NOT_A_REAL_MODULE", "DISABLED")).rejects.toThrow("MODULE_NOT_FOUND");
  });
});
