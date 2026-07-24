import { NextResponse } from "next/server";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  executeReportQueryForTenant,
  getReportQueryCatalog,
  type ReportQueryDefinition,
} from "@/lib/server/reporting-query";

export async function GET(request: Request) {
  try {
    await requireCurrentUser(request);
    return NextResponse.json({ objects: getReportQueryCatalog() });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch report query catalog");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);

    if (!body?.root || !Array.isArray(body?.fields)) {
      return badRequest("root and fields are required");
    }

    const result = await executeReportQueryForTenant(user, body as ReportQueryDefinition);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && /Unsupported|required|definition/i.test(error.message)) {
      return badRequest(error.message);
    }
    return serverError("Failed to execute report query", error);
  }
}
