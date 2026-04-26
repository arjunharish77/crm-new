import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listAvailableFormsForPlacement } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const placement = searchParams.get("placement") ?? "LEAD_DETAIL";
    const forms = await listAvailableFormsForPlacement(user, placement);
    return NextResponse.json(forms);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch available forms", error);
  }
}
