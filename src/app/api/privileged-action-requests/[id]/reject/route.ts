import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { rejectPrivilegedActionRequest } from "@/lib/server/privileged-actions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.isPlatformAdmin && !user.isTenantAdmin) return forbidden();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    await rejectPrivilegedActionRequest(user, id, body?.note ?? null);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You can't reject a request outside your own tenant");
    if (error instanceof Error && error.message === "REQUEST_NOT_PENDING") return badRequest("This request is no longer pending");
    if (error instanceof Error && error.message === "CANNOT_APPROVE_OWN_REQUEST") return badRequest("You can't reject your own request");
    return serverError("Failed to reject request", error);
  }
}
