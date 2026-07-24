import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { getLeaderboard } from "@/lib/server/leaderboard";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    // Internal-only: partners must not see other partners, and a ranked leaderboard
    // with names is exactly that (see src/lib/server/leaderboard.ts).
    const user = await requireInternalUser(request);
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "TEAM" ? "TEAM" : "INDIVIDUAL";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const leaderboard = await getLeaderboard(user, { from, to, scope });
    return NextResponse.json(leaderboard);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch leaderboard", error);
  }
}
