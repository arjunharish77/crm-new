import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getBestCallScriptForRecord } from "@/lib/server/call-scripts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const url = new URL(request.url);
    const recordType = url.searchParams.get("recordType");
    const recordId = url.searchParams.get("recordId");
    if ((recordType !== "LEAD" && recordType !== "OPPORTUNITY") || !recordId) {
      return badRequest("recordType (LEAD or OPPORTUNITY) and recordId are required");
    }
    const result = await getBestCallScriptForRecord(user, recordType, recordId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "RECORD_NOT_FOUND") return badRequest("Record not found or not accessible");
    return serverError("Failed to fetch call script", error);
  }
}
