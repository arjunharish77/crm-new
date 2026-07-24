import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { seedDashboardPresetForTenant } from "@/lib/server/crm";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const persona = body?.persona ? String(body.persona) : null;
    if (persona && !["admin", "manager", "rep", "partner"].includes(persona)) {
      return badRequest("persona must be admin, manager, rep, or partner");
    }

    const result = await seedDashboardPresetForTenant(user, persona);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to seed dashboard preset", error);
  }
}
