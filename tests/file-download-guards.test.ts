import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ queryOne: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { assertAccountActiveForDownload } from "@/lib/server/file-download-guards";

beforeEach(() => {
  dbMocks.queryOne.mockReset();
});

describe("assertAccountActiveForDownload", () => {
  it("does not throw for an active user in an active tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ status: "ACTIVE", tenantStatus: "ACTIVE" });
    await expect(assertAccountActiveForDownload({ id: "user-1", tenantId: "tenant-a" })).resolves.toBeUndefined();
  });

  it("throws ACCOUNT_DEACTIVATED when the user's status isn't ACTIVE", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ status: "INACTIVE", tenantStatus: "ACTIVE" });
    await expect(assertAccountActiveForDownload({ id: "user-1", tenantId: "tenant-a" })).rejects.toThrow("ACCOUNT_DEACTIVATED");
  });

  it("throws TENANT_SUSPENDED when the tenant is suspended, even for an active user", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ status: "ACTIVE", tenantStatus: "SUSPENDED" });
    await expect(assertAccountActiveForDownload({ id: "user-1", tenantId: "tenant-a" })).rejects.toThrow("TENANT_SUSPENDED");
  });

  it("skips the check entirely for a platform admin", async () => {
    await expect(assertAccountActiveForDownload({ id: "admin-1", tenantId: "tenant-a", isPlatformAdmin: true })).resolves.toBeUndefined();
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
  });

  it("does not throw when no row is found (defensive default, doesn't block on a lookup miss)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(assertAccountActiveForDownload({ id: "user-1", tenantId: "tenant-a" })).resolves.toBeUndefined();
  });
});
