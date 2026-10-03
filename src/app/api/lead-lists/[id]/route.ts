import { NextResponse } from "next/server";
import { getLeadListPageForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    // One page of the list's leads, searched on the server (?page, ?limit up to 100, ?q).
    const url = new URL(request.url);
    const list = await getLeadListPageForTenant(user, id, {
      page: Number(url.searchParams.get("page") ?? 1),
      limit: Number(url.searchParams.get("limit") ?? 25),
      search: url.searchParams.get("q"),
    });
    if (!list) return NextResponse.json({ message: "Lead list not found" }, { status: 404 });
    return NextResponse.json(list);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch lead list", error);
  }
}
