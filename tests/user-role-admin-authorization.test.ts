import { beforeEach, describe, expect, it, vi } from "vitest";

// F02 fix (WP03): inverts crm-audit-bundle/audit-reproduction.test.ts's two vulnerable-outcome
// REPRO cases into permanent rejection tests, plus confirms an authorized tenant admin can still
// perform both actions -- per the confirmed policy: user/role administration is Tenant Admin
// only, with no permission-template-based delegation for this specific capability.
const fixtures = vi.hoisted(() => ({
  ordinaryUser: {
    id: "user-1", email: "user@example.invalid", tenantId: "tenant-1",
    isPartner: false, isTenantAdmin: false, isPlatformAdmin: false, tenantStatus: "ACTIVE",
    role: { permissions: { recordAccess: "OWN", modules: { admin: "none" } } },
  },
  tenantAdminUser: {
    id: "admin-1", email: "admin@example.invalid", tenantId: "tenant-1",
    isPartner: false, isTenantAdmin: true, isPlatformAdmin: false, tenantStatus: "ACTIVE",
    role: { permissions: { recordAccess: "ALL", modules: { admin: "full" } } },
  },
  getUser: vi.fn(),
  validate: vi.fn(),
  update: vi.fn(),
  createRole: vi.fn(),
}));

vi.mock("@/lib/repositories/auth-admin-postgres", () => ({ getCurrentUserById: fixtures.getUser }));
vi.mock("@/lib/server/rate-limit", () => ({ assertGeneralRateLimit: vi.fn(), RateLimitExceededError: class extends Error {} }));
vi.mock("@/lib/server/sessions", () => ({ validateSession: fixtures.validate, touchSessionIfStale: vi.fn() }));
vi.mock("@/lib/server/admin", () => ({
  updateTenantScopedUser: fixtures.update,
  createTenantRole: fixtures.createRole,
  listTenantRoles: vi.fn(),
}));

import { signAuthToken } from "@/lib/server/auth";
import { PATCH } from "@/app/api/users/[id]/route";
import { POST } from "@/app/api/roles/route";

function request(actingUserId: string, body?: object) {
  return signAuthToken({ sub: actingUserId, email: "x@example.invalid", tenantId: "tenant-1" }).then(
    (token) =>
      new Request("http://localhost/api/audit", {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.update.mockResolvedValue({ id: "user-1", roleId: "admin-role" });
  fixtures.createRole.mockResolvedValue({ id: "new-admin-role" });
});

describe("F02 fix: PATCH /api/users/[id] requires Tenant Admin", () => {
  it("rejects an ordinary internal user attempting to PATCH someone's roleId (was: REPRO succeeded)", async () => {
    fixtures.getUser.mockResolvedValue(fixtures.ordinaryUser);
    const response = await PATCH(await request(fixtures.ordinaryUser.id, { roleId: "admin-role" }), {
      params: Promise.resolve({ id: fixtures.ordinaryUser.id }),
    });
    expect(response.status).toBe(403);
    expect(fixtures.update).not.toHaveBeenCalled();
  });

  it("allows a tenant admin to PATCH a user's roleId", async () => {
    fixtures.getUser.mockResolvedValue(fixtures.tenantAdminUser);
    const response = await PATCH(await request(fixtures.tenantAdminUser.id, { roleId: "admin-role" }), {
      params: Promise.resolve({ id: "user-1" }),
    });
    expect(response.status).toBe(200);
    expect(fixtures.update).toHaveBeenCalled();
  });
});

describe("F02 fix: POST /api/roles requires Tenant Admin", () => {
  it("rejects an ordinary internal user creating an unrestricted admin role (was: REPRO succeeded)", async () => {
    fixtures.getUser.mockResolvedValue(fixtures.ordinaryUser);
    const response = await POST(
      await request(fixtures.ordinaryUser.id, { name: "Audit admin", permissions: { modules: { admin: "full" }, recordAccess: "ALL" } }),
    );
    expect(response.status).toBe(403);
    expect(fixtures.createRole).not.toHaveBeenCalled();
  });

  it("allows a tenant admin to create a new role", async () => {
    fixtures.getUser.mockResolvedValue(fixtures.tenantAdminUser);
    const response = await POST(
      await request(fixtures.tenantAdminUser.id, { name: "New role", permissions: { modules: { admin: "none" }, recordAccess: "OWN" } }),
    );
    expect(response.status).toBe(200);
    expect(fixtures.createRole).toHaveBeenCalled();
  });
});
