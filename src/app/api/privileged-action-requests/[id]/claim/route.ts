import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { claimApprovedImpersonation } from "@/lib/server/privileged-actions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Only ever meaningful for an IMPERSONATION_START request the caller themselves requested and
// someone else has since approved -- see privileged-actions.ts for why impersonation can't just
// execute at approval time the way the other 3 action types do.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const result = await claimApprovedImpersonation(user, id);
    // F06 fix (WP05): same reasoning as /api/platform-admin/impersonate -- the session token is
    // set as an HttpOnly cookie server-side rather than handed to the client in the JSON body.
    const response = NextResponse.json({ user: result.user });
    response.cookies.set("token", result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: result.expiresInSeconds,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("This isn't your request to claim");
    if (error instanceof Error && error.message === "REQUEST_NOT_APPROVED") return badRequest("This request hasn't been approved yet");
    return serverError("Failed to start impersonation", error);
  }
}
