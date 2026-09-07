import { NextResponse } from "next/server";
import { requestSavedViewAccessForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await requestSavedViewAccessForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "SAVED_VIEW_NOT_FOUND") {
      return NextResponse.json({ message: "Saved view not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ALREADY_OWNER") return badRequest("You already own this Smart View");
    return serverError("Failed to request access", error);
  }
}
