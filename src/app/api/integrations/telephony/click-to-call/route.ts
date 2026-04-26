import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { buildClickToCallPayloadForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.phoneNumber && !body?.toNumber) return badRequest("Phone number is required");
    const payload = await buildClickToCallPayloadForTenant(user, body);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to build click-to-call payload", error);
  }
}
