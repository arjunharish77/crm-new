import { NextResponse } from "next/server";
import { queryOneAsSystem } from "@/lib/db/query";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";
import { refreshTenantModuleHealth } from "@/lib/server/module-health";

// Platform admins: this tenant's module health, computed now (and stored as the latest snapshot).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    // Platform-admin lookup of another tenant.
    if (!(await queryOneAsSystem(`select 1 from "Tenant" where id = $1`, [id]))) return notFound("Tenant not found");
    return NextResponse.json(await refreshTenantModuleHealth(id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load module health", error);
  }
}
