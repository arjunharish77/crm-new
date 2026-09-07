import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { getTenantModuleEntitlements } from "@/lib/server/module-entitlements";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const modules = await getTenantModuleEntitlements(id);
    return NextResponse.json(modules);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch tenant module entitlements", error);
  }
}
