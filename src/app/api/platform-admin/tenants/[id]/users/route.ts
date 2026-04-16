import { NextResponse } from "next/server";
import { getTenantUsersForPlatformAdmin } from "@/lib/server/admin";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { requirePlatformAdmin } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const users = await getTenantUsersForPlatformAdmin(id);
    return NextResponse.json(users);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch tenant users");
  }
}
