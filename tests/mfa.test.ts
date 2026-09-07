import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const policyMocks = vi.hoisted(() => ({ getEffectiveSecurityPolicy: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const totpMocks = vi.hoisted(() => ({
  generateTotpSecret: vi.fn(() => "SECRET123"),
  generateTotpUri: vi.fn(() => "otpauth://totp/test"),
  verifyTotpToken: vi.fn(),
  generateBackupCodes: vi.fn(() => ["AAAA-1111", "BBBB-2222"]),
}));
const qrcodeMocks = vi.hoisted(() => ({ toDataURL: vi.fn(async () => "data:image/png;base64,fake") }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/security-policy", () => policyMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/totp", () => totpMocks);
vi.mock("qrcode", () => ({ default: qrcodeMocks }));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
    compare: vi.fn(async (value: string, hash: string) => hash === `hashed:${value}`),
  },
}));

import {
  resolveMfaRequirement,
  isPastMfaGracePeriod,
  startMfaEnrollment,
  confirmMfaEnrollment,
  disableMfa,
  verifyMfaLoginCode,
  countRemainingBackupCodes,
  regenerateBackupCodes,
  createTrustedDevice,
  isTrustedDevice,
  resetMfaForUserAsAdmin,
} from "@/lib/server/mfa";

const DEFAULT_POLICY = {
  mfaEnforcementMode: "OPTIONAL" as const,
  mfaEnforcedSince: null as string | null,
  mfaGracePeriodDays: 14,
};

beforeEach(() => {
  dbMocks.query.mockReset();
  dbMocks.queryOne.mockReset();
  dbMocks.execute.mockReset().mockResolvedValue(undefined);
  policyMocks.getEffectiveSecurityPolicy.mockReset().mockResolvedValue({ ...DEFAULT_POLICY });
  crmMocks.createAuditLog.mockClear();
  totpMocks.verifyTotpToken.mockReset();
});

describe("resolveMfaRequirement", () => {
  it("returns not-required when nothing requires it", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ userOverride: null, roleRequired: false });
    const result = await resolveMfaRequirement("user-1", "tenant-a", "2026-01-01T00:00:00.000Z");
    expect(result).toEqual({ required: false, source: "NOT_REQUIRED", graceDeadline: null });
  });

  it("an explicit user-level exemption (false) wins over everything else", async () => {
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce({ ...DEFAULT_POLICY, mfaEnforcementMode: "REQUIRED_ALL", mfaEnforcedSince: "2026-01-01T00:00:00.000Z" });
    dbMocks.queryOne.mockResolvedValueOnce({ userOverride: false, roleRequired: true });
    const result = await resolveMfaRequirement("user-1", "tenant-a", "2026-01-01T00:00:00.000Z");
    expect(result.required).toBe(false);
    expect(result.source).toBe("NOT_REQUIRED");
  });

  it("an explicit user-level requirement (true) wins even under OPTIONAL policy", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ userOverride: true, roleRequired: false });
    const result = await resolveMfaRequirement("user-1", "tenant-a", "2026-01-01T00:00:00.000Z");
    expect(result).toEqual({ required: true, source: "USER_OVERRIDE", graceDeadline: null });
  });

  it("a role-level requirement applies when no user override is set", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ userOverride: null, roleRequired: true });
    const result = await resolveMfaRequirement("user-1", "tenant-a", "2026-01-01T00:00:00.000Z");
    expect(result).toEqual({ required: true, source: "ROLE", graceDeadline: null });
  });

  it("REQUIRED_ALL policy requires everyone and computes a grace deadline from mfaEnforcedSince", async () => {
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce({ mfaEnforcementMode: "REQUIRED_ALL", mfaEnforcedSince: "2026-01-01T00:00:00.000Z", mfaGracePeriodDays: 14 });
    dbMocks.queryOne.mockResolvedValueOnce({ userOverride: null, roleRequired: false });
    const result = await resolveMfaRequirement("user-1", "tenant-a", "2025-01-01T00:00:00.000Z");
    expect(result.required).toBe(true);
    expect(result.source).toBe("POLICY_REQUIRED_ALL");
    expect(result.graceDeadline).toBe("2026-01-15T00:00:00.000Z");
  });

  it("REQUIRED_NEW_USERS only applies to users created after mfaEnforcedSince", async () => {
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValue({ mfaEnforcementMode: "REQUIRED_NEW_USERS", mfaEnforcedSince: "2026-01-01T00:00:00.000Z", mfaGracePeriodDays: 14 });
    dbMocks.queryOne.mockResolvedValue({ userOverride: null, roleRequired: false });

    const newUser = await resolveMfaRequirement("user-new", "tenant-a", "2026-02-01T00:00:00.000Z");
    expect(newUser.required).toBe(true);
    expect(newUser.source).toBe("POLICY_REQUIRED_NEW_USERS");

    const oldUser = await resolveMfaRequirement("user-old", "tenant-a", "2025-06-01T00:00:00.000Z");
    expect(oldUser.required).toBe(false);
  });
});

