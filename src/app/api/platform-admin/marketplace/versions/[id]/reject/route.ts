import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { rejectAppVersion } from "@/lib/server/marketplace";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await rejectAppVersion(user, id, body?.reason ?? null);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "APP_VERSION_NOT_PENDING") return badRequest("This version is no longer pending review");
    return serverError("Failed to reject app version", error);
  }
}
