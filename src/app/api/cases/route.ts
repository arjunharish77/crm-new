import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createCaseForTenant, listCasesForTenant } from "@/lib/repositories/cases-postgres";

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    const { searchParams } = new URL(request.url);
    const result = await listCasesForTenant(user, {
      statusId: searchParams.get("statusId"),
      priorityId: searchParams.get("priorityId"),
      queueId: searchParams.get("queueId"),
      ownerId: searchParams.get("ownerId"),
      typeId: searchParams.get("typeId"),
      q: searchParams.get("q"),
      page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch cases", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireInternalUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.subject) return badRequest("Case subject is required");
    const created = await createCaseForTenant(user, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CASE_SUBJECT_REQUIRED") return badRequest("Case subject is required");
    if (error instanceof Error && error.message === "CASE_CONFIG_MISSING") return badRequest("Case type, status, or priority configuration is missing");
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to create case", error);
  }
}
