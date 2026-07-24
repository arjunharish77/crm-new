import { describe, it, expect, beforeEach, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const state: {
    Role: any[];
    PartnerProfile: any[];
    PartnerOrganization: any[];
    User: any[];
  } = {
    Role: [],
    PartnerProfile: [],
    PartnerOrganization: [],
    User: [],
  };

  return {
    state,
    createTenantScopedUser: vi.fn(async (tenantId: string, input: any) => {
      const user = {
        id: `user-${state.User.length + 1}`,
        tenantId,
        name: input.name,
        email: input.email,
        status: "ACTIVE",
      };
      state.User.push(user);
      return user;
    }),
    queryOne: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "Role"')) {
        return state.Role.find((role) => role.tenantId === params[0] && role.id === params[1]) ?? null;
      }

      if (sql.includes('from "PartnerProfile"')) {
        return state.PartnerProfile.find((profile) => profile.tenantId === params[0] && profile.id === params[1]) ?? null;
      }

      if (sql.includes('insert into "PartnerOrganization"')) {
        const organization = {
          id: params[0],
          tenantId: params[1],
          name: params[2],
          status: params[3] ?? "ACTIVE",
          primaryUserId: params[4],
          createdBy: params[5],
          createdAt: params[6],
          updatedAt: params[6],
        };
        state.PartnerOrganization.push(organization);
        return { id: organization.id };
      }

      if (sql.includes('insert into "PartnerProfile"')) {
        const profile = {
          id: params[0],
          tenantId: params[1],
          userId: params[2],
          legalBusinessName: params[3],
          gstin: params[4],
          panNumber: params[5],
          registeredAddress: params[6],
          registeredState: params[7],
          status: "ACTIVE",
          invoiceNumberPrefix: params[8],
          invoiceNumberCounter: 0,
          partnerOrganizationId: params[9],
          parentPartnerProfileId: params[10],
          canAccessPayouts: params[11],
          partnerLoginRole: params[12],
          createdAt: params[14],
          updatedAt: params[14],
        };
        state.PartnerProfile.push(profile);
        return profile;
      }

      return null;
    }),
    query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('from "PartnerProfile"')) {
        return state.PartnerProfile
          .filter((profile) => profile.tenantId === params[0] && profile.partnerOrganizationId === params[1])
          .sort((a, b) => String(a.partnerLoginRole).localeCompare(String(b.partnerLoginRole)) || String(a.createdAt).localeCompare(String(b.createdAt)));
      }
      if (sql.includes('from "User"')) {
        const userIds = params[1] as string[];
        return state.User.filter((user) => userIds.includes(user.id));
      }
      return [];
    }),
    execute: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('update "PartnerProfile"')) {
        const profile = state.PartnerProfile.find((row) => row.tenantId === params[3] && row.id === params[4]);
        if (profile) {
          profile.partnerOrganizationId = params[0];
          profile.partnerLoginRole = params[1];
          profile.updatedAt = params[2];
        }
      }
    }),
  };
});

vi.mock("@/lib/db/query", () => ({
  query: dbMocks.query,
  queryOne: dbMocks.queryOne,
  execute: dbMocks.execute,
}));

vi.mock("@/lib/server/admin", () => ({
  createTenantScopedUser: dbMocks.createTenantScopedUser,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: vi.fn(async () => null),
}));

import { createPartnerLoginForTenant, listPartnerLoginsForOrganization } from "@/lib/server/partners";

const TENANT = "tenant-a";
const adminUser = { id: "admin-1", tenantId: TENANT };

beforeEach(() => {
  dbMocks.state.Role = [];
  dbMocks.state.PartnerProfile = [];
  dbMocks.state.PartnerOrganization = [];
  dbMocks.state.User = [];
  dbMocks.query.mockClear();
  dbMocks.queryOne.mockClear();
  dbMocks.execute.mockClear();
  dbMocks.createTenantScopedUser.mockClear();
});

describe("partner organization logins", () => {
  it("creates a child login under an existing partner organization", async () => {
    dbMocks.state.Role = [{ id: "partner-role", tenantId: TENANT, permissions: { isPartnerRole: true } }];
    dbMocks.state.User = [{ id: "partner-primary", tenantId: TENANT, name: "Alpha Primary", email: "primary@alpha.example", status: "ACTIVE" }];
    dbMocks.state.PartnerProfile = [
      {
        id: "primary-profile",
        tenantId: TENANT,
        userId: "partner-primary",
        legalBusinessName: "Alpha Partners",
        status: "ACTIVE",
        invoiceNumberPrefix: "ALP",
        invoiceNumberCounter: 0,
        partnerOrganizationId: "partner-org-1",
        partnerLoginRole: "PRIMARY",
        canAccessPayouts: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const login = await createPartnerLoginForTenant(adminUser, "primary-profile", {
      name: "Alpha Finance",
      email: "finance@alpha.example",
      password: "secret123",
      roleId: "partner-role",
      partnerLoginRole: "FINANCE",
      canAccessPayouts: true,
    });

    expect(login?.partnerOrganizationId).toBe("partner-org-1");
    expect(login?.parentPartnerProfileId).toBe("primary-profile");
    expect(login?.partnerLoginRole).toBe("FINANCE");
    expect(login?.canAccessPayouts).toBe(true);

    const logins = await listPartnerLoginsForOrganization(adminUser, "partner-org-1");
    expect(logins.map((profile: any) => profile.userId).sort()).toEqual(["partner-primary", login?.userId].sort());
  });

  it("backfills a partner organization for older single-login partners", async () => {
    dbMocks.state.Role = [{ id: "partner-role", tenantId: TENANT, permissions: { isPartnerRole: true } }];
    dbMocks.state.PartnerProfile = [
      {
        id: "legacy-profile",
        tenantId: TENANT,
        userId: "legacy-primary",
        legalBusinessName: "Legacy Partners",
        status: "ACTIVE",
        invoiceNumberPrefix: "LEG",
        invoiceNumberCounter: 0,
        partnerOrganizationId: null,
        partnerLoginRole: "PRIMARY",
        canAccessPayouts: true,
      },
    ];

    const login = await createPartnerLoginForTenant(adminUser, "legacy-profile", {
      name: "Legacy Manager",
      email: "manager@legacy.example",
      password: "secret123",
      roleId: "partner-role",
      partnerLoginRole: "MANAGER",
    });

    expect(login?.partnerOrganizationId).toBeTruthy();
    expect(dbMocks.state.PartnerOrganization).toHaveLength(1);
    expect(dbMocks.state.PartnerProfile.find((profile: any) => profile.id === "legacy-profile")?.partnerOrganizationId).toBe(login?.partnerOrganizationId);
  });
});
