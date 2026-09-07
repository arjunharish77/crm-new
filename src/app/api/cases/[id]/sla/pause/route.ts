import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { pauseCaseSla } from "@/lib/repositories/cases-postgres";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const updated = await pauseCaseSla(user, id);
    if (!updated) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to pause case SLA", error);
  }
}
