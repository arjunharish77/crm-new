import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const moduleMocks = vi.hoisted(() => ({ assertModuleEnabled: vi.fn().mockResolvedValue(undefined), isModuleEnabledForTenant: vi.fn().mockResolvedValue(true) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/module-entitlements", () => moduleMocks);

import {
  registerMarketplaceApp,
  updateMarketplaceApp,
  approveAppInstall,
  rejectAppInstall,
  suspendAppInstall,
  reinstateAppInstall,
  uninstallApp,
  rotateAppSecret,
  listMarketplaceAppsForTenant,
  listAppInstallsForTenant,
  listPermissionGrantsForInstall,
  updateAppDeliveryLimit,
  updateAppRateLimit,
  getConnectorContractForApp,
  approvePermissionChange,
  rejectPermissionChange,
  listPendingPermissionChangesForTenant,
  listMarketplaceAppsForPlatformAdmin,
  suspendAppAsPlatformAdmin,
  rotateAppSecretAsPlatformAdmin,
  requestPublishApp,
  listPublishedAppsForCatalog,
  requestInstallOfPublishedApp,
  listPendingVersionsForPlatformAdmin,
  approveAppVersion,
  rejectAppVersion,
  unpublishApp,
  setAppTrustLevel,
  blockAppForTenant,
  unblockAppForTenant,
  listAppTenantBlocksForPlatformAdmin,
  reviewAppInstall,
  approvePlatformWritePermissions,
  rejectPlatformWritePermissions,
  listPendingPlatformPermissionChangesForPlatformAdmin,
  checkAppCompatibilityForTenant,
  rollbackAppToVersion,
  setAppDeprecation,
} from "@/lib/repositories/marketplace-postgres";
import { DatabaseError } from "@/lib/db/errors";
import { encryptSecretAtRest } from "@/lib/server/secret-encryption";

const user = { id: "user-1", tenantId: "tenant-a" };

function appRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-1",
    tenantId: "tenant-a",
    name: "Test App",
    description: null,
    category: "CUSTOM",
    isPrivate: true,
    redirectUrls: [],
    webhookUrl: null,
    eventSubscriptions: ["LEAD_CREATED"],
    requestedPermissions: { leads: "read" },
    ownerId: "user-1",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("registerMarketplaceApp", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws APP_NAME_REQUIRED for a blank name", async () => {
    await expect(registerMarketplaceApp(user, { name: "  " })).rejects.toThrow("APP_NAME_REQUIRED");
  });

  it("propagates a disabled Marketplace module", async () => {
    moduleMocks.assertModuleEnabled.mockRejectedValueOnce(new Error("MODULE_DISABLED:MARKETPLACE"));
    await expect(registerMarketplaceApp(user, { name: "App" })).rejects.toThrow("MODULE_DISABLED");
  });

  it("throws DUPLICATE_APP_NAME on a unique-constraint violation", async () => {
    dbMocks.queryOne.mockRejectedValueOnce(new DatabaseError("duplicate", { code: "23505" }));
    await expect(registerMarketplaceApp(user, { name: "Dup" })).rejects.toThrow("DUPLICATE_APP_NAME");
  });

  it("creates the app, a version snapshot, event subscriptions, a secret, and a PENDING_APPROVAL install", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(appRow()) // insert MarketplaceApp
      .mockResolvedValueOnce({ version: null }) // version max lookup
      .mockResolvedValueOnce({ id: "install-1", status: "PENDING_APPROVAL" }); // insert TenantAppInstall

    const result = await registerMarketplaceApp(user, {
      name: "Test App",
      eventSubscriptions: ["LEAD_CREATED"],
      requestedPermissions: { leads: "read" },
    });

    expect(result.install?.status).toBe("PENDING_APPROVAL");
    expect(result.secret).toMatch(/^[0-9a-f]{48}$/);
    expect(result.signingSecret).toMatch(/^[0-9a-f]{48}$/);
    expect(result.secret).not.toBe(result.signingSecret);

    const versionInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "MarketplaceAppVersion"'));
    expect(versionInsert).toBeTruthy();
    const eventInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppEventSubscription"'));
    expect(eventInsert?.[1]).toContain("LEAD_CREATED");
    const secretInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppSecret"'));
    expect(secretInsert).toBeTruthy();

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      user,
      "CREATE",
      "MARKETPLACE_APP",
      expect.any(String),
      null,
      expect.anything(),
      expect.objectContaining({ installId: "install-1" }),
    );
  });

  it("silently drops unrecognized permission scopes rather than storing garbage", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(appRow({ requestedPermissions: { leads: "read" } }))
      .mockResolvedValueOnce({ version: null })
      .mockResolvedValueOnce({ id: "install-1", status: "PENDING_APPROVAL" });

    await registerMarketplaceApp(user, { name: "Test App", requestedPermissions: { leads: "read", opportunities: "delete-everything" } });

    const insertCall = dbMocks.queryOne.mock.calls[0];
    expect(insertCall[1]).toContainEqual({ leads: "read" });
  });
});

