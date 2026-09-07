import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getCaseForTenant, updateCaseForTenant } from "@/lib/repositories/cases-postgres";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    const record = await getCaseForTenant(user, id);
    if (!record) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch case", error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const updated = await updateCaseForTenant(user, id, body);
    if (!updated) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CASE_STATUS_NOT_FOUND") return NextResponse.json({ message: "Case status not found" }, { status: 400 });
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to update case", error);
  }
}
