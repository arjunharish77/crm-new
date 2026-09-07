import { NextResponse } from "next/server";
import { getActivePlatformAdminByUserId, getLoginUserById, isTenantSuspended } from "@/lib/repositories/auth-admin-postgres";
import { verifyMfaPendingToken, signPasswordChangeToken } from "@/lib/server/auth";
import { issueSessionForUser } from "@/lib/server/login-flow";
import { verifyMfaLoginCode, createTrustedDevice } from "@/lib/server/mfa";
import { badRequest, tooManyRequests, unauthorized } from "@/lib/server/http";
import { checkRateLimit, clientIpFromRequest } from "@/lib/server/rate-limit";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { isPasswordExpired } from "@/lib/server/password-policy";

const TRUSTED_DEVICE_COOKIE = "mfa_trusted_device";

// The second step of a login for an MFA-enabled account -- see auth/login/route.ts, which
// issues the short-lived mfaToken this route consumes instead of a real session token.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const mfaToken = body?.mfaToken;
  const code = body?.code;
  const rememberDevice = !!body?.rememberDevice;

  if (!mfaToken || !code) return badRequest("mfaToken and code are required");

  const userId = await verifyMfaPendingToken(String(mfaToken));
  if (!userId) return unauthorized("This MFA session has expired -- please log in again");

  // Per-user attempt throttle, independent of the main login lockout (which only tracks
  // password failures) -- a 6-digit TOTP code is far more brute-forceable in principle than a
  // real password, so this gets its own tight ceiling.
  const throttle = await checkRateLimit({ key: `mfa-verify:user:${userId}`, limit: 10, windowSeconds: 15 * 60 });
  if (!throttle.allowed) {
    return tooManyRequests(`Too many MFA attempts. Try again in ${Math.ceil(throttle.resetSeconds / 60)} minute(s).`, throttle.resetSeconds);
  }

  const user = await getLoginUserById(userId);
  if (!user) return unauthorized("Account not found");

  const platformAdmin = await getActivePlatformAdminByUserId(user.id);
  if (!platformAdmin && (await isTenantSuspended(user.tenantId))) {
    return unauthorized("This workspace has been suspended. Contact your administrator.");
  }
  if (!platformAdmin && user.status && user.status !== "ACTIVE") {
    return unauthorized("This account has been deactivated. Contact your administrator.");
  }

  const verification = await verifyMfaLoginCode(user, String(code));
  if (!verification.valid) return unauthorized("Invalid or expired code");

  // Same password-expiry gate as the plain login path (auth/login/route.ts) -- placed after
  // MFA is verified here too, so an expired password never lets a real session issue without
  // the second factor also having been proven first.
  const policy = await getEffectiveSecurityPolicy(user.tenantId);
  if (isPasswordExpired(user.passwordChangedAt, policy)) {
    const passwordChangeToken = await signPasswordChangeToken(user.id);
    return NextResponse.json({ passwordExpired: true, passwordChangeToken });
  }

  const ip = clientIpFromRequest(request);
  const { accessToken, expiresInSeconds } = await issueSessionForUser(user, {
    isPlatformAdmin: !!platformAdmin,
    platformAdminId: platformAdmin?.id ?? null,
    userAgent: request.headers.get("user-agent"),
    ipAddress: ip,
  });

  const response = NextResponse.json({
    access_token: accessToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
      isPlatformAdmin: !!platformAdmin,
      platformAdminId: platformAdmin?.id ?? null,
    },
    usedBackupCode: verification.usedBackupCode,
  });

  response.cookies.set("token", accessToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresInSeconds,
  });

  if (rememberDevice) {
    const trustedDevice = await createTrustedDevice(user, request.headers.get("user-agent"), ip);
    response.cookies.set(TRUSTED_DEVICE_COOKIE, trustedDevice.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: trustedDevice.expiresInSeconds,
    });
  }

  return response;
}
