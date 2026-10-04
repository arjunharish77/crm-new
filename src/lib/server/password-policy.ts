import { randomUUID, randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { query, queryOne, execute, queryAsSystem, queryOneAsSystem, executeAsSystem } from "@/lib/db/query";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { createAuditLog } from "@/lib/server/crm";
import { createUserNotification } from "@/lib/server/notifications";
import { revokeAllOtherSessions, revokeAllSessionsForUser } from "@/lib/server/sessions";
import { appBaseUrl, emailLogoHtml, isSystemEmailConfigured, sendSystemEmail } from "@/lib/server/system-email";

const RESET_TOKEN_HOURS = 1;

type TenantUser = { id: string; tenantId: string | null };
type PasswordPolicy = { minPasswordLength: number; requireUppercase: boolean; requireLowercase: boolean; requireNumbers: boolean; requireSpecialChars: boolean; preventPasswordReuse: number; passwordExpiryDays: number };

export class PasswordPolicyError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super("PASSWORD_POLICY_VIOLATION");
    this.errors = errors;
  }
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function validatePasswordStrength(password: string, policy: PasswordPolicy): string[] {
  const errors: string[] = [];
  if (password.length < policy.minPasswordLength) errors.push(`Must be at least ${policy.minPasswordLength} characters`);
  if (policy.requireUppercase && !/[A-Z]/.test(password)) errors.push("Must include an uppercase letter");
  if (policy.requireLowercase && !/[a-z]/.test(password)) errors.push("Must include a lowercase letter");
  if (policy.requireNumbers && !/[0-9]/.test(password)) errors.push("Must include a number");
  if (policy.requireSpecialChars && !/[^A-Za-z0-9]/.test(password)) errors.push("Must include a special character");
  return errors;
}

// The policy as plain requirements, for the password forms (UI/UX plan Phase 3, "one password
// rule"): every place that sets a password shows the same rule the server enforces.
export function describePasswordPolicy(policy: PasswordPolicy): string[] {
  const rules = [`At least ${policy.minPasswordLength} characters`];
  if (policy.requireUppercase) rules.push("An uppercase letter");
  if (policy.requireLowercase) rules.push("A lowercase letter");
  if (policy.requireNumbers) rules.push("A number");
  if (policy.requireSpecialChars) rules.push("A symbol, such as ! or #");
  if (policy.preventPasswordReuse > 0) rules.push(`Not one of your last ${policy.preventPasswordReuse} passwords`);
  return rules;
}

// The rule as the password forms need it: the plain requirements plus the flags they check as
// you type. Contains nothing about the user or workspace beyond the rule itself, so it can be
// shown before sign-in (expired password, reset link).
export function passwordRuleForForms(policy: PasswordPolicy) {
  return {
    rules: describePasswordPolicy(policy),
    minPasswordLength: policy.minPasswordLength,
    requireUppercase: policy.requireUppercase,
    requireLowercase: policy.requireLowercase,
    requireNumbers: policy.requireNumbers,
    requireSpecialChars: policy.requireSpecialChars,
  };
}

// The rule for a reset link's workspace, or null when the link isn't valid any more.
export async function passwordRuleForResetToken(rawToken: string) {
  const row = await queryOneAsSystem<{ tenantId: string | null }>(
    `select "tenantId" from "PasswordResetToken" where "tokenHash" = $1 and "usedAt" is null and "expiresAt" > now()`,
    [hashToken(rawToken)],
  );
  if (!row) return null;
  return passwordRuleForForms(await getEffectiveSecurityPolicy(row.tenantId));
}

async function assertPasswordMeetsPolicy(tenantId: string | null, password: string) {
  const policy = await getEffectiveSecurityPolicy(tenantId);
  const errors = validatePasswordStrength(password, policy);
  if (errors.length) throw new PasswordPolicyError(errors);
  return policy;
}

// SecurityPolicy.passwordExpiryDays -- 0 (or a user with no recorded change date, e.g. one
// created before this feature shipped whose backfill somehow didn't reach) never expires.
export function isPasswordExpired(passwordChangedAt: string | null, policy: { passwordExpiryDays: number }): boolean {
  if (!policy.passwordExpiryDays || policy.passwordExpiryDays <= 0) return false;
  if (!passwordChangedAt) return false;
  const deadline = new Date(passwordChangedAt).getTime() + policy.passwordExpiryDays * 24 * 60 * 60 * 1000;
  return Date.now() > deadline;
}

async function isPasswordReused(userId: string, newPassword: string, preventPasswordReuse: number): Promise<boolean> {
  if (!preventPasswordReuse || preventPasswordReuse <= 0) return false;
  const rows = await query<{ passwordHash: string }>(
    `select "passwordHash" from "PasswordHistory" where "userId" = $1 order by "createdAt" desc limit $2`,
    [userId, preventPasswordReuse],
  );
  for (const row of rows) {
    if (await bcrypt.compare(newPassword, row.passwordHash)) return true;
  }
  return false;
}

