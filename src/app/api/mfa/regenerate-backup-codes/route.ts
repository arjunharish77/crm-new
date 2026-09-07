import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { regenerateBackupCodes } from "@/lib/server/mfa";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

// Invalidates all prior backup codes and issues a fresh set of 10 -- requires a live TOTP code
// for the same reason disable does (a session alone shouldn't be able to mint a fresh set of
// account-recovery codes).
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    const token = body?.token;
    if (!token) return badRequest("token is required");

    const result = await regenerateBackupCodes(user, String(token));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "MFA_NOT_ENABLED") return badRequest("MFA is not enabled on this account");
    if (error instanceof Error && error.message === "INVALID_MFA_CODE") return badRequest("Invalid code");
    return serverError("Failed to regenerate backup codes", error);
  }
}
