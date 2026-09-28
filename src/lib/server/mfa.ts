import { randomUUID, randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { query, queryOne, execute, queryOneAsSystem, executeAsSystem } from "@/lib/db/query";
import { generateTotpSecret, generateTotpUri, verifyTotpToken, generateBackupCodes } from "@/lib/server/totp";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { createAuditLog } from "@/lib/server/crm";

const TRUSTED_DEVICE_DAYS = 30;
const BACKUP_CODE_COUNT = 10;

type TenantUser = { id: string; tenantId: string | null };

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------------------------
// Requirement resolution ("required MFA by role/user") -- team is NOT built, stated honestly
// (no per-team MFA requirement concept anywhere in this schema; the three axes the checklist
// names are role, user, and team, and this pass covers 2 of 3).
// ---------------------------------------------------------------------------------------------

export type MfaRequirement = { required: boolean; source: "USER_OVERRIDE" | "ROLE" | "POLICY_REQUIRED_ALL" | "POLICY_REQUIRED_NEW_USERS" | "NOT_REQUIRED"; graceDeadline: string | null };

export async function resolveMfaRequirement(userId: string, tenantId: string | null, userCreatedAt: string): Promise<MfaRequirement> {
  const policy = await getEffectiveSecurityPolicy(tenantId);
  const row = await queryOne<{ userOverride: boolean | null; roleRequired: boolean | null }>(
    `select u."mfaRequired" as "userOverride", r."mfaRequired" as "roleRequired"
     from "User" u left join "Role" r on r.id = u."roleId"
     where u.id = $1 limit 1`,
    [userId],
  );

  const graceDeadline = (reason: "REQUIRED_ALL" | "REQUIRED_NEW_USERS") => {
    if (!policy.mfaEnforcedSince) return null;
    const deadline = new Date(policy.mfaEnforcedSince).getTime() + policy.mfaGracePeriodDays * 24 * 60 * 60 * 1000;
    return new Date(deadline).toISOString();
  };

  // Explicit per-user override always wins -- an admin exempting or forcing one specific
  // person is a deliberate decision that should never be silently overridden by a broader
  // role or tenant-wide policy change.
  if (row?.userOverride === false) return { required: false, source: "NOT_REQUIRED", graceDeadline: null };
  if (row?.userOverride === true) return { required: true, source: "USER_OVERRIDE", graceDeadline: null };
  if (row?.roleRequired) return { required: true, source: "ROLE", graceDeadline: null };
  if (policy.mfaEnforcementMode === "REQUIRED_ALL") return { required: true, source: "POLICY_REQUIRED_ALL", graceDeadline: graceDeadline("REQUIRED_ALL") };
  if (policy.mfaEnforcementMode === "REQUIRED_NEW_USERS" && policy.mfaEnforcedSince && new Date(userCreatedAt) > new Date(policy.mfaEnforcedSince)) {
    return { required: true, source: "POLICY_REQUIRED_NEW_USERS", graceDeadline: graceDeadline("REQUIRED_NEW_USERS") };
  }
  return { required: false, source: "NOT_REQUIRED", graceDeadline: null };
}

// Called at login once MFA is confirmed required-but-not-enabled: within the grace period,
// login still succeeds (the frontend nags); past it, login is blocked outright until the user
// enrolls or an admin intervenes.
export function isPastMfaGracePeriod(requirement: MfaRequirement): boolean {
  return requirement.required && !!requirement.graceDeadline && Date.now() > new Date(requirement.graceDeadline).getTime();
}

// ---------------------------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------------------------

// Writes the secret immediately but leaves mfaEnabled=false until confirmEnrollment proves the
// user actually scanned it correctly -- an abandoned enrollment just leaves an inert, unused
// secret sitting on the row (mfaEnabled stays false, so it has zero effect on login) rather
// than needing a separate "pending secret" table.
export async function startMfaEnrollment(user: TenantUser, accountEmail: string) {
  const secret = generateTotpSecret();
  await execute(`update "User" set "mfaSecret" = $1 where id = $2`, [secret, user.id]);
  const uri = generateTotpUri(secret, accountEmail);
  const qrCodeDataUri = await QRCode.toDataURL(uri);
  return { secret, otpauthUri: uri, qrCodeDataUri };
}

export async function confirmMfaEnrollment(user: TenantUser, token: string) {
  const row = await queryOne<{ mfaSecret: string | null }>(`select "mfaSecret" from "User" where id = $1`, [user.id]);
  if (!row?.mfaSecret) throw new Error("MFA_ENROLLMENT_NOT_STARTED");
  if (!verifyTotpToken(row.mfaSecret, token)) throw new Error("INVALID_MFA_CODE");

  const now = new Date().toISOString();
  await execute(`update "User" set "mfaEnabled" = true, "mfaEnrolledAt" = $1 where id = $2`, [now, user.id]);

  const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
  await execute(`delete from "MfaBackupCode" where "userId" = $1`, [user.id]); // clear any codes from a prior enrollment
  for (const code of backupCodes) {
    const codeHash = await bcrypt.hash(code, 10);
    await execute(
      `insert into "MfaBackupCode" (id, "userId", "tenantId", "codeHash", used, "createdAt") values ($1, $2, $3, $4, false, $5)`,
      [randomUUID(), user.id, user.tenantId, codeHash, now],
    );
  }

  await createAuditLog(user as any, "MFA_ENROLLED", "USER", user.id, null, null, null).catch(() => undefined);
  return { backupCodes };
}

export async function disableMfa(user: TenantUser, token: string) {
  const row = await queryOne<{ mfaSecret: string | null; mfaEnabled: boolean }>(`select "mfaSecret", "mfaEnabled" from "User" where id = $1`, [user.id]);
  if (!row?.mfaEnabled || !row.mfaSecret) throw new Error("MFA_NOT_ENABLED");
  if (!verifyTotpToken(row.mfaSecret, token) && !(await consumeBackupCodeIfValid(user.id, token))) throw new Error("INVALID_MFA_CODE");

  await execute(`update "User" set "mfaEnabled" = false, "mfaSecret" = null, "mfaEnrolledAt" = null where id = $1`, [user.id]);
  await execute(`delete from "MfaBackupCode" where "userId" = $1`, [user.id]);
  await execute(`delete from "TrustedDevice" where "userId" = $1`, [user.id]);
  await createAuditLog(user as any, "MFA_DISABLED", "USER", user.id, null, null, null).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// Verification (TOTP or a backup code) -- the actual login-time check.
// ---------------------------------------------------------------------------------------------

async function consumeBackupCodeIfValid(userId: string, rawCode: string): Promise<boolean> {
  const candidates = await query<{ id: string; codeHash: string }>(`select id, "codeHash" from "MfaBackupCode" where "userId" = $1 and used = false`, [userId]);
  for (const candidate of candidates) {
    if (await bcrypt.compare(rawCode.trim().toUpperCase(), candidate.codeHash)) {
      await execute(`update "MfaBackupCode" set used = true, "usedAt" = $1 where id = $2`, [new Date().toISOString(), candidate.id]);
      return true;
    }
  }
  return false;
}

// WP07 (F04): PRE_AUTH, disposition B -- its one caller (auth/mfa/verify/route.ts) runs entirely
// pre-session. (consumeBackupCodeIfValid below is NOT converted -- it's shared with the
// post-auth disableMfa/resetMfaForUserAsAdmin callers; see plan doc open question.)
export async function verifyMfaLoginCode(user: TenantUser, code: string): Promise<{ valid: boolean; usedBackupCode: boolean }> {
  const row = await queryOneAsSystem<{ mfaSecret: string | null }>(`select "mfaSecret" from "User" where id = $1`, [user.id]);
  if (!row?.mfaSecret) return { valid: false, usedBackupCode: false };
  if (verifyTotpToken(row.mfaSecret, code)) {
    await createAuditLog(user as any, "MFA_VERIFIED", "USER", user.id, null, null, null).catch(() => undefined);
    return { valid: true, usedBackupCode: false };
  }
  if (await consumeBackupCodeIfValid(user.id, code)) {
    await createAuditLog(user as any, "MFA_VERIFIED_WITH_BACKUP_CODE", "USER", user.id, null, null, null).catch(() => undefined);
    return { valid: true, usedBackupCode: true };
  }
  await createAuditLog(user as any, "MFA_VERIFICATION_FAILED", "USER", user.id, null, null, null).catch(() => undefined);
  return { valid: false, usedBackupCode: false };
}

export async function countRemainingBackupCodes(userId: string) {
  const row = await queryOne<{ count: string }>(`select count(*) as count from "MfaBackupCode" where "userId" = $1 and used = false`, [userId]);
  return Number(row?.count ?? 0);
}

export async function regenerateBackupCodes(user: TenantUser, token: string) {
  const row = await queryOne<{ mfaSecret: string | null; mfaEnabled: boolean }>(`select "mfaSecret", "mfaEnabled" from "User" where id = $1`, [user.id]);
  if (!row?.mfaEnabled || !row.mfaSecret) throw new Error("MFA_NOT_ENABLED");
  if (!verifyTotpToken(row.mfaSecret, token)) throw new Error("INVALID_MFA_CODE");

  const backupCodes = generateBackupCodes(BACKUP_CODE_COUNT);
  const now = new Date().toISOString();
  await execute(`delete from "MfaBackupCode" where "userId" = $1`, [user.id]);
  for (const code of backupCodes) {
    const codeHash = await bcrypt.hash(code, 10);
    await execute(
      `insert into "MfaBackupCode" (id, "userId", "tenantId", "codeHash", used, "createdAt") values ($1, $2, $3, $4, false, $5)`,
      [randomUUID(), user.id, user.tenantId, codeHash, now],
    );
  }
  await createAuditLog(user as any, "MFA_BACKUP_CODES_REGENERATED", "USER", user.id, null, null, null).catch(() => undefined);
  return { backupCodes };
}

// ---------------------------------------------------------------------------------------------
// Remembered devices
// ---------------------------------------------------------------------------------------------

// WP07 (F04): PRE_AUTH, disposition B -- its one caller (auth/mfa/verify/route.ts, when
// rememberDevice is set) runs pre-session.
export async function createTrustedDevice(user: TenantUser, userAgent: string | null, ipAddress: string | null) {
  const rawToken = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await executeAsSystem(
    `insert into "TrustedDevice" (id, "userId", "tenantId", "tokenHash", "userAgent", "ipAddress", "createdAt", "lastUsedAt", "expiresAt")
     values ($1, $2, $3, $4, $5, $6, $7, $7, $8)`,
    [randomUUID(), user.id, user.tenantId, hashToken(rawToken), userAgent, ipAddress, now.toISOString(), expiresAt],
  );
  return { token: rawToken, expiresInSeconds: TRUSTED_DEVICE_DAYS * 24 * 60 * 60 };
}

// WP07 (F04): PRE_AUTH, disposition B -- its one caller (auth/login/route.ts) checks this
// before a session exists, to decide whether MFA can be skipped for this device.
export async function isTrustedDevice(userId: string, rawToken: string | null): Promise<boolean> {
  if (!rawToken) return false;
  const row = await queryOneAsSystem<{ id: string }>(
    `select id from "TrustedDevice" where "userId" = $1 and "tokenHash" = $2 and "expiresAt" > now()`,
    [userId, hashToken(rawToken)],
  );
  if (!row) return false;
  await executeAsSystem(`update "TrustedDevice" set "lastUsedAt" = $1 where id = $2`, [new Date().toISOString(), row.id]).catch(() => undefined);
  return true;
}

export async function listTrustedDevicesForUser(userId: string) {
  return query<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; lastUsedAt: string; expiresAt: string }>(
    `select id, "userAgent", "ipAddress", "createdAt", "lastUsedAt", "expiresAt" from "TrustedDevice" where "userId" = $1 and "expiresAt" > now() order by "lastUsedAt" desc`,
    [userId],
  );
}

export async function revokeTrustedDevice(userId: string, deviceId: string) {
  await execute(`delete from "TrustedDevice" where id = $1 and "userId" = $2`, [deviceId, userId]);
}

// ---------------------------------------------------------------------------------------------
// Admin reset -- the "lost my phone" support flow.
// ---------------------------------------------------------------------------------------------

export async function resetMfaForUserAsAdmin(adminUser: TenantUser, targetUserId: string, targetTenantId: string) {
  const target = await queryOne<{ id: string }>(`select id from "User" where id = $1 and "tenantId" = $2`, [targetUserId, targetTenantId]);
  if (!target) throw new Error("USER_NOT_FOUND");
  await execute(`update "User" set "mfaEnabled" = false, "mfaSecret" = null, "mfaEnrolledAt" = null where id = $1`, [targetUserId]);
  await execute(`delete from "MfaBackupCode" where "userId" = $1`, [targetUserId]);
  await execute(`delete from "TrustedDevice" where "userId" = $1`, [targetUserId]);
  await createAuditLog(adminUser as any, "MFA_ADMIN_RESET", "USER", targetUserId, null, null, { resetBy: adminUser.id }).catch(() => undefined);
}
