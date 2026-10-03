import { NextResponse } from "next/server";
import { restoreAutomationForTenant } from "@/lib/server/crm";
import { badRequest, forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";
import { requireInternalUser } from "@/lib/server/auth";

// Restores an archived automation as it was (decision 31). Same access as deleting it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    return NextResponse.json(await restoreAutomationForTenant(user, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return badRequest("Automations is not enabled for this workspace");
    if (error instanceof Error && error.message === "AUTOMATION_NOT_FOUND") return notFound("No archived automation with that id");
    return serverError("Failed to restore automation", error);
  }
}
