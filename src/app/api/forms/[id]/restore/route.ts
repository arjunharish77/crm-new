import { NextResponse } from "next/server";
import { restoreFormForTenant } from "@/lib/server/crm";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

// Restores an archived form, with its submissions and public link (decision 31). Same access as
// deleting it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    return NextResponse.json(await restoreFormForTenant(user, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return badRequest("Forms is not enabled for this workspace");
    if (error instanceof Error && error.message === "FORM_NOT_FOUND") return notFound("No archived form with that id");
    return serverError("Failed to restore form", error);
  }
}
