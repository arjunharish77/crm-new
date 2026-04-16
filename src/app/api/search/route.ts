import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { searchTenantData } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const results = await searchTenantData(user, q);
    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to search records", error);
  }
}