async function recordPasswordHistory(user: TenantUser, passwordHash: string) {
  await execute(
    `insert into "PasswordHistory" (id, "userId", "tenantId", "passwordHash", "createdAt") values ($1, $2, $3, $4, $5)`,
    [randomUUID(), user.id, user.tenantId, passwordHash, new Date().toISOString()],
  );
}

async function applyNewPassword(user: TenantUser, newPassword: string, policy: PasswordPolicy) {
  if (await isPasswordReused(user.id, newPassword, policy.preventPasswordReuse)) {
    throw new PasswordPolicyError([`Cannot reuse any of your last ${policy.preventPasswordReuse} password(s)`]);
  }
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const now = new Date().toISOString();
  await execute(`update "User" set password = $1, "passwordChangedAt" = $2 where id = $3`, [passwordHash, now, user.id]);
  await recordPasswordHistory(user, passwordHash);
}

// ---------------------------------------------------------------------------------------------
// Self-service change (logged in, knows the current password) and the expired-password
// forced-change (post-login, current password already proven correct by the login attempt
// itself -- see signPasswordChangeToken in auth.ts).
// ---------------------------------------------------------------------------------------------

export async function changeOwnPassword(user: TenantUser, currentPassword: string, newPassword: string) {
  const row = await queryOne<{ password: string | null }>(`select password from "User" where id = $1`, [user.id]);
  if (!row?.password || !(await bcrypt.compare(currentPassword, row.password))) {
    throw new Error("INVALID_CURRENT_PASSWORD");
  }
  const policy = await assertPasswordMeetsPolicy(user.tenantId, newPassword);
  await applyNewPassword(user, newPassword, policy);
  // Every other signed-in session ends; this one stays (S3).
  const currentSessionId = (user as { sessionId?: string | null }).sessionId;
  if (currentSessionId) await revokeAllOtherSessions(user.id, currentSessionId, user.id);
  else await revokeAllSessionsForUser(user.id, "PASSWORD_CHANGED");
  await createAuditLog(user as any, "PASSWORD_CHANGED", "USER", user.id, null, null, null).catch(() => undefined);
}