describe("updateMarketplaceApp", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(updateMarketplaceApp(user, "missing", { description: "x" })).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("writes a new version snapshot on every update", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(appRow())
      .mockResolvedValueOnce(appRow({ description: "Updated" }))
      .mockResolvedValueOnce({ version: 1 });

    await updateMarketplaceApp(user, "app-1", { description: "Updated" });

    const versionInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "MarketplaceAppVersion"'));
    expect(versionInsert?.[1]).toContain(2); // next version after max=1
  });

  describe("permission diff on upgrade", () => {
    it("applies a requestedPermissions change directly when the app has no INSTALLED install yet", async () => {
      dbMocks.queryOne.mockImplementation((sql: string) => {
        if (sql.includes('select ') && sql.includes('from "MarketplaceApp" where "tenantId"')) return Promise.resolve(appRow());
        if (sql.startsWith('update "MarketplaceApp" set')) return Promise.resolve(appRow({ requestedPermissions: { leads: "write" } }));
        if (sql.includes('select max(version)')) return Promise.resolve({ version: 1 });
        if (sql.includes('from "TenantAppInstall" where "tenantId"')) return Promise.resolve(null); // no INSTALLED row
        return Promise.resolve(null);
      });

      await updateMarketplaceApp(user, "app-1", { requestedPermissions: { leads: "write" } });

      const pendingUpdate = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"pendingPermissions"'));
      expect(pendingUpdate).toBeUndefined(); // never touched -- there's no live install to protect
    });

    it("narrows access immediately without requiring approval (a module dropped, or write downgraded to read)", async () => {
      dbMocks.queryOne.mockImplementation((sql: string) => {
        if (sql.includes('from "MarketplaceApp" where "tenantId"') && sql.startsWith('select')) return Promise.resolve(appRow());
        if (sql.startsWith('update "MarketplaceApp" set')) return Promise.resolve(appRow({ requestedPermissions: { leads: "read" } })); // was write, now read
        if (sql.includes('select max(version)')) return Promise.resolve({ version: 1 });
        if (sql.includes('from "TenantAppInstall" where "tenantId"')) return Promise.resolve({ id: "install-1" });
        return Promise.resolve(null);
      });
      dbMocks.query.mockImplementation((sql: string) => {
        if (sql.includes('from "TenantAppPermissionGrant"')) return Promise.resolve([{ moduleKey: "leads", scope: "write" }]);
        return Promise.resolve([]);
      });

      await updateMarketplaceApp(user, "app-1", { requestedPermissions: { leads: "read" } });

      const narrowCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('update "TenantAppPermissionGrant" set scope'));
      expect(narrowCall?.[1]).toEqual(["install-1", "leads"]);
      const pendingUpdate = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"pendingPermissions" = $1'));
      expect(pendingUpdate?.[1][0]).toBeNull(); // pure narrowing -- no escalation, both pending columns cleared
      expect(pendingUpdate?.[1][1]).toBeNull();
    });

    it("stages (does not immediately grant) any permission that adds access beyond what's currently granted", async () => {
      dbMocks.queryOne.mockImplementation((sql: string) => {
        if (sql.includes('from "MarketplaceApp" where "tenantId"') && sql.startsWith('select')) return Promise.resolve(appRow());
        if (sql.startsWith('update "MarketplaceApp" set')) return Promise.resolve(appRow({ requestedPermissions: { leads: "read", opportunities: "read" } }));
        if (sql.includes('select max(version)')) return Promise.resolve({ version: 1 });
        if (sql.includes('from "TenantAppInstall" where "tenantId"')) return Promise.resolve({ id: "install-1" });
        return Promise.resolve(null);
      });
      dbMocks.query.mockImplementation((sql: string) => {
        if (sql.includes('from "TenantAppPermissionGrant"')) return Promise.resolve([{ moduleKey: "leads", scope: "read" }]); // opportunities is new
        return Promise.resolve([]);
      });

      await updateMarketplaceApp(user, "app-1", { requestedPermissions: { leads: "read", opportunities: "read" } });

      const grantInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppPermissionGrant"'));
      expect(grantInsert).toBeUndefined(); // not live yet
      const pendingUpdate = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"pendingPermissions" = $1'));
      // Only the actual escalation (opportunities, a brand-new module) is staged -- "leads" was
      // already granted at the same scope, so it's not an addition and isn't re-staged.
      expect(pendingUpdate?.[1][0]).toEqual({ opportunities: "read" });
      expect(pendingUpdate?.[1][1]).toBeNull(); // no write-scope addition -- nothing for a platform admin to review
      expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
        user,
        "PERMISSION_CHANGE_REQUESTED",
        "TENANT_APP_INSTALL",
        "install-1",
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ readOnlyAdditions: { opportunities: "read" }, writeAdditions: {} }),
      );
    });

    it("treats a read-to-write upgrade on an already-granted module as an escalation too", async () => {
      dbMocks.queryOne.mockImplementation((sql: string) => {
        if (sql.includes('from "MarketplaceApp" where "tenantId"') && sql.startsWith('select')) return Promise.resolve(appRow());
        if (sql.startsWith('update "MarketplaceApp" set')) return Promise.resolve(appRow({ requestedPermissions: { leads: "write" } }));
        if (sql.includes('select max(version)')) return Promise.resolve({ version: 1 });
        if (sql.includes('from "TenantAppInstall" where "tenantId"')) return Promise.resolve({ id: "install-1" });
        return Promise.resolve(null);
      });
      dbMocks.query.mockImplementation((sql: string) => {
        if (sql.includes('from "TenantAppPermissionGrant"')) return Promise.resolve([{ moduleKey: "leads", scope: "read" }]);
        return Promise.resolve([]);
      });

      await updateMarketplaceApp(user, "app-1", { requestedPermissions: { leads: "write" } });

      // A write-scope escalation routes to pendingPlatformPermissions (needs a platform admin),
      // NOT pendingPermissions (tenant-admin approvable) -- gap checklist Module 16's
      // "platform-admin-only restricted capabilities" sub-item.
      const pendingUpdate = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"pendingPermissions" = $1'));
      expect(pendingUpdate?.[1][0]).toBeNull();
      expect(pendingUpdate?.[1][1]).toEqual({ leads: "write" });
    });
  });
});

