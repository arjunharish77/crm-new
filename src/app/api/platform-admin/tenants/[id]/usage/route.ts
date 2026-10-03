import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getTenantUsage, setTenantUsageLimits } from "@/lib/server/usage-limits";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    return NextResponse.json(await getTenantUsage(id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load usage", error);
  }
}

// Body: { maxActiveUsers, maxPartnerLogins, maxStorageMb, maxMonthlyMessages } -- each a
// whole number, or null/"" for unlimited. Lowering a limit below current usage never removes
// anything; it only stops new usage.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Limits payload is required");
    return NextResponse.json(await setTenantUsageLimits(user, id, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "USAGE_LIMIT_INVALID") return badRequest("Each limit must be a whole number (or empty for unlimited)");
    return serverError("Failed to save limits", error);
  }
}
