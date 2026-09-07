import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { setAppTrustLevel } from "@/lib/server/marketplace";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const app = await setAppTrustLevel(user, id, body?.trustLevel);
    return NextResponse.json(app);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "INVALID_TRUST_LEVEL") return badRequest("Invalid trust level");
    if (error instanceof Error && error.message === "MARKETPLACE_APP_NOT_FOUND") return badRequest("App not found");
    return serverError("Failed to set trust level", error);
  }
}
