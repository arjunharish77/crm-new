import { NextResponse } from "next/server";
import { toggleNotePinForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const note = await toggleNotePinForTenant(user, id);
    return NextResponse.json(note);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to toggle note pin");
  }
}