describe("approvePermissionChange / rejectPermissionChange", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("approvePermissionChange throws NO_PENDING_PERMISSION_CHANGE when there's nothing pending", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", pendingPermissions: null });
    await expect(approvePermissionChange(user, "install-1")).rejects.toThrow("NO_PENDING_PERMISSION_CHANGE");
  });

  it("approvePermissionChange materializes the pending permissions into real grants and clears the pending flag", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", pendingPermissions: { opportunities: "read" } });

    const result = await approvePermissionChange(user, "install-1");

    expect(result.grantedPermissions).toEqual({ opportunities: "read" });
    const grantInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppPermissionGrant"'));
    expect(grantInsert?.[1]).toContain("opportunities");
    const clearPending = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"pendingPermissions" = null'));
    expect(clearPending).toBeTruthy();
  });

  it("rejectPermissionChange throws NO_PENDING_PERMISSION_CHANGE when the atomic clear finds no matching row", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(rejectPermissionChange(user, "install-1")).rejects.toThrow("NO_PENDING_PERMISSION_CHANGE");
  });

  it("rejectPermissionChange clears the pending change", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1" });
    const result = await rejectPermissionChange(user, "install-1");
    expect(result.installId).toBe("install-1");
  });
});

describe("listPendingPermissionChangesForTenant", () => {
  it("scopes to the tenant and only rows with a pending change", async () => {
    dbMocks.query.mockReset().mockResolvedValueOnce([{ id: "install-1", appName: "Test App", pendingPermissions: { leads: "write" } }]);
    const changes = await listPendingPermissionChangesForTenant(user);
    expect(changes).toHaveLength(1);
    expect(dbMocks.query.mock.calls[0][1]).toEqual(["tenant-a"]);
  });
});

describe("app install lifecycle", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("approveAppInstall throws APP_INSTALL_NOT_PENDING when the atomic claim misses", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(approveAppInstall(user, "install-1")).rejects.toThrow("APP_INSTALL_NOT_PENDING");
  });

  it("approveAppInstall throws APP_INSTALL_NOT_REVIEWED when the tracked review step hasn't happened yet", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ appId: "app-1", reviewState: "PENDING" });
    await expect(approveAppInstall(user, "install-1")).rejects.toThrow("APP_INSTALL_NOT_REVIEWED");
  });

  it("approveAppInstall materializes read-only requestedPermissions immediately and stages any write scope for a platform admin instead", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ appId: "app-1", reviewState: "REVIEWED" }) // pending-install lookup (for the compatibility check)
      .mockResolvedValueOnce({ requiredContractVersion: "1.0", dependsOnAppIds: [] }) // checkAppCompatibilityForTenant's app lookup
      .mockResolvedValueOnce({ requestedPermissions: { leads: "read", opportunities: "write" } }) // app lookup
      .mockResolvedValueOnce({ version: 3 }) // latest-approved-version lookup, for real per-install version tracking
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "INSTALLED" }); // atomic claim

    await approveAppInstall(user, "install-1");

    // Read-only ("leads") grants immediately; write ("opportunities") is staged, not granted yet.
    const grantInserts = dbMocks.execute.mock.calls.filter((c) => String(c[0]).includes('insert into "TenantAppPermissionGrant"'));
    expect(grantInserts).toHaveLength(1);
    expect(grantInserts[0][1][3]).toBe("leads");

    const claimCall = dbMocks.queryOne.mock.calls[4];
    expect(claimCall[1][2]).toEqual({ opportunities: "write" });
    expect(claimCall[1][3]).toBe(3); // installedVersion set to the latest-approved version
  });

  it("approveAppInstall throws APP_INCOMPATIBLE when the app's declared contract version doesn't match the platform's", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ appId: "app-1", reviewState: "REVIEWED" }) // pending-install lookup
      .mockResolvedValueOnce({ requiredContractVersion: "2.0", dependsOnAppIds: [] }); // mismatched contract version

    await expect(approveAppInstall(user, "install-1")).rejects.toThrow("APP_INCOMPATIBLE");
  });

  it("approveAppInstall throws APP_INCOMPATIBLE when a declared dependency isn't installed for this tenant", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ appId: "app-1", reviewState: "REVIEWED" }) // pending-install lookup
      .mockResolvedValueOnce({ requiredContractVersion: "1.0", dependsOnAppIds: ["app-dep"] }); // one declared dependency
    dbMocks.query
      .mockResolvedValueOnce([]) // no installed rows matching the dependency
      .mockResolvedValueOnce([{ id: "app-dep", name: "Required App" }]); // resolve the missing dependency's name

    await expect(approveAppInstall(user, "install-1")).rejects.toThrow("APP_INCOMPATIBLE");
  });

  it("rejectAppInstall throws APP_INSTALL_NOT_PENDING when not pending", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(rejectAppInstall(user, "install-1", "not needed")).rejects.toThrow("APP_INSTALL_NOT_PENDING");
  });

  it("suspendAppInstall throws APP_INSTALL_NOT_INSTALLED when not currently installed", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(suspendAppInstall(user, "install-1")).rejects.toThrow("APP_INSTALL_NOT_INSTALLED");
  });

  it("reinstateAppInstall throws APP_INSTALL_NOT_SUSPENDED when not currently suspended", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(reinstateAppInstall(user, "install-1")).rejects.toThrow("APP_INSTALL_NOT_SUSPENDED");
  });

  it("uninstallApp throws APP_INSTALL_NOT_ACTIVE when neither installed nor suspended", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(uninstallApp(user, "install-1")).rejects.toThrow("APP_INSTALL_NOT_ACTIVE");
  });

  it("uninstallApp revokes all permission grants for the install", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "INSTALLED" }) // existence lookup
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "UNINSTALLED" }); // final update
    await uninstallApp(user, "install-1");
    const deleteGrants = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('delete from "TenantAppPermissionGrant"'));
    expect(deleteGrants?.[1]).toEqual(["install-1"]);
  });

  it("uninstallApp deletes the app's TenantAppSecret so the credential can no longer authenticate", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "INSTALLED" })
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "UNINSTALLED" });
    await uninstallApp(user, "install-1");
    const deleteSecret = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('delete from "TenantAppSecret"'));
    expect(deleteSecret?.[1]).toEqual(["tenant-a", "app-1"]);
  });

  it("uninstallApp deactivates the app's event subscriptions, scoped to this tenant only", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "INSTALLED" })
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "UNINSTALLED" });
    await uninstallApp(user, "install-1");
    const deactivate = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('update "TenantAppEventSubscription" set "isActive" = false'));
    expect(deactivate?.[1]).toEqual(["tenant-a", "app-1"]);
  });

  it("uninstallApp cancels any still-pending or in-flight deliveries for the app", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "INSTALLED" })
      .mockResolvedValueOnce({ id: "install-1", appId: "app-1", status: "UNINSTALLED" });
    await uninstallApp(user, "install-1");
    const cancelDeliveries = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("\"TenantAppDelivery\" set status = 'CANCELLED'"));
    expect(cancelDeliveries?.[1]).toEqual(expect.arrayContaining(["app-1"]));
  });
});

