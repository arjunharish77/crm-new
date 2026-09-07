import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { seedDemoDataForTenant } from "@/lib/repositories/demo-data-postgres";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const result = await seedDemoDataForTenant(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "TENANT_HAS_NO_USERS") return badRequest("This tenant has no users yet -- create at least one user before seeding demo data.");
    return serverError("Failed to seed demo data", error);
  }
}
