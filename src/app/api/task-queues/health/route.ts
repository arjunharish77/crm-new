import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getQueueHealthForTenant } from "@/lib/server/tasks";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const health = await getQueueHealthForTenant(user);
    return NextResponse.json(health);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch queue health", error);
  }
}
