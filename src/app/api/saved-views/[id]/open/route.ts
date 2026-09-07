import { NextResponse } from "next/server";
import { recordSavedViewOpened } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

// Fire-and-forget usage tracking -- called when a user actually selects a View, not on
// every render, so viewCount/lastOpenedAt reflect real usage for stale-View detection.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await recordSavedViewOpened(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to record view open", error);
  }
}
