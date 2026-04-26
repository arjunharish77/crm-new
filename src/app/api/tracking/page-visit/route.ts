import { NextResponse } from "next/server";
import { ingestWebsiteVisitForTenant } from "@/lib/server/crm";
import { badRequest, serverError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.tenantId) return badRequest("tenantId is required");
    const result = await ingestWebsiteVisitForTenant(body);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to track page visit", error);
  }
}
