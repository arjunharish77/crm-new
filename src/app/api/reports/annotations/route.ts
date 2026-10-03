import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { createAnnotationForTenant, listAnnotationsForTenant } from "@/lib/server/report-annotations";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const annotations = await listAnnotationsForTenant(user, searchParams.get("from"), searchParams.get("to"));
    return NextResponse.json(annotations);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch report annotations", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (!body?.label || !body?.category || !body?.occurredAt) return badRequest("label, category, and occurredAt are required");
    const annotation = await createAnnotationForTenant(user, body);
    return NextResponse.json(annotation);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    return serverError("Failed to create report annotation", error);
  }
}
