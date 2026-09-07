import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { startMfaEnrollment } from "@/lib/server/mfa";
import { serverError, unauthorized } from "@/lib/server/http";

// Step 1 of self-service MFA enrollment: generates a fresh secret + QR code. Safe to call
// repeatedly (e.g. the user navigates away and comes back) -- see mfa.ts, a re-call just
// overwrites the pending secret; mfaEnabled stays false until confirm/route.ts proves it.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const result = await startMfaEnrollment(user, user.email);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to start MFA enrollment", error);
  }
}
