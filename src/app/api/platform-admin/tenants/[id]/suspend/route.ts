import { NextResponse } from "next/server";
import { changeTenantStatus } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    await changeTenantStatus(id, "SUSPENDED");
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to suspend tenant");
  }
}
