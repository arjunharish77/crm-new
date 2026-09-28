import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getActivePlatformAdminByUserId, getLoginUserByEmail, isTenantSuspended } from "@/lib/repositories/auth-admin-postgres";
import { signMfaPendingToken, signPasswordChangeToken } from "@/lib/server/auth";
import { issueSessionForUser } from "@/lib/server/login-flow";
import { createAuditLog } from "@/lib/server/crm";
import { badRequest, tooManyRequests, unauthorized } from "@/lib/server/http";
import { checkRateLimit, peekRateLimit, clientIpFromRequest } from "@/lib/server/rate-limit";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { resolveMfaRequirement, isPastMfaGracePeriod, isTrustedDevice } from "@/lib/server/mfa";
import { isPasswordExpired } from "@/lib/server/password-policy";

const TRUSTED_DEVICE_COOKIE = "mfa_trusted_device";

function shouldExposeAuthDebug() {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true";
}

// Only reachable once a user row was found by email, so tenantId/userId are always real --
// AuditLog.tenantId/userId are both NOT NULL with FK constraints, so an unknown-email attempt
// (no user, no tenant to attribute it to) is deliberately not logged here; it stays
// console-only, same as before this change.
async function logLoginFailure(user: { id: string; tenantId: string | null }, stage: string, ip: string) {
  if (!user.tenantId) return;
  await createAuditLog(
    { id: user.id, tenantId: user.tenantId },
    "LOGIN_FAILED",
    "AUTH",
    user.id,
    null,
    null,
    { stage, ip },
  ).catch(() => undefined);
}

function authDebugResponse(details: Record<string, unknown>) {
  return NextResponse.json(
    {
      message: "Invalid credentials",
      debug: details,
    },
    { status: 401 }
  );
}

