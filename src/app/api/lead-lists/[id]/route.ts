import { NextResponse } from "next/server";
import { getLeadListForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const list = await getLeadListForTenant(user, id);
    if (!list) return NextResponse.json({ message: "Lead list not found" }, { status: 404 });
    return NextResponse.json(list);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch lead list", error);
  }
}
