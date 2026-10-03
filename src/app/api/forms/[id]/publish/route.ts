import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { publishFormForTenant } from "@/lib/repositories/forms-postgres";
import { formRouteError } from "@/lib/server/form-route-errors";

// Publishes the draft as the next version: the public form changes now (decision 29).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const notes = typeof body?.notes === "string" ? body.notes.slice(0, 1000) : null;
    return NextResponse.json(await publishFormForTenant(user, id, notes));
  } catch (error) {
    return formRouteError(error, "Failed to publish form");
  }
}
