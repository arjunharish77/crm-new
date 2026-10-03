import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  catalog: [] as any[],
  entitlements: [] as any[],
  auditLog: [] as any[],
  features: null as Record<string, boolean> | null,
}));

function resetState() {
  state.catalog = [{ key: "NEXT_BEST_ACTION", name: "Next-Best Action", category: "ANALYTICS", isCore: false }];
  state.entitlements = [];
  state.auditLog = [];
  state.features = null;
}
resetState();

// One fake shared by the plain query helpers and the transaction client, so code under test sees
// the same data either way (setTenantModuleStatus now runs inside withTransaction).
const db = vi.hoisted(() => {
  function rows(sql: string, params: any[] = []): any[] {
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.includes('from "PlatformModule" where "key"')) return state.catalog.filter((row) => row.key === params[0]);
    if (sql.includes('from "PlatformModule"')) return state.catalog;
    if (sql.includes('from "TenantFeature"')) return state.features ? [state.features] : [];
    if (sql.includes('from "TenantModuleEntitlement"') && sql.includes('"moduleKey" = $2')) {
      return state.entitlements.filter((row) => row.tenantId === params[0] && row.moduleKey === params[1]);
    }
    if (sql.includes('from "TenantModuleEntitlement"')) return state.entitlements.filter((row) => row.tenantId === params[0]);
    if (sql.includes('insert into "TenantModuleEntitlement"') && sql.includes("on conflict")) {
      const existing = state.entitlements.find((item) => item.tenantId === params[1] && item.moduleKey === params[2]);
      if (existing) Object.assign(existing, { status: params[3], reason: params[4] });
      else state.entitlements.push({ id: params[0], tenantId: params[1], moduleKey: params[2], status: params[3], reason: params[4] });
      return [];
    }
    if (sql.includes('insert into "TenantModuleAuditLog"')) {
      state.auditLog.push({ tenantId: params[1], moduleKey: params[2], action: params[3], reason: params[4], performedBy: params[5] });
      return [];
    }
    return [];
  }
  return { rows };
});

vi.mock("@/lib/db/query", () => ({
  query: vi.fn(async (sql: string, params: any[] = []) => db.rows(sql, params)),
  queryOne: vi.fn(async (sql: string, params: any[] = []) => db.rows(sql, params)[0] ?? null),
  execute: vi.fn(async (sql: string, params: any[] = []) => { db.rows(sql, params); return { rowCount: 1 }; }),
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: async (_user: unknown, fn: (tx: any) => Promise<unknown>) => {
    // Mimic rollback: discard writes made by a transaction that throws.
    const snapshot = { entitlements: structuredClone(state.entitlements), auditLog: structuredClone(state.auditLog) };
    try {
      return await fn({ query: async (sql: string, params: any[] = []) => ({ rows: db.rows(sql, params) }) });
    } catch (error) {
      state.entitlements = snapshot.entitlements;
      state.auditLog = snapshot.auditLog;
      throw error;
    }
  },
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

  describe("dependencies", () => {
    beforeEach(() => {
      state.catalog.push(
        { key: "PARTNERS", name: "Partners", category: "PARTNER", isCore: false },
        { key: "PAYOUTS", name: "Payouts", category: "PARTNER", isCore: false },
        { key: "AUTOMATIONS", name: "Automations", category: "AUTOMATION", isCore: false },
        { key: "MARKETING", name: "Marketing Communications", category: "MARKETING", isCore: false },
        { key: "JOURNEY_ORCHESTRATION", name: "Journey Orchestration", category: "MARKETING", isCore: false },
      );
    });

    it("refuses to disable a module another enabled module depends on, and writes nothing", async () => {
      const { setTenantModuleStatus, ModuleDependencyError } = await import("@/lib/server/module-entitlements");
      const attempt = setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "PARTNERS", "DISABLED", "Downgrade");
      await expect(attempt).rejects.toBeInstanceOf(ModuleDependencyError);
      await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "PARTNERS", "SUSPENDED")).rejects.toThrow("Payouts depends on Partners. Disable Payouts first.");
      expect(state.entitlements).toHaveLength(0);
      expect(state.auditLog).toHaveLength(0);
    });

    it("allows the change once the dependent module is off, and refuses re-enabling it without its requirement", async () => {
      const { setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
      await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "PAYOUTS", "DISABLED");
      await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "PARTNERS", "DISABLED");
      await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "PAYOUTS", "TRIAL", null, { trialEndsAt: new Date(Date.now() + 864e5).toISOString() })).rejects.toThrow("Payouts requires Partners. Enable Partners first.");
      await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "PARTNERS", "ENABLED");
      await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "PAYOUTS", "ENABLED")).resolves.toMatchObject({ moduleKey: "PAYOUTS", status: "ENABLED" });
    });

    it("ignores an overlapping legacy feature flag (decision 15): the module alone decides", async () => {
      state.features = { payoutsEnabled: false, automationEnabled: true } as any;
      const { setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
      // Payouts is entitled, so it counts as on even with its old flag off: Partners can't go.
      await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "PARTNERS", "DISABLED")).rejects.toThrow("Payouts depends on Partners");
    });

    it("names every missing requirement for a multi-dependency module", async () => {
      const { setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
      await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "JOURNEY_ORCHESTRATION", "DISABLED");
      await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "MARKETING", "DISABLED");
      await setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "AUTOMATIONS", "DISABLED");
      await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "JOURNEY_ORCHESTRATION", "ENABLED")).rejects.toThrow(
        "Journey Orchestration requires Automations and Marketing Communications. Enable Automations and Marketing Communications first.",
      );
    });

    // The feature-flags API now switches the module for these flags (decision 15), so the module
    // change's dependency check is what protects a flag change too.
    it("blocks switching off a module another enabled module depends on", async () => {
      const { setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
      await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "AUTOMATIONS", "DISABLED")).rejects.toThrow(
        "Journey Orchestration depends on Automations. Disable Journey Orchestration first.",
      );
    });

    it("reports existing violations created before the rules existed", async () => {
      state.entitlements.push({ tenantId: "tenant-1", moduleKey: "PARTNERS", status: "DISABLED" });
      const { getTenantModuleDependencyWarnings } = await import("@/lib/server/module-entitlements");
      expect(await getTenantModuleDependencyWarnings("tenant-1")).toEqual([
        { moduleKey: "PAYOUTS", missing: ["PARTNERS"], message: "Payouts won't work: Partners is disabled." },
      ]);
    });
  });
  it("requires a future end date for a trial", async () => {
    const { setTenantModuleStatus } = await import("@/lib/server/module-entitlements");
    await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "NEXT_BEST_ACTION", "TRIAL")).rejects.toThrow("TRIAL_END_DATE_REQUIRED");
    await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "NEXT_BEST_ACTION", "TRIAL", null, { trialEndsAt: "2000-01-01T00:00:00Z" })).rejects.toThrow("TRIAL_END_DATE_REQUIRED");
    const end = new Date(Date.now() + 14 * 864e5).toISOString();
    await expect(setTenantModuleStatus(PLATFORM_ADMIN, "tenant-1", "NEXT_BEST_ACTION", "TRIAL", null, { trialEndsAt: end })).resolves.toMatchObject({ status: "TRIAL", trialEndsAt: end });
  });
});

