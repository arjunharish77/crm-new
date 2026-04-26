import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getAgentPopupContextForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const phoneNumber = searchParams.get("phoneNumber");
    if (!phoneNumber) return badRequest("phoneNumber is required");
    const context = await getAgentPopupContextForTenant(user, { phoneNumber });
    return NextResponse.json(context);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch agent popup context", error);
  }
}
