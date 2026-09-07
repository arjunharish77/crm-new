import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { skipTaskOccurrenceForTenant } from "@/lib/server/tasks";
import { serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ id: string }>;
};

// Cancels this occurrence of a recurring task and immediately spawns the next one (if the
// task carries a recurrenceRule) -- distinct from Complete, which also advances recurrence
// but marks this occurrence done rather than skipped.
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const result = await skipTaskOccurrenceForTenant(user, id);
    if (!result) return NextResponse.json({ message: "Task not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to skip task occurrence", error);
  }
}
