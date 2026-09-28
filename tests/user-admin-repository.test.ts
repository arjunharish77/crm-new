import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/db/query", () => dbMocks);

import { updateTenantScopedUser, createTenantScopedUser, createTenantRole } from "@/lib/repositories/auth-admin-postgres";

const TENANT = "tenant-1";

describe("updateTenantScopedUser — F28 fix: omitted fields must not be cleared", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
    dbMocks.execute.mockReset();
  });

  it("only sends the explicitly-supplied field to the update, never touching teamId/managerId/skills", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "user-1", isAvailableForAssignment: true });

    await updateTenantScopedUser(TENANT, "user-1", { isAvailableForAssignment: true });

    const [sql, values] = dbMocks.queryOne.mock.calls[0];
    const setClause = sql.split(" where ")[0];
    expect(setClause).toContain('"isAvailableForAssignment" = ');
    expect(setClause).not.toContain('"teamId" = ');
    expect(setClause).not.toContain('"managerId" = ');
    expect(setClause).not.toContain('"skills" = ');
    expect(values).not.toContain(null); // no incidental null writes from omitted fields
  });

  it("still allows explicitly clearing teamId with an empty string", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "user-1", teamId: null });

    await updateTenantScopedUser(TENANT, "user-1", { teamId: "" });

    const [sql, values] = dbMocks.queryOne.mock.calls[0];
    expect(sql).toContain('"teamId" = ');
    expect(values).toContain(null);
  });

  it("rejects a roleId that does not belong to this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null); // Role lookup fails
    await expect(updateTenantScopedUser(TENANT, "user-1", { roleId: "other-tenant-role" })).rejects.toThrow(
      "ROLE_NOT_FOUND_FOR_TENANT",
    );
    expect(dbMocks.queryOne.mock.calls[0][0]).toContain('from "Role"');
  });

  it("rejects a managerId that does not belong to this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null); // manager lookup fails
    await expect(updateTenantScopedUser(TENANT, "user-1", { managerId: "other-tenant-user" })).rejects.toThrow(
      "MANAGER_NOT_FOUND_FOR_TENANT",
    );
  });

  it("proceeds normally once a same-tenant roleId is verified", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "role-1" }) // role check
      .mockResolvedValueOnce({ id: "user-1", roleId: "role-1" }); // update

    const result = await updateTenantScopedUser(TENANT, "user-1", { roleId: "role-1" });
    expect(result).toEqual({ id: "user-1", roleId: "role-1" });
  });
});

describe("createTenantScopedUser — cross-tenant reference rejection", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("rejects a teamId belonging to a different tenant", async () => {
    dbMocks.queryOne
      .mockResolvedValueOnce({ id: "role-1" }) // role check passes
      .mockResolvedValueOnce(null); // team check fails
    await expect(
      createTenantScopedUser(TENANT, { name: "New User", email: "n@x.invalid", password: "pw", roleId: "role-1", teamId: "other-tenant-team" }),
    ).rejects.toThrow("TEAM_NOT_FOUND_FOR_TENANT");
  });
});

describe("createTenantRole — F02 fix: permissionTemplateId must belong to the same tenant", () => {
  beforeEach(() => {
    dbMocks.queryOne.mockReset();
  });

  it("rejects a permissionTemplateId from a different tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(
      createTenantRole(TENANT, {
        name: "New role",
        permissionTemplateId: "11111111-1111-4111-8111-111111111111",
        permissions: { modules: {}, recordAccess: "OWN" },
      }),
    ).rejects.toThrow("PERMISSION_TEMPLATE_NOT_FOUND_FOR_TENANT");
  });
});
