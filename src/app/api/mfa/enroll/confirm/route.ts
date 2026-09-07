import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { confirmMfaEnrollment } from "@/lib/server/mfa";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

// Step 2: proves the user actually scanned the QR code correctly before flipping mfaEnabled
// to true. Returns the one-time-shown backup codes -- these are never retrievable again after
// this response (only bcrypt hashes are stored, see mfa.ts).
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    const token = body?.token;
    if (!token) return badRequest("token is required");

    const result = await confirmMfaEnrollment(user, String(token));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "MFA_ENROLLMENT_NOT_STARTED") return badRequest("Start enrollment first");
    if (error instanceof Error && error.message === "INVALID_MFA_CODE") return badRequest("Invalid code -- check your authenticator app and try again");
    return serverError("Failed to confirm MFA enrollment", error);
  }
}
