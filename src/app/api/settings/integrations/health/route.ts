import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { getConnectorHealthForTenant } from "@/lib/server/connector-health";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const checks = await getConnectorHealthForTenant(user);
    return NextResponse.json({ checks, checkedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch connector health", error);
  }
}
