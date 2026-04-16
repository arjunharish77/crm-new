import { NextResponse } from "next/server";
import { createSavedViewForTenant, listSavedViewsForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const module = searchParams.get("module") ?? "LEADS";
    const views = await listSavedViewsForTenant(user, module);
    return NextResponse.json(views);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch saved views");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.module || !body?.filters) {
      return badRequest("name, module, and filters are required");
    }
    const view = await createSavedViewForTenant(user, body);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create saved view");
  }
}
