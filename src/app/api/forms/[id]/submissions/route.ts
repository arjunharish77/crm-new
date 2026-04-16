import { NextResponse } from "next/server";
import { getFormSubmissionsForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "20");
    const offset = Number(searchParams.get("offset") ?? "0");
    const submissions = await getFormSubmissionsForTenant(user, id, limit, offset);
    return NextResponse.json(submissions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch submissions");
  }
}
