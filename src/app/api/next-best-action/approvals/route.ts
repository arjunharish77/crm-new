import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listPendingApprovalsForManager } from "@/lib/server/next-best-action";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const approvals = await listPendingApprovalsForManager(user);
    return NextResponse.json(approvals);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch pending Next-Best-Action approvals", error);
  }
}