// Gap checklist Module 16's install-approval workflow, "security review"/"permission review"
// sub-item, built per explicit user direction: a real, tracked, auditable review step.
describe("reviewAppInstall", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("marks a pending install REVIEWED with the reviewer's comment", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", reviewState: "REVIEWED", reviewComment: "Looks safe" });
    const result = await reviewAppInstall(user, "install-1", "Looks safe");
    expect(result.reviewState).toBe("REVIEWED");
    const updateCall = dbMocks.queryOne.mock.calls[0];
    expect(updateCall[1]).toEqual(["Looks safe", "user-1", expect.any(String), "tenant-a", "install-1"]);
  });

  it("throws when the install isn't PENDING_APPROVAL", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(reviewAppInstall(user, "install-1")).rejects.toThrow("APP_INSTALL_NOT_PENDING");
  });
});

// Gap checklist Module 16's scoped-app-permissions sub-item, "platform-admin-only restricted
// capabilities", built per explicit user decision: ANY write-scope permission needs a distinct
// platform-admin sign-off, separate from a tenant admin's own install/upgrade approval.
describe("approvePlatformWritePermissions / rejectPlatformWritePermissions", () => {
  const platformAdmin = { id: "platform-admin-1" };

  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("materializes staged write permissions and clears the pending column", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", pendingPlatformPermissions: { opportunities: "write" } });
    const result = await approvePlatformWritePermissions(platformAdmin, "tenant-a", "install-1");
    expect(result.grantedPermissions).toEqual({ opportunities: "write" });
    const grantInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppPermissionGrant"'));
    expect(grantInsert?.[1]).toEqual(expect.arrayContaining(["opportunities", "write"]));
    const clearCall = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"pendingPlatformPermissions" = null'));
    expect(clearCall).toBeTruthy();
  });

  it("throws when there's nothing pending", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1", pendingPlatformPermissions: null });
    await expect(approvePlatformWritePermissions(platformAdmin, "tenant-a", "install-1")).rejects.toThrow("NO_PENDING_PLATFORM_PERMISSION_CHANGE");
  });

  it("rejectPlatformWritePermissions clears the pending column without granting anything", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "install-1" });
    await rejectPlatformWritePermissions(platformAdmin, "tenant-a", "install-1");
    const grantInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppPermissionGrant"'));
    expect(grantInsert).toBeUndefined();
  });

  it("rejectPlatformWritePermissions throws when there's nothing pending", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(rejectPlatformWritePermissions(platformAdmin, "tenant-a", "install-1")).rejects.toThrow("NO_PENDING_PLATFORM_PERMISSION_CHANGE");
  });
});

describe("listPendingPlatformPermissionChangesForPlatformAdmin", () => {
  it("lists every install with a pending platform permission change, cross-tenant", async () => {
    dbMocks.query.mockReset().mockResolvedValueOnce([{ id: "install-1", tenantId: "tenant-a" }, { id: "install-2", tenantId: "tenant-b" }]);
    const result = await listPendingPlatformPermissionChangesForPlatformAdmin();
    expect(result).toHaveLength(2);
    expect(dbMocks.query.mock.calls[0][1]).toBeUndefined(); // no tenant-scoping parameter -- cross-tenant by design
  });
});

describe("rotateAppSecret", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws APP_SECRET_NOT_FOUND when no secret row exists", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(rotateAppSecret(user, "app-1")).rejects.toThrow("APP_SECRET_NOT_FOUND");
  });

  it("moves the current secret into previousSecret and returns a new plaintext secret", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "secret-1", secret: "old-secret", signingSecret: encryptSecretAtRest("sign-1") })
      .mockResolvedValueOnce({ id: "secret-1", secret: "new-secret", previousSecret: "old-secret", signingSecret: encryptSecretAtRest("sign-1") });

    const result = await rotateAppSecret(user, "app-1");

    expect(result.secret).not.toBe("old-secret");
    const updateCall = dbMocks.queryOne.mock.calls[1];
    expect(updateCall[1]).toContain("old-secret");
  });
});

