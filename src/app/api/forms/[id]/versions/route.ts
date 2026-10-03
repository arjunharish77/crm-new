import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getFormForTenant, listFormVersionsForTenant } from "@/lib/repositories/forms-postgres";
import { formRouteError } from "@/lib/server/form-route-errors";

// Published versions of a form, newest first (decision 29).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    if (!(await getFormForTenant(user, id))) throw new Error("FORM_NOT_FOUND");
    return NextResponse.json(await listFormVersionsForTenant(user, id));
  } catch (error) {
    return formRouteError(error, "Failed to fetch versions");
  }
}
