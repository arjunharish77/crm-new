import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const authRepoMocks = vi.hoisted(() => ({
  getLoginUserByEmail: vi.fn(),
  getActivePlatformAdminByUserId: vi.fn(),
  getCurrentUserById: vi.fn(),
}));

vi.mock("@/lib/repositories/auth-admin-postgres", () => ({
  getLoginUserByEmail: authRepoMocks.getLoginUserByEmail,
  getActivePlatformAdminByUserId: authRepoMocks.getActivePlatformAdminByUserId,
  getCurrentUserById: authRepoMocks.getCurrentUserById,
}));

vi.mock("@/lib/db/access-mode", () => ({
  getDataAccessMode: () => "postgres",
  isPostgresMode: () => true,
}));

import { POST } from "@/app/api/auth/login/route";
import { getCurrentUser, verifyAuthToken } from "@/lib/server/auth";

const PASSWORD = "correct-password123";

beforeEach(async () => {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  authRepoMocks.getLoginUserByEmail.mockReset();
  authRepoMocks.getActivePlatformAdminByUserId.mockReset();
  authRepoMocks.getCurrentUserById.mockReset();
  authRepoMocks.getLoginUserByEmail.mockResolvedValue({
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    password: passwordHash,
    tenantId: "tenant-a",
    roleId: null,
  });
  authRepoMocks.getActivePlatformAdminByUserId.mockResolvedValue(null);
  authRepoMocks.getCurrentUserById.mockResolvedValue({
    id: "user-1",
    email: "test@example.com",
    name: "Test User",
    tenantId: "tenant-a",
    roleId: null,
    role: null,
    isPlatformAdmin: false,
    platformAdminId: null,
  });
});

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("accepts correct credentials and returns a verifiable token + user", async () => {
    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ id: "user-1", email: "test@example.com", tenantId: "tenant-a" });

    const payload = await verifyAuthToken(body.access_token);
    expect(payload?.sub).toBe("user-1");
    expect(payload?.tenantId).toBe("tenant-a");

    const authedRequest = new Request("http://localhost/api/auth/me", {
      headers: { authorization: `Bearer ${body.access_token}` },
    });
    const user = await getCurrentUser(authedRequest);
    expect(user?.id).toBe("user-1");
    expect(user?.tenantId).toBe("tenant-a");
  });

  it("rejects an incorrect password", async () => {
    const res = await POST(loginRequest({ email: "test@example.com", password: "wrong-password" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.access_token).toBeUndefined();
  });

  it("rejects an unknown email", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce(null);
    const res = await POST(loginRequest({ email: "nobody@example.com", password: PASSWORD }));
    expect(res.status).toBe(401);
  });
});