describe("read paths", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("listMarketplaceAppsForTenant scopes to the tenant", async () => {
    dbMocks.query.mockResolvedValueOnce([appRow()]);
    const apps = await listMarketplaceAppsForTenant(user);
    expect(apps).toHaveLength(1);
    expect(dbMocks.query.mock.calls[0][1]).toEqual(["tenant-a"]);
  });

  it("listAppInstallsForTenant filters by status when given", async () => {
    dbMocks.query.mockResolvedValueOnce([]);
    await listAppInstallsForTenant(user, "PENDING_APPROVAL");
    expect(dbMocks.query.mock.calls[0][1]).toEqual(["tenant-a", "PENDING_APPROVAL"]);
  });

  it("listPermissionGrantsForInstall scopes by tenant and install", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "grant-1", moduleKey: "leads", scope: "read" }]);
    const grants = await listPermissionGrantsForInstall(user, "install-1");
    expect(grants).toHaveLength(1);
    expect(dbMocks.query.mock.calls[0][1]).toEqual(["tenant-a", "install-1"]);
  });
});

describe("updateAppDeliveryLimit", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a non-positive limit", async () => {
    await expect(updateAppDeliveryLimit(user, "app-1", 0)).rejects.toThrow("INVALID_DAILY_LIMIT");
  });

  it("accepts null to mean unlimited", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", dailyDeliveryLimit: null });
    const result = await updateAppDeliveryLimit(user, "app-1", null);
    expect((result as any).dailyDeliveryLimit).toBeNull();
  });

  it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(updateAppDeliveryLimit(user, "missing", 10)).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("updates the limit for a real value", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", dailyDeliveryLimit: 50 });
    const result = await updateAppDeliveryLimit(user, "app-1", 50);
    expect((result as any).dailyDeliveryLimit).toBe(50);
  });
});

describe("updateAppRateLimit", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a non-positive rate limit", async () => {
    await expect(updateAppRateLimit(user, "app-1", 0)).rejects.toThrow("INVALID_RATE_LIMIT");
  });

  it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(updateAppRateLimit(user, "missing", 100)).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("updates the rate limit for a real value", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", rateLimitPerMinute: 120 });
    const result = await updateAppRateLimit(user, "app-1", 120);
    expect((result as any).rateLimitPerMinute).toBe(120);
  });
});

describe("getConnectorContractForApp", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(getConnectorContractForApp(user, "missing")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("returns a contract reflecting the app's own real rate limit and event subscriptions", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ rateLimitPerMinute: 90, eventSubscriptions: ["LEAD_CREATED"] });
    const contract = await getConnectorContractForApp(user, "app-1");
    expect(contract.inboundAuth).toMatchObject({ type: "bearer", rateLimitPerMinute: 90 });
    expect(contract.outboundWebhook).toMatchObject({ subscribedEventTypes: ["LEAD_CREATED"], verification: { algorithm: "HMAC-SHA256" } });
  });
});

describe("platform-admin cross-tenant controls", () => {
  const platformAdmin = { id: "admin-1" };

  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("listMarketplaceAppsForPlatformAdmin queries across every tenant, not scoped to one", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "app-1", tenantName: "Acme" }]);
    const apps = await listMarketplaceAppsForPlatformAdmin();
    expect(apps).toHaveLength(1);
    expect(dbMocks.query.mock.calls[0][1]).toEqual([]);
    expect(moduleMocks.assertModuleEnabled).not.toHaveBeenCalled();
  });

  describe("suspendAppAsPlatformAdmin", () => {
    it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(suspendAppAsPlatformAdmin(platformAdmin, "missing", "compromised")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
    });

    it("deactivates the app AND suspends its live install, stronger than a tenant-level suspend", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-a", name: "Bad App" });

      await suspendAppAsPlatformAdmin(platformAdmin, "app-1", "reported malicious");

      const appDeactivate = dbMocks.queryOne.mock.calls[0];
      expect(String(appDeactivate[0])).toContain('"isActive" = false');
      const installSuspend = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('"TenantAppInstall"'));
      expect(installSuspend?.[1]).toContain("reported malicious");
      expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
        { id: "admin-1", tenantId: "tenant-a" },
        "PLATFORM_ADMIN_SUSPEND",
        "MARKETPLACE_APP",
        "app-1",
        null,
        null,
        expect.objectContaining({ reason: "reported malicious" }),
      );
    });
  });

  describe("rotateAppSecretAsPlatformAdmin", () => {
    it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist", async () => {
      dbMocks.queryOne.mockResolvedValueOnce(null);
      await expect(rotateAppSecretAsPlatformAdmin(platformAdmin, "missing", "tenant-a")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
    });

    it("throws APP_SECRET_NOT_FOUND when this tenant has no secret row for the app", async () => {
      dbMocks.queryOne.mockResolvedValueOnce({ tenantId: "tenant-a" }).mockResolvedValueOnce(null);
      await expect(rotateAppSecretAsPlatformAdmin(platformAdmin, "app-1", "tenant-a")).rejects.toThrow("APP_SECRET_NOT_FOUND");
    });

    it("rotates a specific tenant's secret, not just the app owner's, and audit-logs it against that tenant", async () => {
      dbMocks.queryOne
        .mockResolvedValueOnce({ tenantId: "tenant-owner" })
        .mockResolvedValueOnce({ id: "secret-1", secret: "old-secret", signingSecret: encryptSecretAtRest("sign-1") })
        .mockResolvedValueOnce({ id: "secret-1", secret: "new-secret", signingSecret: encryptSecretAtRest("sign-1") });

      const result = await rotateAppSecretAsPlatformAdmin(platformAdmin, "app-1", "tenant-installer");

      expect(result.secret).not.toBe("old-secret");
      const secretLookup = dbMocks.queryOne.mock.calls[1];
      expect(secretLookup[1]).toEqual(["tenant-installer", "app-1"]);
      expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
        { id: "admin-1", tenantId: "tenant-installer" },
        "PLATFORM_ADMIN_ROTATE_SECRET",
        "TENANT_APP_SECRET",
        "secret-1",
        null,
        null,
        { appId: "app-1" },
      );
    });
  });
});

