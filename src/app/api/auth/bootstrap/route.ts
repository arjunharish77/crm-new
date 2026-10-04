import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { bootstrapPlatformAdmin } from "@/lib/server/admin";
import { badRequest, forbidden, serverError } from "@/lib/server/http";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { validatePasswordStrength } from "@/lib/server/password-policy";

// Round-2 plan S10: creating the first platform admin needs the one-time BOOTSTRAP_TOKEN from the
// server settings, so a fresh (or emptied) install can't be claimed by whoever reaches it first.
// Without the setting, setup is refused in production; local development keeps working without it.
function setupTokenAccepted(supplied: unknown) {
  const expected = process.env.BOOTSTRAP_TOKEN?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  const given = Buffer.from(typeof supplied === "string" ? supplied.trim() : "");
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!process.env.BOOTSTRAP_TOKEN?.trim() && process.env.NODE_ENV === "production") {
      return forbidden("Setup is turned off. Set BOOTSTRAP_TOKEN in the server settings to create the first platform admin.");
    }
    if (!setupTokenAccepted(body?.setupToken)) return forbidden("The setup token is not correct.");

    if (!body?.name || !body?.email || !body?.password) {
      return badRequest("Name, email, and password are required");
    }

    const policy = await getEffectiveSecurityPolicy(null);
    const strengthErrors = validatePasswordStrength(body.password, policy);
    if (strengthErrors.length) return badRequest(strengthErrors.join(", "));

    await bootstrapPlatformAdmin({ name: String(body.name), email: String(body.email), password: String(body.password) });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOTSTRAP_ALREADY_COMPLETE") {
      return badRequest("Bootstrap already completed");
    }

    return serverError("Failed to bootstrap platform admin", error);
  }
}
