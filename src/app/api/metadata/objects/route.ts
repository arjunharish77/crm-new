import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listObjectDefinitionsForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const objects = await listObjectDefinitionsForTenant(user);
    return NextResponse.json(objects);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch metadata objects");
  }
}