describe("requestPublishApp", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(requestPublishApp(user, "missing")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("throws APP_ALREADY_PUBLISHED_OR_PENDING when the app is already published or under review", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(appRow({ publishStatus: "PUBLISHED" }));
    await expect(requestPublishApp(user, "app-1")).rejects.toThrow("APP_ALREADY_PUBLISHED_OR_PENDING");
  });

  it("moves a DRAFT app to PENDING_REVIEW and resets its latest version for a fresh review", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce(appRow({ publishStatus: "DRAFT" }))
      .mockResolvedValueOnce(appRow({ publishStatus: "PENDING_REVIEW" }));

    const result = await requestPublishApp(user, "app-1");

    expect(result.publishStatus).toBe("PENDING_REVIEW");
    const versionReset = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes("\"approvalStatus\" = 'PENDING'"));
    expect(versionReset).toBeTruthy();
  });
});

describe("listPublishedAppsForCatalog", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("excludes the caller's own tenant and only ever queries PUBLISHED apps", async () => {
    dbMocks.query.mockResolvedValueOnce([]);
    await listPublishedAppsForCatalog(user);
    const sql = String(dbMocks.query.mock.calls[0][0]);
    expect(sql).toContain(`"publishStatus" = 'PUBLISHED'`);
    expect(sql).toContain(`a."tenantId" <> $1`);
    expect(dbMocks.query.mock.calls[0][1]).toEqual(["tenant-a"]);
  });

  it("derives supportedModules from the app's live requestedPermissions keys", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "app-2", requestedPermissions: { leads: "read", opportunities: "write" } }]);
    const result = await listPublishedAppsForCatalog(user);
    expect(result[0].supportedModules).toEqual(["leads", "opportunities"]);
  });
});

describe("requestInstallOfPublishedApp", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws MARKETPLACE_APP_NOT_PUBLISHED when the app isn't published", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-owner", isActive: true, publishStatus: "DRAFT" });
    await expect(requestInstallOfPublishedApp(user, "app-1")).rejects.toThrow("MARKETPLACE_APP_NOT_PUBLISHED");
  });

  it("throws CANNOT_INSTALL_OWN_APP when the caller's own tenant already owns the app", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-a", isActive: true, publishStatus: "PUBLISHED" });
    await expect(requestInstallOfPublishedApp(user, "app-1")).rejects.toThrow("CANNOT_INSTALL_OWN_APP");
  });

  it("throws APP_VERSION_PENDING_REVIEW when a newer, not-yet-approved version exists", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-owner", isActive: true, publishStatus: "PUBLISHED", eventSubscriptions: [] })
      .mockResolvedValueOnce(null) // no tenant block
      .mockResolvedValueOnce({ maxVersion: 3, maxApproved: 2 });
    await expect(requestInstallOfPublishedApp(user, "app-1")).rejects.toThrow("APP_VERSION_PENDING_REVIEW");
  });

  it("throws APP_ALREADY_INSTALLED when this tenant already has an install row for the app", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-owner", isActive: true, publishStatus: "PUBLISHED", eventSubscriptions: [] })
      .mockResolvedValueOnce(null) // no tenant block
      .mockResolvedValueOnce({ maxVersion: 1, maxApproved: 1 })
      .mockResolvedValueOnce({ id: "install-existing" });
    await expect(requestInstallOfPublishedApp(user, "app-1")).rejects.toThrow("APP_ALREADY_INSTALLED");
  });

  it("creates a fresh install, secret, and event subscriptions scoped to the installing tenant", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-owner", isActive: true, publishStatus: "PUBLISHED", eventSubscriptions: ["LEAD_CREATED"] })
      .mockResolvedValueOnce(null) // no tenant block
      .mockResolvedValueOnce({ maxVersion: 1, maxApproved: 1 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "install-new", tenantId: "tenant-a", appId: "app-1", status: "PENDING_APPROVAL" });

    const result = await requestInstallOfPublishedApp(user, "app-1");

    expect(result.install.status).toBe("PENDING_APPROVAL");
    expect(result.secret).toMatch(/^[0-9a-f]{48}$/);
    const secretInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppSecret"'));
    expect(secretInsert?.[1]).toEqual(expect.arrayContaining(["tenant-a", "app-1"]));
    const subscriptionInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "TenantAppEventSubscription"'));
    expect(subscriptionInsert?.[1]).toEqual(expect.arrayContaining(["tenant-a", "app-1", "LEAD_CREATED"]));
  });
});

describe("listPendingVersionsForPlatformAdmin", () => {
  it("queries across every tenant for versions awaiting review", async () => {
    dbMocks.query.mockReset().mockResolvedValueOnce([{ id: "version-1" }]);
    const result = await listPendingVersionsForPlatformAdmin();
    expect(result).toHaveLength(1);
    expect(String(dbMocks.query.mock.calls[0][0])).toContain(`"approvalStatus" = 'PENDING'`);
  });
});

