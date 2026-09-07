import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const policyMocks = vi.hoisted(() => ({ getEffectiveSecurityPolicy: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const notificationMocks = vi.hoisted(() => ({ createUserNotification: vi.fn().mockResolvedValue(undefined) }));
const sessionMocks = vi.hoisted(() => ({ revokeAllSessionsForUser: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/security-policy", () => policyMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/notifications", () => notificationMocks);
vi.mock("@/lib/server/sessions", () => sessionMocks);
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    compare: vi.fn(async (value: string, hash: string) => hash === `hashed:${value}`),
  },
}));

import {
  validatePasswordStrength,
  isPasswordExpired,
  changeOwnPassword,
  changeExpiredPassword,
  adminGeneratePasswordResetToken,
  resetPasswordWithToken,
  checkSuspiciousLogin,
  PasswordPolicyError,
} from "@/lib/server/password-policy";

const STRICT_POLICY = {
  minPasswordLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  preventPasswordReuse: 5,
  passwordExpiryDays: 90,
};

const LOOSE_POLICY = { ...STRICT_POLICY, requireSpecialChars: false, preventPasswordReuse: 0, passwordExpiryDays: 0 };

beforeEach(() => {
  dbMocks.query.mockReset();
  dbMocks.queryOne.mockReset();
  dbMocks.execute.mockReset().mockResolvedValue(undefined);
  policyMocks.getEffectiveSecurityPolicy.mockReset().mockResolvedValue({ ...LOOSE_POLICY });
  crmMocks.createAuditLog.mockClear();
  notificationMocks.createUserNotification.mockClear();
  sessionMocks.revokeAllSessionsForUser.mockClear();
});

describe("validatePasswordStrength", () => {
  it("accepts a password that satisfies every rule", () => {
    expect(validatePasswordStrength("Str0ng!Pass", STRICT_POLICY)).toEqual([]);
  });

  it("flags each missing requirement independently", () => {
    expect(validatePasswordStrength("short", STRICT_POLICY)).toContain("Must be at least 8 characters");
    expect(validatePasswordStrength("alllowercase1!", STRICT_POLICY)).toContain("Must include an uppercase letter");
    expect(validatePasswordStrength("ALLUPPERCASE1!", STRICT_POLICY)).toContain("Must include a lowercase letter");
    expect(validatePasswordStrength("NoNumbersHere!", STRICT_POLICY)).toContain("Must include a number");
    expect(validatePasswordStrength("NoSpecialChars1", STRICT_POLICY)).toContain("Must include a special character");
  });

  it("skips a rule entirely when the policy doesn't require it", () => {
    const allOff = { ...STRICT_POLICY, minPasswordLength: 4, requireUppercase: false, requireLowercase: false, requireNumbers: false, requireSpecialChars: false };
    expect(validatePasswordStrength("nouppercase", allOff)).toEqual([]);
  });
});

describe("isPasswordExpired", () => {
  it("never expires when passwordExpiryDays is 0", () => {
    expect(isPasswordExpired("2020-01-01T00:00:00.000Z", { passwordExpiryDays: 0 })).toBe(false);
  });

  it("is false when there's no recorded change date", () => {
    expect(isPasswordExpired(null, { passwordExpiryDays: 30 })).toBe(false);
  });

  it("is false within the expiry window", () => {
    expect(isPasswordExpired(new Date().toISOString(), { passwordExpiryDays: 30 })).toBe(false);
  });

  it("is true once the expiry window has passed", () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(isPasswordExpired(old, { passwordExpiryDays: 30 })).toBe(true);
  });
});

describe("changeOwnPassword", () => {
  const user = { id: "user-1", tenantId: "tenant-a" };

  it("rejects the wrong current password", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ password: "hashed:correct" });
    await expect(changeOwnPassword(user, "wrong", "NewPass123")).rejects.toThrow("INVALID_CURRENT_PASSWORD");
  });

  it("rejects a new password that fails the strength policy", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ password: "hashed:correct" });
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce(STRICT_POLICY);
    await expect(changeOwnPassword(user, "correct", "weak")).rejects.toThrow(PasswordPolicyError);
  });

  it("rejects a new password matching one in the reuse window", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ password: "hashed:correct" });
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce(STRICT_POLICY);
    dbMocks.query.mockResolvedValueOnce([{ passwordHash: "hashed:OldPass123!" }]);
    await expect(changeOwnPassword(user, "correct", "OldPass123!")).rejects.toThrow(PasswordPolicyError);
  });

  it("updates the password, records history, and writes an audit log on success", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ password: "hashed:correct" });
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce(STRICT_POLICY);
    dbMocks.query.mockResolvedValueOnce([]);
    await changeOwnPassword(user, "correct", "NewPass123!");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('update "User" set password'), ["hashed:NewPass123!", expect.any(String), "user-1"]);
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('insert into "PasswordHistory"'), expect.arrayContaining(["hashed:NewPass123!"]));
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "PASSWORD_CHANGED", "USER", "user-1", null, null, null);
  });
});

