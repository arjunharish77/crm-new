import { NextResponse } from "next/server";
import { listActivityTypesForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const types = await listActivityTypesForTenant(user);
    return NextResponse.json(types);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch activity types");
  }
}
