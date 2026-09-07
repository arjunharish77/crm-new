import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { previewImportForTenant } from "@/lib/server/crm";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.module || !Array.isArray(body?.rows)) return badRequest("Module and rows are required");
    const preview = await previewImportForTenant(user, body);
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to preview import", error);
  }
}
