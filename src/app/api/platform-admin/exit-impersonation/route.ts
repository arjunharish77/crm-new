import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getCurrentUserById } from "@/lib/repositories/auth-admin-postgres";
import { issueSessionForUser } from "@/lib/server/login-flow";
import { revokeSession } from "@/lib/server/sessions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// F06 fix (WP05): replaces the previous client-side "stop impersonation" mechanism, which
// stashed the platform admin's own raw session token in sessionStorage and reapplied it
// directly -- a session token sitting in sessionStorage is exactly as XSS-exposed as one in a
// JS-readable cookie, and the token itself was never actually invalidated, just reused. This
// issues the admin a genuinely NEW session (via the same issueSessionForUser flow login uses)
// server-side, using the impersonation session's own `impersonatedBy` reference to know who to
// return to, and revokes the impersonation session so it can't be reused afterward.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.isImpersonating || !user.impersonatedBy) {
      return badRequest("Not currently impersonating");
    }

    const admin = await getCurrentUserById(user.impersonatedBy);
    if (!admin) return forbidden("The original admin account no longer exists");

    const { accessToken, expiresInSeconds } = await issueSessionForUser(admin, {
      isPlatformAdmin: admin.isPlatformAdmin,
      platformAdminId: admin.platformAdminId,
      userAgent: request.headers.get("user-agent"),
      ipAddress: null,
    });

    if (user.sessionId) {
      await revokeSession(user.id, user.sessionId, admin.id, "IMPERSONATION_EXIT").catch(() => undefined);
    }

    const response = NextResponse.json({
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        tenantId: admin.tenantId,
        roleId: admin.roleId,
        isPlatformAdmin: admin.isPlatformAdmin,
        platformAdminId: admin.platformAdminId,
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
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to exit impersonation", error);
  }
}