describe("changeExpiredPassword", () => {
  it("does not require the current password, and audits as a post-expiry change", async () => {
    const user = { id: "user-1", tenantId: "tenant-a" };
    dbMocks.query.mockResolvedValueOnce([]);
    await changeExpiredPassword(user, "NewPass123!");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('update "User" set password'), expect.anything());
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "PASSWORD_CHANGED_AFTER_EXPIRY", "USER", "user-1", null, null, null);
  });

  it("still enforces strength and reuse rules", async () => {
    const user = { id: "user-1", tenantId: "tenant-a" };
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce(STRICT_POLICY);
    await expect(changeExpiredPassword(user, "weak")).rejects.toThrow(PasswordPolicyError);
  });
});

describe("adminGeneratePasswordResetToken", () => {
  const admin = { id: "admin-1", tenantId: "tenant-a" };

  it("throws when the target user isn't found in this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(adminGeneratePasswordResetToken(admin, "user-1", "tenant-a")).rejects.toThrow("USER_NOT_FOUND");
  });

  it("issues a token, stores only its hash, and audits the issuance", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "user-1" });
    const result = await adminGeneratePasswordResetToken(admin, "user-1", "tenant-a");
    expect(result.token).toEqual(expect.any(String));
    expect(result.expiresAt).toEqual(expect.any(String));
    const insertCall = dbMocks.execute.mock.calls.find((call) => String(call[0]).includes('insert into "PasswordResetToken"'));
    expect(insertCall).toBeTruthy();
    expect(insertCall![1]).not.toContain(result.token); // only the hash is persisted, never the raw token
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(admin, "PASSWORD_RESET_TOKEN_ISSUED", "USER", "user-1", null, null, { issuedBy: "admin-1" });
  });
});

describe("resetPasswordWithToken", () => {
  it("rejects an invalid or expired token", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(resetPasswordWithToken("bad-token", "NewPass123!")).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN");
  });

  it("still enforces strength/reuse for the token's target user", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "reset-1", userId: "user-1", tenantId: "tenant-a" });
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce(STRICT_POLICY);
    await expect(resetPasswordWithToken("raw-token", "weak")).rejects.toThrow(PasswordPolicyError);
  });

  it("resets the password, marks the token used, revokes every session, and audits completion", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "reset-1", userId: "user-1", tenantId: "tenant-a" });
    dbMocks.query.mockResolvedValueOnce([]);
    await resetPasswordWithToken("raw-token", "NewPass123!");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('update "User" set password'), expect.anything());
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('update "PasswordResetToken" set "usedAt"'), expect.anything());
    expect(sessionMocks.revokeAllSessionsForUser).toHaveBeenCalledWith("user-1", "PASSWORD_RESET");
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith({ id: "user-1", tenantId: "tenant-a" }, "PASSWORD_RESET_COMPLETED", "USER", "user-1", null, null, null);
  });
});

describe("checkSuspiciousLogin", () => {
  const user = { id: "user-1", tenantId: "tenant-a" };

  it("does nothing when no IP is available", async () => {
    await checkSuspiciousLogin(user, null);
    expect(dbMocks.query).not.toHaveBeenCalled();
    expect(notificationMocks.createUserNotification).not.toHaveBeenCalled();
  });

  it("does nothing on a user's very first-ever login (nothing to compare against)", async () => {
    dbMocks.query.mockResolvedValueOnce([]);
    await checkSuspiciousLogin(user, "1.2.3.4");
    expect(notificationMocks.createUserNotification).not.toHaveBeenCalled();
    expect(crmMocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("does nothing when this IP has been seen before", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "session-old" }]);
    dbMocks.queryOne.mockResolvedValueOnce({ id: "session-old" });
    await checkSuspiciousLogin(user, "1.2.3.4");
    expect(notificationMocks.createUserNotification).not.toHaveBeenCalled();
  });

  it("notifies and audits a login from a brand-new IP when history exists", async () => {
    dbMocks.query.mockResolvedValueOnce([{ id: "session-old" }]);
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await checkSuspiciousLogin(user, "9.9.9.9");
    expect(notificationMocks.createUserNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", tenantId: "tenant-a", data: { type: "auth.suspiciousLogin", ip: "9.9.9.9" } }),
    );
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "SUSPICIOUS_LOGIN_NEW_IP", "USER", "user-1", null, null, { ip: "9.9.9.9" });
  });
});
