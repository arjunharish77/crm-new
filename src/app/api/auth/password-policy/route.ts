import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { passwordRuleForForms } from "@/lib/server/password-policy";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { serverError, unauthorized } from "@/lib/server/http";

// The signed-in user's workspace password rule, as the requirements the change-password form
// lists and checks as you type. The server still enforces it on save.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const policy = await getEffectiveSecurityPolicy(user.tenantId);
    return NextResponse.json(passwordRuleForForms(policy));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to load the password rule", error);
  }
}