describe("isPastMfaGracePeriod", () => {
  it("is false when not required at all", () => {
    expect(isPastMfaGracePeriod({ required: false, source: "NOT_REQUIRED", graceDeadline: null })).toBe(false);
  });

  it("is false when required but no deadline has passed yet", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isPastMfaGracePeriod({ required: true, source: "POLICY_REQUIRED_ALL", graceDeadline: future })).toBe(false);
  });

  it("is true once the deadline has passed", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isPastMfaGracePeriod({ required: true, source: "POLICY_REQUIRED_ALL", graceDeadline: past })).toBe(true);
  });

  it("is false when required but there's no deadline at all (e.g. USER_OVERRIDE/ROLE, which have no grace period)", () => {
    expect(isPastMfaGracePeriod({ required: true, source: "USER_OVERRIDE", graceDeadline: null })).toBe(false);
  });
});

describe("startMfaEnrollment / confirmMfaEnrollment", () => {
  const user = { id: "user-1", tenantId: "tenant-a" };

  it("writes a pending secret and returns a QR code data URI", async () => {
    const result = await startMfaEnrollment(user, "user@example.com");
    expect(result.secret).toBe("SECRET123");
    expect(result.qrCodeDataUri).toContain("data:image/png");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('"mfaSecret"'), ["SECRET123", "user-1"]);
  });

  it("confirmMfaEnrollment throws when enrollment was never started", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: null });
    await expect(confirmMfaEnrollment(user, "123456")).rejects.toThrow("MFA_ENROLLMENT_NOT_STARTED");
  });

  it("confirmMfaEnrollment throws on an invalid code without enabling MFA", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123" });
    totpMocks.verifyTotpToken.mockReturnValueOnce(false);
    await expect(confirmMfaEnrollment(user, "000000")).rejects.toThrow("INVALID_MFA_CODE");
    expect(dbMocks.execute).not.toHaveBeenCalledWith(expect.stringContaining('"mfaEnabled" = true'), expect.anything());
  });

  it("confirmMfaEnrollment enables MFA and returns 10 backup codes on a valid code", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123" });
    totpMocks.verifyTotpToken.mockReturnValueOnce(true);
    totpMocks.generateBackupCodes.mockReturnValueOnce(Array.from({ length: 10 }, (_, i) => `CODE-${i}`));

    const result = await confirmMfaEnrollment(user, "123456");

    expect(result.backupCodes).toHaveLength(10);
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('"mfaEnabled" = true'), expect.arrayContaining(["user-1"]));
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "MFA_ENROLLED", "USER", "user-1", null, null, null);
  });
});

describe("verifyMfaLoginCode", () => {
  const user = { id: "user-1", tenantId: "tenant-a" };

  it("returns invalid when the user has no mfaSecret at all", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: null });
    const result = await verifyMfaLoginCode(user, "123456");
    expect(result).toEqual({ valid: false, usedBackupCode: false });
  });

  it("validates via TOTP and logs MFA_VERIFIED", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123" });
    totpMocks.verifyTotpToken.mockReturnValueOnce(true);
    const result = await verifyMfaLoginCode(user, "123456");
    expect(result).toEqual({ valid: true, usedBackupCode: false });
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "MFA_VERIFIED", "USER", "user-1", null, null, null);
  });

  it("falls back to a backup code when the TOTP code is wrong, and marks it used", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123" });
    totpMocks.verifyTotpToken.mockReturnValueOnce(false);
    dbMocks.query.mockResolvedValueOnce([{ id: "backup-1", codeHash: "hashed:AAAA-1111" }]);

    const result = await verifyMfaLoginCode(user, "AAAA-1111");

    expect(result).toEqual({ valid: true, usedBackupCode: true });
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("used = true"), expect.arrayContaining(["backup-1"]));
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "MFA_VERIFIED_WITH_BACKUP_CODE", "USER", "user-1", null, null, null);
  });

  it("logs MFA_VERIFICATION_FAILED when neither TOTP nor any backup code matches", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123" });
    totpMocks.verifyTotpToken.mockReturnValueOnce(false);
    dbMocks.query.mockResolvedValueOnce([{ id: "backup-1", codeHash: "hashed:AAAA-1111" }]);

    const result = await verifyMfaLoginCode(user, "WRONG-CODE");

    expect(result).toEqual({ valid: false, usedBackupCode: false });
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "MFA_VERIFICATION_FAILED", "USER", "user-1", null, null, null);
  });

  it("a used backup code cannot be consumed twice (it's excluded from the used=false candidate query)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123" });
    totpMocks.verifyTotpToken.mockReturnValueOnce(false);
    dbMocks.query.mockResolvedValueOnce([]); // the used=false filter already excludes it
    const result = await verifyMfaLoginCode(user, "AAAA-1111");
    expect(result.valid).toBe(false);
  });
});

