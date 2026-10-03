import { NextResponse } from "next/server";
import { badRequest, requestTimeout, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import {
  executeReportQueryForTenant,
  getReportQueryCatalog,
  type ReportQueryDefinition,
} from "@/lib/server/reporting-query";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
    return NextResponse.json({ objects: getReportQueryCatalog() });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch report query catalog", error);
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
    if (error instanceof Error && error.message === "REPORT_SOURCE_VIEW_NOT_FOUND") return badRequest("The Smart View this report draws from was deleted or archived. Choose another record source.");
    if (error instanceof Error && error.message === "REPORT_SOURCE_VIEW_UNSUPPORTED") {
      return badRequest(`The Smart View this report draws from uses ${(error as any).field === "OR" ? "\"match any\" filters" : `a filter (${(error as any).field})`} a report can't apply. Choose "All permitted records" or another view.`);
    }
    if (error instanceof Error && /Unsupported|required|definition/i.test(error.message)) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    if (error instanceof Error && error.message === "REPORT_QUERY_TIMEOUT") {
      return requestTimeout("This report query took too long to run -- try narrowing the fields or filters");
    }
    return serverError("Failed to execute report query", error);
  }
}
