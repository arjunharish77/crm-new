import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { countRemainingBackupCodes } from "@/lib/server/mfa";
import { serverError, unauthorized } from "@/lib/server/http";

// Drives the settings-page MFA card: whether it's enabled, and how many backup codes are left
// (so the UI can nudge "regenerate" once the user is down to a couple).
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const remainingBackupCodes = user.mfaEnabled ? await countRemainingBackupCodes(user.id) : 0;
    return NextResponse.json({ mfaEnabled: !!user.mfaEnabled, remainingBackupCodes });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch MFA status", error);
  }
}
