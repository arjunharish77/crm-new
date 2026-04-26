import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createTelephonyCallLogForTenant, listTelephonyCallLogsForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const logs = await listTelephonyCallLogsForTenant(user, Number(searchParams.get("limit") ?? "100"));
    return NextResponse.json(logs);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch call logs", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.fromNumber && !body?.toNumber) return badRequest("At least one phone number is required");
    const log = await createTelephonyCallLogForTenant(user, body);
    return NextResponse.json(log);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create call log", error);
  }
}