describe("disableMfa", () => {
  const user = { id: "user-1", tenantId: "tenant-a" };

  it("throws when MFA isn't currently enabled", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: null, mfaEnabled: false });
    await expect(disableMfa(user, "123456")).rejects.toThrow("MFA_NOT_ENABLED");
  });

  it("throws on an invalid code and does not disable", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123", mfaEnabled: true });
    totpMocks.verifyTotpToken.mockReturnValueOnce(false);
    dbMocks.query.mockResolvedValueOnce([]);
    await expect(disableMfa(user, "000000")).rejects.toThrow("INVALID_MFA_CODE");
    expect(dbMocks.execute).not.toHaveBeenCalledWith(expect.stringContaining('"mfaEnabled" = false'), expect.anything());
  });

  it("clears mfaEnabled/secret, backup codes, and trusted devices on success", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123", mfaEnabled: true });
    totpMocks.verifyTotpToken.mockReturnValueOnce(true);
    await disableMfa(user, "123456");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('"mfaEnabled" = false'), ["user-1"]);
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('delete from "MfaBackupCode"'), ["user-1"]);
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('delete from "TrustedDevice"'), ["user-1"]);
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(user, "MFA_DISABLED", "USER", "user-1", null, null, null);
  });
});

describe("countRemainingBackupCodes / regenerateBackupCodes", () => {
  it("counts only unused codes", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ count: "7" });
    const count = await countRemainingBackupCodes("user-1");
    expect(count).toBe(7);
    expect(dbMocks.queryOne.mock.calls[0][0]).toContain("used = false");
  });

  it("regenerateBackupCodes requires MFA to already be enabled", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: null, mfaEnabled: false });
    await expect(regenerateBackupCodes({ id: "user-1", tenantId: "tenant-a" }, "123456")).rejects.toThrow("MFA_NOT_ENABLED");
  });

  it("regenerateBackupCodes replaces all codes on a valid TOTP code", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ mfaSecret: "SECRET123", mfaEnabled: true });
    totpMocks.verifyTotpToken.mockReturnValueOnce(true);
    totpMocks.generateBackupCodes.mockReturnValueOnce(["NEW1-CODE", "NEW2-CODE"]);
    const result = await regenerateBackupCodes({ id: "user-1", tenantId: "tenant-a" }, "123456");
    expect(result.backupCodes).toEqual(["NEW1-CODE", "NEW2-CODE"]);
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('delete from "MfaBackupCode"'), ["user-1"]);
  });
});

describe("createTrustedDevice / isTrustedDevice", () => {
  const user = { id: "user-1", tenantId: "tenant-a" };

  it("creates a device with a ~30 day expiry and returns the raw (unhashed) token", async () => {
    const result = await createTrustedDevice(user, "Mozilla/5.0", "1.2.3.4");
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresInSeconds).toBe(30 * 24 * 60 * 60);
    const insertCall = dbMocks.execute.mock.calls[0];
    expect(insertCall[1]).not.toContain(result.token); // only the hash is stored, never the raw token
  });

  it("isTrustedDevice returns false for a null token without querying the database", async () => {
    const result = await isTrustedDevice("user-1", null);
    expect(result).toBe(false);
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
  });

  it("isTrustedDevice returns true and bumps lastUsedAt for a valid, unexpired token", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "device-1" });
    const result = await isTrustedDevice("user-1", "some-raw-token");
    expect(result).toBe(true);
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("lastUsedAt"), expect.arrayContaining(["device-1"]));
  });

  it("isTrustedDevice returns false when no matching row exists (wrong token, or expired)", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const result = await isTrustedDevice("user-1", "some-raw-token");
    expect(result).toBe(false);
  });
});

describe("resetMfaForUserAsAdmin", () => {
  const admin = { id: "admin-1", tenantId: "tenant-a" };

  it("throws USER_NOT_FOUND when the target user doesn't belong to this tenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(resetMfaForUserAsAdmin(admin, "user-1", "tenant-a")).rejects.toThrow("USER_NOT_FOUND");
  });

  it("clears MFA state and logs MFA_ADMIN_RESET attributed to the admin", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ id: "user-1" });
    await resetMfaForUserAsAdmin(admin, "user-1", "tenant-a");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining('"mfaEnabled" = false'), ["user-1"]);
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(admin, "MFA_ADMIN_RESET", "USER", "user-1", null, null, { resetBy: "admin-1" });
  });
});
