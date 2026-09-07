import { NextResponse } from "next/server";
import { bootstrapPlatformAdmin } from "@/lib/server/admin";
import { badRequest, serverError } from "@/lib/server/http";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { validatePasswordStrength } from "@/lib/server/password-policy";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body?.name || !body?.email || !body?.password) {
      return badRequest("Name, email, and password are required");
    }

    const policy = await getEffectiveSecurityPolicy(null);
    const strengthErrors = validatePasswordStrength(body.password, policy);
    if (strengthErrors.length) return badRequest(strengthErrors.join(", "));

    await bootstrapPlatformAdmin(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOTSTRAP_ALREADY_COMPLETE") {
      return badRequest("Bootstrap already completed");
    }

    return serverError("Failed to bootstrap platform admin");
  }
}
