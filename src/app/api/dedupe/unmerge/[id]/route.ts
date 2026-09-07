import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { unmergeForTenant } from "@/lib/server/dedupe";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const result = await unmergeForTenant(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MERGE_AUDIT_NOT_FOUND") return badRequest("Merge record not found");
    if (error instanceof Error && error.message === "ALREADY_UNMERGED") return badRequest("This merge has already been undone");
    return serverError("Failed to unmerge records", error);
  }
}
