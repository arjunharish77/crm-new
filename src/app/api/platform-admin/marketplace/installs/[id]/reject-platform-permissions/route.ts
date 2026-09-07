import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { rejectPlatformWritePermissions } from "@/lib/server/marketplace";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.tenantId || typeof body.tenantId !== "string") return badRequest("tenantId is required");
    const result = await rejectPlatformWritePermissions(user, body.tenantId, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "NO_PENDING_PLATFORM_PERMISSION_CHANGE") {
      return badRequest("There is no pending write-permission change for this app");
    }
    return serverError("Failed to reject platform permission change", error);
  }
}
