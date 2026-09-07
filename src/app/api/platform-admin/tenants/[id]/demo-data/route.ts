import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { getDemoDataStatusForTenant } from "@/lib/repositories/demo-data-postgres";
import { serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const status = await getDemoDataStatusForTenant(id);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch demo data status", error);
  }
}
