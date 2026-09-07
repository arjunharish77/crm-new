import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { applyCaseMacro } from "@/lib/repositories/case-macros-postgres";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.macroId) return badRequest("macroId is required");
    const outcome = await applyCaseMacro(user as any, id, String(body.macroId));
    if (outcome?.sent && "pendingApproval" in (outcome.sent as any) && (outcome.sent as any).pendingApproval) {
      return NextResponse.json(outcome, { status: 202 });
    }
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    if (error instanceof Error && (error.message === "CASE_MACRO_NOT_FOUND" || error.message === "CASE_MACRO_INACTIVE" || error.message === "CASE_MACRO_NOT_PERMITTED" || error.message === "CASE_NOT_FOUND")) {
      return badRequest(error.message);
    }
    return serverError("Failed to apply case macro", error);
  }
}
