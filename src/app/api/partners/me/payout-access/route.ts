import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { canCurrentUserAccessPayoutModule } from "@/lib/server/payouts";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const canAccess = await canCurrentUserAccessPayoutModule(user);
    return NextResponse.json({ canAccess });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to check payout access", error);
  }
}
