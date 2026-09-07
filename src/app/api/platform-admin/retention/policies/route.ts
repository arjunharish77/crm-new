import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { listDataRetentionPoliciesForPlatformAdmin } from "@/lib/server/retention";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const policies = await listDataRetentionPoliciesForPlatformAdmin();
    return NextResponse.json(policies);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch retention policies", error);
  }
}
