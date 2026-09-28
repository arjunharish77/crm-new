import { beforeEach, describe, expect, it, vi } from "vitest";

const pgAdminMocks = vi.hoisted(() => ({
  createTenantRole: vi.fn(),
  updateTenantRole: vi.fn(),
  deleteTenantRole: vi.fn(),
  getTenantRoleById: vi.fn(),
  updateTenantScopedUser: vi.fn(),
  getTenantScopedUserPermissionSummary: vi.fn(),
  impersonateTenantUser: vi.fn(),
}));

const crmMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// impersonateTenantUser now creates a real UserSession row (see sessions.ts) as part of
// closing the "impersonation gets the same 7-day expiry as a normal login" gap -- this file's
// tests care about the audit-log side effect, not session internals, so a minimal always-empty
// mock is enough to let createUserSession run without touching a real database.
const dbMocks = vi.hoisted(() => {
  const query = vi.fn().mockResolvedValue([]);
  const queryOne = vi.fn().mockResolvedValue(null);
  const execute = vi.fn().mockResolvedValue(undefined);
  return { query, queryOne, execute, queryAsSystem: query, queryOneAsSystem: queryOne, executeAsSystem: execute };
});

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/repositories/auth-admin-postgres", () => pgAdminMocks);
vi.mock("@/lib/server/crm", () => ({ createAuditLog: crmMocks.createAuditLog }));

import {
  createTenantRole,
  deleteTenantRole,
  impersonateTenantUser,
  updateTenantRole,
  updateTenantScopedUser,
} from "@/lib/server/admin";

const actor = { id: "admin-1", tenantId: "tenant-a" };

describe("admin.ts audit logging", () => {
  beforeEach(() => {
    Object.values(pgAdminMocks).forEach((mock) => mock.mockReset());
    crmMocks.createAuditLog.mockClear();
  });

  it("audit-logs a role creation when an actor is provided", async () => {
    pgAdminMocks.createTenantRole.mockResolvedValueOnce({ id: "role-1", name: "Sales Rep" });

    await createTenantRole("tenant-a", { name: "Sales Rep", permissions: { modules: {}, recordAccess: "OWN" } }, actor);

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(actor, "CREATE", "ROLE", "role-1", null, { id: "role-1", name: "Sales Rep" }, null);
  });

  it("does not audit-log a role creation when no actor is provided", async () => {
    pgAdminMocks.createTenantRole.mockResolvedValueOnce({ id: "role-1" });

    await createTenantRole("tenant-a", { name: "Sales Rep", permissions: { modules: {}, recordAccess: "OWN" } });

    expect(crmMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("audit-logs a role update with before/after state", async () => {
    pgAdminMocks.getTenantRoleById.mockResolvedValueOnce({ id: "role-1", name: "Old Name" });
    pgAdminMocks.updateTenantRole.mockResolvedValueOnce({ id: "role-1", name: "New Name" });

    await updateTenantRole("tenant-a", "role-1", { name: "New Name", permissions: { modules: {}, recordAccess: "OWN" } }, actor);

    expect(pgAdminMocks.getTenantRoleById).toHaveBeenCalledWith("tenant-a", "role-1");
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      actor,
      "UPDATE",
      "ROLE",
      "role-1",
      { id: "role-1", name: "Old Name" },
      { id: "role-1", name: "New Name" },
      null,
    );
  });

  it("audit-logs a role deletion with the deleted role's prior state", async () => {
    pgAdminMocks.getTenantRoleById.mockResolvedValueOnce({ id: "role-1", name: "Doomed Role" });

    await deleteTenantRole("tenant-a", "role-1", actor);

    expect(pgAdminMocks.deleteTenantRole).toHaveBeenCalledWith("tenant-a", "role-1");
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(actor, "DELETE", "ROLE", "role-1", { id: "role-1", name: "Doomed Role" }, null, null);
  });

  it("audit-logs a user's role/permission-template change but not unrelated field changes", async () => {
    pgAdminMocks.getTenantScopedUserPermissionSummary.mockResolvedValueOnce({ id: "user-1", roleId: "role-old", permissionTemplateId: null });
    pgAdminMocks.updateTenantScopedUser.mockResolvedValueOnce({ id: "user-1", roleId: "role-new", permissionTemplateId: null });

    await updateTenantScopedUser("tenant-a", "user-1", { roleId: "role-new" }, actor);

    expect(crmMocks.createAuditLog).toHaveBeenCalledTimes(1);
    const [, action, entityType, entityId, , , diff] = crmMocks.createAuditLog.mock.calls[0];
    expect(action).toBe("UPDATE");
    expect(entityType).toBe("USER_PERMISSIONS");
    expect(entityId).toBe("user-1");
    expect(diff).toMatchObject({ roleId: { before: "role-old", after: "role-new" } });
  });

  it("does not audit-log a user update that touches no permission fields", async () => {
    pgAdminMocks.updateTenantScopedUser.mockResolvedValueOnce({ id: "user-1", name: "Renamed" });

    await updateTenantScopedUser("tenant-a", "user-1", { name: "Renamed" }, actor);

    expect(pgAdminMocks.getTenantScopedUserPermissionSummary).not.toHaveBeenCalled();
    expect(crmMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("audit-logs impersonation attributed to the impersonated tenant, not the platform admin's own", async () => {
    pgAdminMocks.impersonateTenantUser.mockResolvedValueOnce({
      user: { id: "rep-1", email: "rep@example.com", name: "Rep One", tenantId: "tenant-b", roleId: "role-1" },
      platformAdminUserId: "platform-admin-1",
    });

    await impersonateTenantUser("platform-admin-1", "tenant-b", "rep-1", "Investigating support ticket #42");

    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(
      { id: "platform-admin-1", tenantId: "tenant-b" },
      "IMPERSONATE",
      "USER",
      "rep-1",
      null,
      null,
      { platformAdminUserId: "platform-admin-1", reason: "Investigating support ticket #42", sessionId: expect.any(String) },
    );
  });

  it("requires a non-empty reason to start impersonation", async () => {
    await expect(impersonateTenantUser("platform-admin-1", "tenant-b", "rep-1", "   ")).rejects.toThrow("IMPERSONATION_REASON_REQUIRED");
    expect(pgAdminMocks.impersonateTenantUser).not.toHaveBeenCalled();
  });
});