export async function changeExpiredPassword(user: TenantUser, newPassword: string) {
  const policy = await assertPasswordMeetsPolicy(user.tenantId, newPassword);
  await applyNewPassword(user, newPassword, policy);
  await createAuditLog(user as any, "PASSWORD_CHANGED_AFTER_EXPIRY", "USER", user.id, null, null, null).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// Admin-mediated reset ("reset-token expiry" checklist sub-item) -- see migration 0079's
// comment for why this is admin-generated-and-shared rather than emailed: this app has no
// system/transactional email sender, only a tenant-configurable marketing pipeline that would
// silently do nothing for the (most) tenants that haven't configured an email provider.
// ---------------------------------------------------------------------------------------------

export async function adminGeneratePasswordResetToken(adminUser: TenantUser, targetUserId: string, targetTenantId: string) {
  const target = await queryOne<{ id: string }>(`select id from "User" where id = $1 and "tenantId" = $2`, [targetUserId, targetTenantId]);
  if (!target) throw new Error("USER_NOT_FOUND");

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_HOURS * 60 * 60 * 1000).toISOString();
  await execute(
    `insert into "PasswordResetToken" (id, "userId", "tenantId", "tokenHash", "expiresAt", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), targetUserId, targetTenantId, hashToken(rawToken), expiresAt, adminUser.id, new Date().toISOString()],
  );
  await createAuditLog(adminUser as any, "PASSWORD_RESET_TOKEN_ISSUED", "USER", targetUserId, null, null, { issuedBy: adminUser.id }).catch(() => undefined);
  return { token: rawToken, expiresAt, expiresInSeconds: RESET_TOKEN_HOURS * 60 * 60 };
}

// Self-service reset (decision 16): "Forgot password?" emails a one-hour, single-use link through
// the platform's SMTP account (lib/server/system-email). The caller always gets the same answer
// and doesn't wait for this to finish, so neither the reply nor its timing says whether an
// account exists. Only active users in workspaces that aren't suspended get an email; a new link
// replaces any earlier unused one.
export async function requestPasswordResetByEmail(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  if (!email || !isSystemEmailConfigured()) return;
  const user = await queryOneAsSystem<{ id: string; tenantId: string | null; name: string | null; status: string; tenantStatus: string | null }>(
    `select u.id, u."tenantId", u.name, u.status, t.status as "tenantStatus"
     from "User" u left join "Tenant" t on t.id = u."tenantId"
     where lower(u.email) = $1 limit 1`,
    [email],
  );
  if (!user || user.status !== "ACTIVE" || user.tenantStatus === "SUSPENDED") return;

  const rawToken = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_HOURS * 60 * 60 * 1000).toISOString();
  await executeAsSystem(`update "PasswordResetToken" set "expiresAt" = $1 where "userId" = $2 and "usedAt" is null and "expiresAt" > $1`, [now.toISOString(), user.id]);
  await executeAsSystem(
    `insert into "PasswordResetToken" (id, "userId", "tenantId", "tokenHash", "expiresAt", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, $2, $6)`,
    [randomUUID(), user.id, user.tenantId, hashToken(rawToken), expiresAt, now.toISOString()],
  );
  const link = `${appBaseUrl()}/reset-password?token=${rawToken}`;
  const greeting = user.name ? `Hi ${user.name.split(" ")[0]},` : "Hi,";
  await sendSystemEmail({
    to: email,
    subject: "Reset your password",
    text: `${greeting}\n\nSomeone asked to reset the password for your account. To choose a new password, open this link within the next hour:\n\n${link}\n\nThe link works once. If you didn't ask for this, you can ignore this email; your password hasn't changed.\n`,
    html: `${emailLogoHtml()}<p>${escapeHtml(greeting)}</p><p>Someone asked to reset the password for your account. To choose a new password, open this link within the next hour:</p><p><a href="${escapeHtml(link)}">Reset your password</a></p><p>The link works once. If you didn't ask for this, you can ignore this email; your password hasn't changed.</p>`,
  });
  await createAuditLog({ id: user.id, tenantId: user.tenantId } as any, "PASSWORD_RESET_REQUESTED", "USER", user.id, null, null, null).catch(() => undefined);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}

// WP07 (F04): PRE_AUTH, disposition B -- the token is opaque; which tenant it belongs to is
// exactly what this lookup discovers, so it must search across every tenant with no context.
export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
  const row = await queryOneAsSystem<{ id: string; userId: string; tenantId: string | null }>(
    `select id, "userId", "tenantId" from "PasswordResetToken" where "tokenHash" = $1 and "usedAt" is null and "expiresAt" > now()`,
    [hashToken(rawToken)],
  );
  if (!row) throw new Error("INVALID_OR_EXPIRED_TOKEN");

  const user = { id: row.userId, tenantId: row.tenantId };
  const policy = await assertPasswordMeetsPolicy(user.tenantId, newPassword);
  await applyNewPassword(user, newPassword, policy);
  // Exclusive to this pre-auth flow (unlike applyNewPassword/assertPasswordMeetsPolicy above,
  // which are shared with changeOwnPassword's normal authenticated call path and are
  // deliberately NOT converted here -- see plan doc open question).
  await executeAsSystem(`update "PasswordResetToken" set "usedAt" = $1 where id = $2`, [new Date().toISOString(), row.id]);
  // The old password may have been compromised (that's the whole reason a reset was needed) --
  // every existing session for this user is invalidated, same as a full account takeover
  // response, not just the device performing the reset.
  await revokeAllSessionsForUser(user.id, "PASSWORD_RESET").catch(() => undefined);
  await createAuditLog(user as any, "PASSWORD_RESET_COMPLETED", "USER", user.id, null, null, null).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------
// Suspicious login alerts -- reuses the raw ingredients the session-management pass already
// captures (UserSession.ipAddress history) rather than a new fingerprinting mechanism. Must be
// called BEFORE the new session row for this login is created, or it would always find itself
// as "a session from this IP" and never fire.
// ---------------------------------------------------------------------------------------------

// WP07 (F04): PRE_AUTH, disposition B -- its single caller, login-flow.ts's
// issueSessionForUser, runs entirely pre-session (both the plain-login and post-MFA success
// paths call it before any tenant context is established).
export async function checkSuspiciousLogin(user: TenantUser, ip: string | null) {
  if (!ip) return;
  const priorSessions = await queryAsSystem<{ id: string }>(`select id from "UserSession" where "userId" = $1 limit 1`, [user.id]);
  if (priorSessions.length === 0) return; // first-ever login -- nothing to compare against yet

  const seenBefore = await queryOneAsSystem<{ id: string }>(
    `select id from "UserSession" where "userId" = $1 and "ipAddress" = $2 limit 1`,
    [user.id, ip],
  );
  if (seenBefore) return;

  await createUserNotification({
    tenantId: user.tenantId,
    userId: user.id,
    title: "New sign-in from an unrecognized location",
    message: `Your account was just signed into from a new IP address (${ip}). If this wasn't you, change your password immediately.`,
    data: { type: "auth.suspiciousLogin", ip },
    category: "SECURITY",
  }).catch(() => undefined);
  await createAuditLog(user as any, "SUSPICIOUS_LOGIN_NEW_IP", "USER", user.id, null, null, { ip }).catch(() => undefined);
}
