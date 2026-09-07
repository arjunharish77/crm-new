import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import {
  changeTenantEnvironment,
  upsertTenantMaintenanceBanner,
  isTenantSuspended,
  getTenantConfigForPlatformAdmin,
} from "@/lib/repositories/auth-admin-postgres";

describe("changeTenantEnvironment", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("throws TENANT_NOT_FOUND when the tenant doesn't exist", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(changeTenantEnvironment("missing", "SANDBOX")).rejects.toThrow("TENANT_NOT_FOUND");
  });

  it("updates and returns the tenant's environment", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "tenant-a", environment: "SANDBOX" });
    const result = await changeTenantEnvironment("tenant-a", "SANDBOX");
    expect(result.environment).toBe("SANDBOX");
    expect(dbMocks.queryOne.mock.calls[0][1]).toEqual(["SANDBOX", "tenant-a"]);
  });
});

describe("upsertTenantMaintenanceBanner", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("updates an existing TenantConfig row when one already exists", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "config-1" }) // existence check
      .mockResolvedValueOnce({ maintenanceActive: true, maintenanceMessage: "Down for maintenance" });

    const result = await upsertTenantMaintenanceBanner("tenant-a", { active: true, message: "Down for maintenance" });

    expect(result.maintenanceActive).toBe(true);
    expect(String(dbMocks.queryOne.mock.calls[1][0])).toContain('update "TenantConfig"');
  });

  it("inserts a new TenantConfig row when none exists yet (most tenants have none)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ maintenanceActive: true, maintenanceMessage: null });

    await upsertTenantMaintenanceBanner("tenant-a", { active: true });

    expect(String(dbMocks.queryOne.mock.calls[1][0])).toContain('insert into "TenantConfig"');
  });
});

describe("isTenantSuspended", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("returns false without a tenantId", async () => {
    expect(await isTenantSuspended(null)).toBe(false);
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
  });

  it("returns true only when the tenant's status is SUSPENDED", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ status: "SUSPENDED" });
    expect(await isTenantSuspended("tenant-a")).toBe(true);
  });

  it("returns false for an ACTIVE tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ status: "ACTIVE" });
    expect(await isTenantSuspended("tenant-a")).toBe(false);
  });
});

describe("getTenantConfigForPlatformAdmin", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("returns null when the tenant doesn't exist", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect(await getTenantConfigForPlatformAdmin("missing")).toBeNull();
  });

  it("defaults maintenance fields when no TenantConfig row exists", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "tenant-a", name: "Acme", status: "ACTIVE", plan: "BASIC", environment: "PRODUCTION" })
      .mockResolvedValueOnce(null);

    const config = await getTenantConfigForPlatformAdmin("tenant-a");

    expect(config?.maintenanceActive).toBe(false);
    expect(config?.maintenanceMessage).toBeNull();
    expect(config?.tenant.environment).toBe("PRODUCTION");
  });
});
