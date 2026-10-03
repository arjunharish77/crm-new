import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { restoreFormVersionAsDraftForTenant } from "@/lib/repositories/forms-postgres";
import { formRouteError } from "@/lib/server/form-route-errors";
import { badRequest } from "@/lib/server/http";

// Loads a published version into the draft; publishing it makes it public again (decision 29).
export async function POST(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id, version } = await params;
    const number = Number(version);
    if (!Number.isInteger(number) || number < 1) return badRequest("Invalid version");
    return NextResponse.json(await restoreFormVersionAsDraftForTenant(user, id, number));
  } catch (error) {
    return formRouteError(error, "Failed to restore version");
  }
}
