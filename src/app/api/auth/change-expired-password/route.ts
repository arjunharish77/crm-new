import { NextResponse } from "next/server";
import { getActivePlatformAdminByUserId, getLoginUserById, isTenantSuspended } from "@/lib/repositories/auth-admin-postgres";
import { verifyPasswordChangeToken } from "@/lib/server/auth";
import { issueSessionForUser } from "@/lib/server/login-flow";
import { changeExpiredPassword, PasswordPolicyError } from "@/lib/server/password-policy";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { clientIpFromRequest } from "@/lib/server/rate-limit";

// Completes a login that was interrupted by a policy-driven password-expiry block (see
// auth/login/route.ts and auth/mfa/verify/route.ts). The password-change token proves the
// caller already supplied a correct password (and MFA code, if enabled) during the login
// attempt that issued it, so this doesn't ask for the current password again -- it goes
// straight from "here's a new password" to a real session, same UX shape as mfa/verify's
// second step.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const passwordChangeToken = body?.passwordChangeToken;
  const newPassword = body?.newPassword;

  if (!passwordChangeToken || !newPassword) return badRequest("passwordChangeToken and newPassword are required");

  const userId = await verifyPasswordChangeToken(String(passwordChangeToken));
  if (!userId) return unauthorized("This session has expired -- please log in again");

  const user = await getLoginUserById(userId);
  if (!user) return unauthorized("Account not found");

  const platformAdmin = await getActivePlatformAdminByUserId(user.id);
  if (!platformAdmin && (await isTenantSuspended(user.tenantId))) {
    return unauthorized("This workspace has been suspended. Contact your administrator.");
  }
  if (!platformAdmin && user.status && user.status !== "ACTIVE") {
    return unauthorized("This account has been deactivated. Contact your administrator.");
  }

  try {
    await changeExpiredPassword(user, String(newPassword));
  } catch (error) {
    if (error instanceof PasswordPolicyError) return badRequest(error.errors.join(", "));
    return serverError("Failed to change password", error);
  }

  const ip = clientIpFromRequest(request);
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
