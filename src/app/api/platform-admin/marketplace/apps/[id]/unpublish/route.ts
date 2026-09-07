import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { unpublishApp } from "@/lib/server/marketplace";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const app = await unpublishApp(user, id, body?.reason ?? null);
    return NextResponse.json(app);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MARKETPLACE_APP_NOT_PUBLISHED") return badRequest("This app is not currently published");
    return serverError("Failed to unpublish app", error);
  }
}
