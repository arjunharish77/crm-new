import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { resetDemoDataForTenant } from "@/lib/repositories/demo-data-postgres";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const result = await resetDemoDataForTenant(id);
    if (!result.ok) return badRequest(result.reason);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to reset demo data", error);
  }
}
