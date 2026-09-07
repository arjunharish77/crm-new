import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const authRepoMocks = vi.hoisted(() => ({
  getLoginUserByEmail: vi.fn(),
  getActivePlatformAdminByUserId: vi.fn(),
  getCurrentUserById: vi.fn(),
  isTenantSuspended: vi.fn(),
}));

const crmMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Login now creates a real UserSession row (checked out against SecurityPolicy) and
// getCurrentUser now validates it -- both go through raw query/queryOne/execute rather than a
// repo function, so this mock has to exist for the login route to run at all. Pattern-matched
// on the SQL text rather than sequenced mockResolvedValueOnce calls: the exact call order/count
// across createUserSession -> enforceMaxConcurrentSessions -> (later) validateSession isn't
// this file's concern, only that each table-shaped query gets a plausible answer.
const dbMocks = vi.hoisted(() => ({
  query: vi.fn(async (sql: string): Promise<any[]> => {
    if (sql.includes('"UserSession"')) return []; // enforceMaxConcurrentSessions: no other active sessions to evict
    if (sql.includes('"SecurityPolicy"')) return []; // getEffectiveSecurityPolicy: no tenant/global row -> DEFAULT_SECURITY_POLICY
    return [];
  }),
  queryOne: vi.fn(async (sql: string) => {
    if (sql.includes('"UserSession"')) {
      return {
        id: "session-1",
        tenantId: "tenant-a",
        userId: "user-1",
        userAgent: null,
        ipAddress: null,
        isImpersonation: false,
        impersonatedBy: null,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: null,
        revokedBy: null,
        revokedReason: null,
      };
    }
    return null;
  }),
  execute: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/db/query", () => dbMocks);

vi.mock("@/lib/repositories/auth-admin-postgres", () => ({
  getLoginUserByEmail: authRepoMocks.getLoginUserByEmail,
  getActivePlatformAdminByUserId: authRepoMocks.getActivePlatformAdminByUserId,
  getCurrentUserById: authRepoMocks.getCurrentUserById,
  isTenantSuspended: authRepoMocks.isTenantSuspended,
}));

vi.mock("@/lib/server/crm", () => ({
  createAuditLog: crmMocks.createAuditLog,
}));

vi.mock("@/lib/db/access-mode", () => ({
  getDataAccessMode: () => "postgres",
  isPostgresMode: () => true,
}));

import { POST } from "@/app/api/auth/login/route";
import { getCurrentUser, verifyAuthToken } from "@/lib/server/auth";

const PASSWORD = "correct-password123";
let passwordHash: string;

beforeEach(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
  authRepoMocks.getLoginUserByEmail.mockReset();
  authRepoMocks.getActivePlatformAdminByUserId.mockReset();
  authRepoMocks.getCurrentUserById.mockReset();
  authRepoMocks.isTenantSuspended.mockReset().mockResolvedValue(false);
  crmMocks.createAuditLog.mockClear();
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

  it("rejects login for a suspended tenant's user with a clear message, even with the correct password", async () => {
    authRepoMocks.isTenantSuspended.mockResolvedValueOnce(true);
    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toContain("suspended");
    expect(body.access_token).toBeUndefined();
  });

  it("still allows a platform admin to log in even when their tenant is suspended", async () => {
    authRepoMocks.isTenantSuspended.mockResolvedValueOnce(true);
    authRepoMocks.getActivePlatformAdminByUserId.mockResolvedValueOnce({ id: "admin-1", isActive: true });
    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));
    expect(res.status).toBe(200);
  });

  it("rejects login for a deactivated user with a clear message, even with the correct password", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      password: passwordHash,
      tenantId: "tenant-a",
      roleId: null,
      status: "INACTIVE",
    });
    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toContain("deactivated");
    expect(body.access_token).toBeUndefined();
  });

  it("still allows a platform admin to log in even when marked INACTIVE", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      password: passwordHash,
      tenantId: "tenant-a",
      roleId: null,
      status: "INACTIVE",
    });
    authRepoMocks.getActivePlatformAdminByUserId.mockResolvedValueOnce({ id: "admin-1", isActive: true });
    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));
    expect(res.status).toBe(200);
  });

  it("allows login for an ACTIVE user (status present but not blocking)", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      password: passwordHash,
      tenantId: "tenant-a",
      roleId: null,
      status: "ACTIVE",
    });
    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));
    expect(res.status).toBe(200);
  });

  it("returns mfaRequired + a short-lived mfaToken instead of a real session when MFA is enabled", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      password: passwordHash,
      tenantId: "tenant-a",
      roleId: null,
      status: "ACTIVE",
      mfaEnabled: true,
    });

    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.mfaToken).toEqual(expect.any(String));
    expect(body.access_token).toBeUndefined();
  });

  it("blocks login outright once MFA is required by policy and the enrollment grace period has passed", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      password: passwordHash,
      tenantId: "tenant-a",
      roleId: null,
      status: "ACTIVE",
      mfaEnabled: false,
      createdAt: "2020-01-01T00:00:00.000Z",
    });
    // getEffectiveSecurityPolicy's query -- the route calls it twice (once for the login-
    // lockout policy, once inside resolveMfaRequirement for the MFA policy), so both calls
    // need the same REQUIRED_ALL-with-expired-grace-period row queued.
    const requiredAllPolicy = [{
      tenantId: "tenant-a",
      mfaEnforcementMode: "REQUIRED_ALL",
      mfaEnforcedSince: "2020-01-01T00:00:00.000Z",
      mfaGracePeriodDays: 14,
    }];
    dbMocks.query.mockResolvedValueOnce(requiredAllPolicy).mockResolvedValueOnce(requiredAllPolicy);

    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toContain("grace period has expired");
  });

  it("returns passwordExpired + a password-change token instead of a session once the password has expired", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      password: passwordHash,
      tenantId: "tenant-a",
      roleId: null,
      status: "ACTIVE",
      mfaEnabled: false,
      createdAt: "2020-01-01T00:00:00.000Z",
      passwordChangedAt: "2020-01-01T00:00:00.000Z",
    });
    dbMocks.query.mockResolvedValueOnce([{
      tenantId: "tenant-a",
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 30,
      passwordExpiryDays: 90,
    }]);

    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passwordExpired).toBe(true);
    expect(body.passwordChangeToken).toEqual(expect.any(String));
    expect(body.access_token).toBeUndefined();
  });

  it("logs in normally when the password is within its expiry window", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      password: passwordHash,
      tenantId: "tenant-a",
      roleId: null,
      status: "ACTIVE",
      mfaEnabled: false,
      createdAt: "2020-01-01T00:00:00.000Z",
      passwordChangedAt: new Date().toISOString(),
    });
    dbMocks.query.mockResolvedValueOnce([{
      tenantId: "tenant-a",
      maxLoginAttempts: 5,
      lockoutDurationMinutes: 30,
      passwordExpiryDays: 90,
    }]);

    const res = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passwordExpired).toBeUndefined();
    expect(body.access_token).toEqual(expect.any(String));
  });

  it("writes a LOGIN_FAILED audit log for a wrong password against a known user", async () => {
    await POST(loginRequest({ email: "test@example.com", password: "wrong-password" }));

    expect(crmMocks.createAuditLog).toHaveBeenCalledTimes(1);
    const [actor, action, entityType, entityId, before, after, diff] = crmMocks.createAuditLog.mock.calls[0];
    expect(actor).toEqual({ id: "user-1", tenantId: "tenant-a" });
    expect(action).toBe("LOGIN_FAILED");
    expect(entityType).toBe("AUTH");
    expect(entityId).toBe("user-1");
    expect(before).toBeNull();
    expect(after).toBeNull();
    expect(diff).toMatchObject({ stage: "password_compare" });
  });

  it("does not write an audit log for an unknown email (no tenant to attribute it to)", async () => {
    authRepoMocks.getLoginUserByEmail.mockResolvedValueOnce(null);
    await POST(loginRequest({ email: "nobody@example.com", password: PASSWORD }));

    expect(crmMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("does not throw the request when the audit log write itself fails", async () => {
    crmMocks.createAuditLog.mockRejectedValueOnce(new Error("db unavailable"));
    const res = await POST(loginRequest({ email: "test@example.com", password: "wrong-password" }));
    expect(res.status).toBe(401);
  });
});

describe("getCurrentUser tenant-suspension enforcement (session level)", () => {
  function authedRequest(token: string) {
    return new Request("http://localhost/api/auth/me", { headers: { authorization: `Bearer ${token}` } });
  }

  it("cuts off an already-issued session once its tenant becomes suspended", async () => {
    const login = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));
    const { access_token } = await login.json();

    authRepoMocks.getCurrentUserById.mockResolvedValueOnce({
      id: "user-1", email: "test@example.com", name: "Test User", tenantId: "tenant-a", roleId: null, role: null,
      isPlatformAdmin: false, platformAdminId: null, tenantStatus: "SUSPENDED",
    });

    const user = await getCurrentUser(authedRequest(access_token));
    expect(user).toBeNull();
  });

  it("does not cut off a platform admin's session even if their tenant is suspended", async () => {
    const login = await POST(loginRequest({ email: "test@example.com", password: PASSWORD }));
    const { access_token } = await login.json();

    authRepoMocks.getCurrentUserById.mockResolvedValueOnce({
      id: "user-1", email: "test@example.com", name: "Test User", tenantId: "tenant-a", roleId: null, role: null,
      isPlatformAdmin: true, platformAdminId: "admin-1", tenantStatus: "SUSPENDED",
    });

    const user = await getCurrentUser(authedRequest(access_token));
    expect(user?.id).toBe("user-1");
  });
});
