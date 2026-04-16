import { NextResponse } from "next/server";
import { getTenantConfigForPlatformAdmin } from "@/lib/server/admin";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { requirePlatformAdmin } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const config = await getTenantConfigForPlatformAdmin(id);
    return NextResponse.json(config);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch tenant config");
  }
}
