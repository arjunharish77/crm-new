import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { listSecurityPolicies } from "@/lib/server/security-policy";
import { serverError, unauthorized, forbidden } from "@/lib/server/http";

// The route the (previously completely dead) admin/security settings page has always called --
// see migration 0076's comment for the full audit of how long this was a stub.
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const policies = await listSecurityPolicies();
    return NextResponse.json(policies);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch security policies", error);
  }
}
