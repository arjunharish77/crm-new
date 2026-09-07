import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { dismissDedupeMatchForTenant } from "@/lib/server/dedupe";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const match = await dismissDedupeMatchForTenant(user, id);
    return NextResponse.json(match);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "DEDUPE_MATCH_NOT_PENDING") return badRequest("This match is no longer pending review");
    return serverError("Failed to dismiss dedupe match", error);
  }
}