// This route uses a raw Request (not next/headers' cookies()), so reading an incoming cookie
// for the trusted-device check needs a manual parse -- there's no other cookie-reading need in
// this route to justify pulling in a general-purpose parser for.
function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const match = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  const password = body?.password;

  if (!email || !password) {
    return badRequest("Email and password are required");
  }

  const ip = clientIpFromRequest(request);
  const [ipLimit, emailLimit] = await Promise.all([
    checkRateLimit({ key: `login:ip:${ip}`, limit: 20, windowSeconds: 15 * 60 }),
    checkRateLimit({ key: `login:email:${email}`, limit: 5, windowSeconds: 15 * 60 }),
  ]);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const retryAfter = Math.max(ipLimit.resetSeconds, emailLimit.resetSeconds);
    return tooManyRequests("Too many login attempts. Please try again later.", retryAfter);
  }

  const user = await getLoginUserByEmail(email);

  // Policy-driven account lockout (gap checklist: "failed-login lockout" -- this is real login
  // throttling's missing sibling. The existing checkRateLimit calls above are a coarse,
  // fixed IP/email ceiling that protects against pure brute-force scanning regardless of
  // whether the email is real; this is the tenant-configurable lockout named in the
  // SecurityPolicy table -- maxLoginAttempts/lockoutDurationMinutes, previously a completely
  // dead column pair with zero backing code anywhere. peekRateLimit here (read-only, doesn't
  // count as an attempt) so a locked-out caller is rejected before the password is ever
  // touched, and the counter below only increments on an ACTUAL failed check.
  const lockoutPolicy = user ? await getEffectiveSecurityPolicy(user.tenantId) : null;
  const lockoutKey = user ? `login-lockout:user:${user.id}` : null;
  if (user && lockoutKey && lockoutPolicy) {
    const lockoutPeek = await peekRateLimit({ key: lockoutKey, limit: lockoutPolicy.maxLoginAttempts, windowSeconds: lockoutPolicy.lockoutDurationMinutes * 60 });
    if (!lockoutPeek.allowed) {
      return tooManyRequests(
        `Too many failed login attempts. Try again in ${Math.ceil(lockoutPeek.resetSeconds / 60)} minute(s).`,
        lockoutPeek.resetSeconds,
      );
    }
  }

  if (!user) {
    console.error("AUTH_LOGIN_FAILED", {
      stage: "user_lookup",
      error: null,
      foundUser: !!user,
      email,
    });

    if (shouldExposeAuthDebug()) {
      return authDebugResponse({
        stage: "user_lookup",
        error: null,
        foundUser: !!user,
        email,
      });
    }

    return unauthorized("Invalid credentials");
  }

  if (!user.password) {
    console.error("AUTH_LOGIN_FAILED", {
      stage: "missing_password",
      userId: user.id,
      email: user.email,
    });
    await logLoginFailure(user, "missing_password", ip);
    await checkRateLimit({ key: lockoutKey!, limit: lockoutPolicy!.maxLoginAttempts, windowSeconds: lockoutPolicy!.lockoutDurationMinutes * 60 });

    if (shouldExposeAuthDebug()) {
      return authDebugResponse({
        stage: "missing_password",
        userId: user.id,
        email: user.email,
      });
    }

    return unauthorized("Invalid credentials");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    console.error("AUTH_LOGIN_FAILED", {
      stage: "password_compare",
      userId: user.id,
      email: user.email,
    });
    await logLoginFailure(user, "password_compare", ip);
    await checkRateLimit({ key: lockoutKey!, limit: lockoutPolicy!.maxLoginAttempts, windowSeconds: lockoutPolicy!.lockoutDurationMinutes * 60 });

    if (shouldExposeAuthDebug()) {
      return authDebugResponse({
        stage: "password_compare",
        userId: user.id,
        email: user.email,
      });
    }

    return unauthorized("Invalid credentials");
  }

  const platformAdmin = await getActivePlatformAdminByUserId(user.id);

  // changeTenantStatus (and its suspend/unsuspend platform-admin API routes) has always
  // updated Tenant.status, but nothing ever checked it at login -- confirmed by audit that a
  // "suspended" tenant's users could log in and use the app exactly as before. Platform admins
  // are exempt so they can still investigate/unsuspend a tenant they just locked out.
  if (!platformAdmin && (await isTenantSuspended(user.tenantId))) {
    return unauthorized("This workspace has been suspended. Contact your administrator.");
  }

  // Real, previously-live bug found while building SCIM deprovisioning: the admin Users page's
  // "Deactivate" action (and now SCIM's own deactivation path) has always set User.status to
  // "INACTIVE", but nothing here ever checked it -- a deactivated user could still log in and
  // use the app exactly as an active one. Same scope as the tenant-suspension check above:
  // checked only at login (an already-issued JWT for a user deactivated mid-session keeps
  // working until it naturally expires), and platform admins are exempt for the same
  // investigate/reactivate reason.
  if (!platformAdmin && user.status && user.status !== "ACTIVE") {
    await logLoginFailure(user, "user_deactivated", ip);
    return unauthorized("This account has been deactivated. Contact your administrator.");
  }

  // MFA (gap checklist: "MFA policy controls") -- password alone isn't enough to complete
  // login when MFA is enabled for this account, unless this exact browser was already marked
  // trusted during a prior MFA verification. No platform-admin exemption here (unlike tenant-
  // suspension/deactivation above, which exist specifically so an admin can investigate a
  // locked-out tenant) -- MFA is a personal-account security control with no equivalent
  // "investigate" rationale for bypassing it.
  if (user.mfaEnabled) {
    const trustedDeviceToken = readCookie(request, TRUSTED_DEVICE_COOKIE);
    const deviceIsTrusted = await isTrustedDevice(user.id, trustedDeviceToken);
    if (!deviceIsTrusted) {
      const mfaToken = await signMfaPendingToken(user.id);
      return NextResponse.json({ mfaRequired: true, mfaToken });
    }
  }

  // MFA required by policy/role but not yet enabled for this account -- within the grace
  // period, login still succeeds (the frontend nags the user to enroll); past it, login is
  // blocked outright until they enroll or an admin resets/adjusts the requirement.
  const mfaRequirement = user.mfaEnabled ? null : await resolveMfaRequirement(user.id, user.tenantId, user.createdAt);
  if (mfaRequirement?.required && isPastMfaGracePeriod(mfaRequirement)) {
    return unauthorized("Multi-factor authentication is required for your account and the enrollment grace period has expired. Contact your administrator.");
  }

  // Password expiry (gap checklist: "password and authentication policy controls") -- checked
  // only once every other login gate has passed (MFA included, when enabled), so an expired
  // password can't be used to bypass a second factor: this just replaces the normal session
  // with a one-time password-change token, it doesn't grant access on its own.
  if (lockoutPolicy && isPasswordExpired(user.passwordChangedAt, lockoutPolicy)) {
    const passwordChangeToken = await signPasswordChangeToken(user.id);
    return NextResponse.json({ passwordExpired: true, passwordChangeToken });
  }

  // Real UserSession row (gap checklist: "session and device management") -- see login-flow.ts.
  const { accessToken, expiresInSeconds } = await issueSessionForUser(user, {
    isPlatformAdmin: !!platformAdmin,
    platformAdminId: platformAdmin?.id ?? null,
    userAgent: request.headers.get("user-agent"),
    ipAddress: ip,
  });

  // F06 fix (WP05): the session token no longer appears in the JSON body at all -- only as the
  // HttpOnly cookie below. login/page.tsx doesn't read access_token anymore; it just
  // re-fetches /auth/me after this response, which the browser sends with the new cookie.
  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
      isPlatformAdmin: !!platformAdmin,
      platformAdminId: platformAdmin?.id ?? null,
    },
    mfaSetupRequired: !!mfaRequirement?.required,
  });

  response.cookies.set("token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresInSeconds,
  });

  return response;
}
