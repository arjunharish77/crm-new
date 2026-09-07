import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const adminMocks = vi.hoisted(() => ({
  createTenantScopedUser: vi.fn(),
  updateTenantScopedUser: vi.fn(),
}));
const adminModulesMocks = vi.hoisted(() => ({
  createTeamForTenant: vi.fn(),
  updateTeamForTenant: vi.fn(),
  deleteTeamForTenant: vi.fn(),
  addTeamMemberForTenant: vi.fn(),
  removeTeamMemberForTenant: vi.fn(),
}));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/admin", () => adminMocks);
vi.mock("@/lib/server/admin-modules", () => adminModulesMocks);

import {
  ScimError,
  listScimUsers,
  createScimUser,
  patchScimUser,
  createScimGroup,
  patchScimGroup,
  getScimReconciliationSummary,
} from "@/lib/server/scim";

const ctx = { tenantId: "tenant-a", actorId: "apikey-1" };

beforeEach(() => {
  dbMocks.query.mockReset();
  dbMocks.queryOne.mockReset();
  dbMocks.execute.mockReset().mockResolvedValue(undefined);
  adminMocks.createTenantScopedUser.mockReset();
  adminMocks.updateTenantScopedUser.mockReset().mockResolvedValue(undefined);
  adminModulesMocks.createTeamForTenant.mockReset();
  adminModulesMocks.updateTeamForTenant.mockReset().mockResolvedValue(undefined);
  adminModulesMocks.deleteTeamForTenant.mockReset();
  adminModulesMocks.addTeamMemberForTenant.mockReset().mockResolvedValue(undefined);
  adminModulesMocks.removeTeamMemberForTenant.mockReset().mockResolvedValue(undefined);
});

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    status: "ACTIVE",
    externalId: "idp-123",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    roleName: "Rep",
    ...overrides,
  };
}

describe("listScimUsers", () => {
  it("rejects an unsupported filter expression with a 400 ScimError", async () => {
    await expect(listScimUsers(ctx, { filter: "unsupportedAttr eq \"x\"" })).rejects.toMatchObject({ status: 400 });
  });

  it("accepts a userName eq filter and scopes the query by email", async () => {
    dbMocks.query.mockResolvedValueOnce([userRow()]);
    dbMocks.queryOne.mockResolvedValueOnce({ count: "1" });

    const result = await listScimUsers(ctx, { filter: 'userName eq "test@example.com"' });

    expect(result.totalResults).toBe(1);
    expect(result.Resources[0]).toMatchObject({ userName: "test@example.com", active: true });
    const [, values] = dbMocks.query.mock.calls[0];
    expect(values).toEqual(["tenant-a", "test@example.com"]);
  });
});

describe("createScimUser", () => {
  it("resolves the role from a `roles` attribute matching an existing Role name", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "role-rep" }) // Role name match
      .mockResolvedValueOnce(userRow()); // getScimUserById re-fetch
    adminMocks.createTenantScopedUser.mockResolvedValueOnce({ id: "user-1" });

    await createScimUser(ctx, { userName: "test@example.com", roles: [{ value: "Rep" }] });

    expect(adminMocks.createTenantScopedUser).toHaveBeenCalledWith(
      "tenant-a",
      expect.objectContaining({ email: "test@example.com", roleId: "role-rep" }),
    );
  });

  it("falls back to the tenant's defaultScimRoleId when no `roles` attribute matches", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ defaultScimRoleId: "role-default" }) // TenantFeature lookup
      .mockResolvedValueOnce(userRow()); // getScimUserById re-fetch
    adminMocks.createTenantScopedUser.mockResolvedValueOnce({ id: "user-1" });

    await createScimUser(ctx, { userName: "test@example.com" });

    expect(adminMocks.createTenantScopedUser).toHaveBeenCalledWith(
      "tenant-a",
      expect.objectContaining({ roleId: "role-default" }),
    );
  });

  it("throws a clear 400 ScimError when no role can be resolved at all", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ defaultScimRoleId: null });

    await expect(createScimUser(ctx, { userName: "test@example.com" })).rejects.toMatchObject({ status: 400 });
    expect(adminMocks.createTenantScopedUser).not.toHaveBeenCalled();
  });

  it("throws a 400 when userName/emails is missing entirely, without ever resolving a role", async () => {
    await expect(createScimUser(ctx, {})).rejects.toBeInstanceOf(ScimError);
    expect(adminMocks.createTenantScopedUser).not.toHaveBeenCalled();
  });
});

