import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { disableMfa } from "@/lib/server/mfa";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

// Self-service disable -- requires a live TOTP code or a backup code, not just the current
// session, so a hijacked-but-not-fully-compromised session can't silently strip MFA off an
// account. (Lost your phone AND your backup codes? That's the admin-reset flow instead.)
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    const token = body?.token;
    if (!token) return badRequest("token is required");

    await disableMfa(user, String(token));
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "MFA_NOT_ENABLED") return badRequest("MFA is not enabled on this account");
    if (error instanceof Error && error.message === "INVALID_MFA_CODE") return badRequest("Invalid code");
    return serverError("Failed to disable MFA", error);
  }
}