describe("approveAppVersion", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("throws APP_VERSION_NOT_PENDING when the version isn't pending", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(approveAppVersion({ id: "admin-1" }, "version-1")).rejects.toThrow("APP_VERSION_NOT_PENDING");
  });

  it("publishes the app when the approved version was its first-publish review", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "version-1", appId: "app-1", version: 1 })
      .mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-a", publishStatus: "PENDING_REVIEW" })
      .mockResolvedValueOnce({ id: "app-1", publishStatus: "PUBLISHED" });

    const result = await approveAppVersion({ id: "admin-1" }, "version-1");

    expect(result.app.publishStatus).toBe("PUBLISHED");
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      { id: "admin-1", tenantId: "tenant-a" },
      "APPROVE_VERSION",
      "MARKETPLACE_APP_VERSION",
      "version-1",
      null,
      expect.objectContaining({ id: "version-1" }),
      { publishedApp: true },
    );
  });

  it("approves a subsequent edit's version without re-publishing an already-published app", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "version-2", appId: "app-1", version: 2 })
      .mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-a", publishStatus: "PUBLISHED" });

    const result = await approveAppVersion({ id: "admin-1" }, "version-2");

    expect(result.app.publishStatus).toBe("PUBLISHED");
    expect(dbMocks.queryOne).toHaveBeenCalledTimes(2); // no third call -- publishStatus was already PUBLISHED, nothing to flip
  });
});

describe("rejectAppVersion", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("throws APP_VERSION_NOT_PENDING when the version isn't pending", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(rejectAppVersion({ id: "admin-1" }, "version-1", "not good")).rejects.toThrow("APP_VERSION_NOT_PENDING");
  });

  it("rejects the app's first-publish request when the rejected version was that request", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "version-1", appId: "app-1", version: 1, rejectedReason: "not good" })
      .mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-a", publishStatus: "PENDING_REVIEW" })
      .mockResolvedValueOnce({ id: "app-1", publishStatus: "REJECTED", publishRejectedReason: "not good" });

    const result = await rejectAppVersion({ id: "admin-1" }, "version-1", "not good");
    expect(result.app.publishStatus).toBe("REJECTED");
  });

  it("rejects only the version, leaving an already-published app's status untouched", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "version-2", appId: "app-1", version: 2 })
      .mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-a", publishStatus: "PUBLISHED" });

    const result = await rejectAppVersion({ id: "admin-1" }, "version-2", "regression");
    expect(result.app.publishStatus).toBe("PUBLISHED");
  });
});

describe("unpublishApp", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("throws MARKETPLACE_APP_NOT_PUBLISHED when the app isn't currently published", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(unpublishApp({ id: "admin-1" }, "app-1", "policy violation")).rejects.toThrow("MARKETPLACE_APP_NOT_PUBLISHED");
  });

  it("flips publishStatus to UNPUBLISHED without touching existing installs", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-a", publishStatus: "UNPUBLISHED", isPrivate: true });
    const result = await unpublishApp({ id: "admin-1" }, "app-1", "policy violation");
    expect(result.publishStatus).toBe("UNPUBLISHED");
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });
});

// Gap checklist Module 16's app dependency and compatibility checks, "required CRM modules"
// sub-item, built per explicit user decision.
describe("checkAppCompatibilityForTenant -- required CRM modules", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("is compatible when every required module is enabled for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ requiredContractVersion: "1.0", dependsOnAppIds: [], requiredModuleKeys: ["SERVICE_DESK"] });
    moduleMocks.isModuleEnabledForTenant.mockResolvedValue(true);

    const result = await checkAppCompatibilityForTenant(user, "app-1");

    expect(result.compatible).toBe(true);
    expect(result.missingRequiredModules).toEqual([]);
  });

  it("reports a missing required module by key and name, and marks the app incompatible", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ requiredContractVersion: "1.0", dependsOnAppIds: [], requiredModuleKeys: ["SERVICE_DESK"] });
    moduleMocks.isModuleEnabledForTenant.mockResolvedValue(false);
    dbMocks.query.mockResolvedValueOnce([{ key: "SERVICE_DESK", name: "Service Desk" }]);

    const result = await checkAppCompatibilityForTenant(user, "app-1");

    expect(result.compatible).toBe(false);
    expect(result.missingRequiredModules).toEqual([{ key: "SERVICE_DESK", name: "Service Desk" }]);
  });

  it("skips the module check entirely (no extra query) when the app declares no required modules", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ requiredContractVersion: "1.0", dependsOnAppIds: [], requiredModuleKeys: [] });
    const result = await checkAppCompatibilityForTenant(user, "app-1");
    expect(result.missingRequiredModules).toEqual([]);
    expect(dbMocks.query).not.toHaveBeenCalled();
  });
});

// Gap checklist Module 16's app dependency and compatibility checks, "safe upgrade path"/
// "rollback plan" sub-items, built per explicit user decision.
describe("rollbackAppToVersion", () => {
  beforeEach(() => {
    dbMocks.query.mockReset();
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws MARKETPLACE_APP_VERSION_NOT_FOUND when the target version doesn't exist or isn't approved", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(rollbackAppToVersion(user, "app-1", 2)).rejects.toThrow("MARKETPLACE_APP_VERSION_NOT_FOUND");
  });

  it("restores the old version's snapshot fields via updateMarketplaceApp and publishes a new tip version", async () => {
    dbMocks.queryOne.mockImplementation((sql: string) => {
      const text = String(sql);
      if (text.includes('from "MarketplaceAppVersion" where "tenantId"')) {
        return Promise.resolve({ snapshot: { description: "old desc", redirectUrls: ["https://old.example.com"], webhookUrl: "https://old.example.com/hook", eventSubscriptions: ["LEAD_CREATED"], requestedPermissions: { leads: "read" }, requiredContractVersion: "1.0", dependsOnAppIds: [], requiredModuleKeys: [] } });
      }
      if (text.includes('from "MarketplaceApp" where "tenantId"') && text.startsWith('select')) {
        return Promise.resolve({ id: "app-1", tenantId: "tenant-a", publishStatus: "DRAFT", requestedPermissions: {} });
      }
      if (text.startsWith('update "MarketplaceApp" set')) {
        return Promise.resolve({ id: "app-1", webhookUrl: "https://old.example.com/hook", requestedPermissions: { leads: "read" }, eventSubscriptions: ["LEAD_CREATED"], publishStatus: "DRAFT" });
      }
      if (text.includes('select max(version)')) return Promise.resolve({ version: 1 });
      return Promise.resolve(null);
    });
    dbMocks.query.mockResolvedValue([]);

    const result = await rollbackAppToVersion(user, "app-1", 2);

    expect(result.webhookUrl).toBe("https://old.example.com/hook");
    const versionSnapshotInsert = dbMocks.execute.mock.calls.find((c) => String(c[0]).includes('insert into "MarketplaceAppVersion"'));
    expect(versionSnapshotInsert).toBeTruthy();
  });
});

