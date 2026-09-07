import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { listImpersonationSessions, countAuditActionsDuringSession } from "@/lib/server/sessions";
import { serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const url = new URL(request.url);
    const reviewedParam = url.searchParams.get("reviewed");
    const reviewed = reviewedParam === "true" ? true : reviewedParam === "false" ? false : undefined;
    const sessions = await listImpersonationSessions({ reviewed });
    const withActionCounts = await Promise.all(
      sessions.map(async (session) => ({ ...session, actionCount: await countAuditActionsDuringSession(session) })),
    );
    return NextResponse.json(withActionCounts);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch impersonation sessions", error);
  }
}