describe("patchScimUser", () => {
  it("maps an `active: false` replace operation to status INACTIVE via updateTenantScopedUser", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "user-1", status: "ACTIVE" }) // existing lookup
      .mockResolvedValueOnce(userRow({ status: "INACTIVE" })); // getScimUserById re-fetch

    await patchScimUser(ctx, "user-1", [{ op: "replace", path: "active", value: false }]);

    expect(adminMocks.updateTenantScopedUser).toHaveBeenCalledWith("tenant-a", "user-1", expect.objectContaining({ status: "INACTIVE" }));
  });

  it("throws 404 when the user doesn't exist for this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(patchScimUser(ctx, "missing", [{ op: "replace", path: "active", value: false }])).rejects.toMatchObject({ status: 404 });
  });

  it("silently ignores an operation on an unsupported path rather than throwing", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "user-1", status: "ACTIVE" })
      .mockResolvedValueOnce(userRow());

    await patchScimUser(ctx, "user-1", [{ op: "replace", path: "title", value: "VP of Sales" }]);

    expect(adminMocks.updateTenantScopedUser).not.toHaveBeenCalled();
  });
});

describe("createScimGroup / patchScimGroup", () => {
  it("applies the Team's defaultRoleId and defaultSalesGroupId to a newly added member", async () => {
    adminModulesMocks.createTeamForTenant.mockResolvedValueOnce({ id: "team-1" });
    dbMocks.queryOne
      .mockResolvedValueOnce({ defaultRoleId: "role-sales", defaultSalesGroupId: "sg-1" }) // applyGroupDefaults' Team lookup
      .mockResolvedValueOnce({ id: "team-1", name: "Sales", externalId: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }); // getScimGroupById
    dbMocks.query.mockResolvedValueOnce([]); // groupMembers for the final serialize

    await createScimGroup(ctx, { displayName: "Sales", members: [{ value: "user-1" }] });

    expect(adminModulesMocks.addTeamMemberForTenant).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a" }), "team-1", { userId: "user-1" });
    expect(adminMocks.updateTenantScopedUser).toHaveBeenCalledWith("tenant-a", "user-1", { roleId: "role-sales" });
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("SalesGroupMember"), expect.arrayContaining(["sg-1", "user-1", "tenant-a"]));
  });

  it("throws 400 when displayName is missing", async () => {
    await expect(createScimGroup(ctx, {})).rejects.toMatchObject({ status: 400 });
    expect(adminModulesMocks.createTeamForTenant).not.toHaveBeenCalled();
  });

  it("patchScimGroup routes a members remove operation through removeTeamMemberForTenant", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "team-1" }) // existing team lookup
      .mockResolvedValueOnce({ id: "team-1", name: "Sales", externalId: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }); // getScimGroupById
    dbMocks.query.mockResolvedValueOnce([]);

    await patchScimGroup(ctx, "team-1", [{ op: "remove", path: "members", value: [{ value: "user-2" }] }]);

    expect(adminModulesMocks.removeTeamMemberForTenant).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a" }), "team-1", "user-2");
    expect(adminModulesMocks.addTeamMemberForTenant).not.toHaveBeenCalled();
  });
});

describe("getScimReconciliationSummary", () => {
  it("flags a user as stale when their last sync activity is older than 30 days", async () => {
    const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    dbMocks.query
      .mockResolvedValueOnce([{ id: "user-1", name: "Test User", email: "test@example.com", status: "ACTIVE", externalId: "idp-1" }])
      .mockResolvedValueOnce([{ resourceId: "user-1", createdAt: old }]);

    const result = await getScimReconciliationSummary("tenant-a");

    expect(result[0]).toMatchObject({ id: "user-1", stale: true, lastActivity: old });
  });

  it("does not flag a user with recent sync activity", async () => {
    const recent = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    dbMocks.query
      .mockResolvedValueOnce([{ id: "user-1", name: "Test User", email: "test@example.com", status: "ACTIVE", externalId: "idp-1" }])
      .mockResolvedValueOnce([{ resourceId: "user-1", createdAt: recent }]);

    const result = await getScimReconciliationSummary("tenant-a");

    expect(result[0].stale).toBe(false);
  });
});