// Gap checklist Module 16's app dependency and compatibility checks, "deprecated app warning"
// sub-item, built per explicit user decision.
describe("setAppDeprecation", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("flags an app deprecated with a message", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", isDeprecated: true, deprecationMessage: "Use App v2 instead" });
    const result = await setAppDeprecation(user, "app-1", true, "Use App v2 instead");
    expect(result.isDeprecated).toBe(true);
    expect(result.deprecationMessage).toBe("Use App v2 instead");
  });

  it("clears the message when un-deprecating", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", isDeprecated: false, deprecationMessage: null });
    await setAppDeprecation(user, "app-1", false);
    const updateCall = dbMocks.queryOne.mock.calls[0];
    expect(updateCall[1][1]).toBeNull(); // message forced null when isDeprecated=false, even if one was passed
  });

  it("throws MARKETPLACE_APP_NOT_FOUND for an app outside this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(setAppDeprecation(user, "app-1", true, "x")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });
});

describe("requestInstallOfPublishedApp -- tenant block enforcement", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(0);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
  });

  it("throws APP_BLOCKED_FOR_TENANT when a platform admin has blocked this tenant from this app", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-owner", isActive: true, publishStatus: "PUBLISHED", eventSubscriptions: [] })
      .mockResolvedValueOnce({ id: "block-1" });
    await expect(requestInstallOfPublishedApp(user, "app-1")).rejects.toThrow("APP_BLOCKED_FOR_TENANT");
  });
});

describe("listPublishedAppsForCatalog -- tenant block exclusion", () => {
  it("excludes apps blocked for the caller's tenant from the query", async () => {
    dbMocks.query.mockReset().mockResolvedValueOnce([]);
    moduleMocks.assertModuleEnabled.mockReset().mockResolvedValue(undefined);
    await listPublishedAppsForCatalog(user);
    const sql = String(dbMocks.query.mock.calls[0][0]);
    expect(sql).toContain('"MarketplaceAppTenantBlock"');
  });
});

describe("setAppTrustLevel", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("rejects an invalid trust level", async () => {
    await expect(setAppTrustLevel({ id: "admin-1" }, "app-1", "SUPER_TRUSTED")).rejects.toThrow("INVALID_TRUST_LEVEL");
  });

  it("throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(setAppTrustLevel({ id: "admin-1" }, "missing", "VERIFIED")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("sets the trust level and audit-logs it", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-owner", trustLevel: "VERIFIED" });
    const result = await setAppTrustLevel({ id: "admin-1" }, "app-1", "VERIFIED");
    expect(result.trustLevel).toBe("VERIFIED");
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      { id: "admin-1", tenantId: "tenant-owner" },
      "SET_TRUST_LEVEL",
      "MARKETPLACE_APP",
      "app-1",
      null,
      null,
      { trustLevel: "VERIFIED" },
    );
  });
});

describe("blockAppForTenant / unblockAppForTenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset().mockResolvedValue(1);
    crmMocks.createAuditLog.mockReset().mockResolvedValue(undefined);
  });

  it("blockAppForTenant throws MARKETPLACE_APP_NOT_FOUND when the app doesn't exist", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(blockAppForTenant({ id: "admin-1" }, "tenant-b", "missing", "reason")).rejects.toThrow("MARKETPLACE_APP_NOT_FOUND");
  });

  it("blockAppForTenant inserts a block row scoped to the specific tenant and app", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "app-1", tenantId: "tenant-owner" });
    const result = await blockAppForTenant({ id: "admin-1" }, "tenant-b", "app-1", "contractual restriction");
    expect(result).toEqual({ tenantId: "tenant-b", appId: "app-1", reason: "contractual restriction" });
    const insertCall = dbMocks.execute.mock.calls[0];
    expect(insertCall[1]).toEqual(expect.arrayContaining(["tenant-b", "app-1", "contractual restriction"]));
  });

  it("unblockAppForTenant throws APP_TENANT_BLOCK_NOT_FOUND when no block row exists", async () => {
    dbMocks.execute.mockReset().mockResolvedValueOnce(0);
    await expect(unblockAppForTenant({ id: "admin-1" }, "tenant-b", "app-1")).rejects.toThrow("APP_TENANT_BLOCK_NOT_FOUND");
  });

  it("unblockAppForTenant removes the block row", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ tenantId: "tenant-owner" });
    const result = await unblockAppForTenant({ id: "admin-1" }, "tenant-b", "app-1");
    expect(result).toEqual({ tenantId: "tenant-b", appId: "app-1" });
    const deleteCall = dbMocks.execute.mock.calls[0];
    expect(deleteCall[1]).toEqual(["tenant-b", "app-1"]);
  });
});

describe("listAppTenantBlocksForPlatformAdmin", () => {
  it("queries across every tenant", async () => {
    dbMocks.query.mockReset().mockResolvedValueOnce([{ id: "block-1" }]);
    const result = await listAppTenantBlocksForPlatformAdmin();
    expect(result).toHaveLength(1);
    expect(String(dbMocks.query.mock.calls[0][0])).toContain('"MarketplaceAppTenantBlock"');
  });
});
