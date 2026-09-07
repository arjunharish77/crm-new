import { NextResponse } from "next/server";
import { getSavedViewSummaryForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

// Access-independent by design: returns just enough (name + owner) to render a "you don't
// have access" prompt for a deep-linked View, without exposing its config/data to a user who
// isn't authorized to see it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const summary = await getSavedViewSummaryForTenant(user, id);
    if (!summary) return NextResponse.json({ message: "Saved view not found" }, { status: 404 });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch saved view summary", error);
  }
}
