import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listGamificationPointsLedgerForUser } from "@/lib/server/gamification";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const ledger = await listGamificationPointsLedgerForUser(user, user.id);
    const balance = ledger.reduce((sum: number, entry: any) => sum + entry.points, 0);
    return NextResponse.json({ ledger, balance });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch points", error);
  }
}
