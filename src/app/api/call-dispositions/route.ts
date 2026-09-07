import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCallDispositionsForTenant, logCallDispositionForTenant } from "@/lib/server/dispositions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const url = new URL(request.url);
    const dispositions = await listCallDispositionsForTenant(user, {
      leadId: url.searchParams.get("leadId"),
      opportunityId: url.searchParams.get("opportunityId"),
      callLogId: url.searchParams.get("callLogId"),
    });
    return NextResponse.json(dispositions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch call dispositions", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.dispositionOutcomeId) return badRequest("dispositionOutcomeId is required");
    const created = await logCallDispositionForTenant(user, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DISPOSITION_OUTCOME_REQUIRED") return badRequest("dispositionOutcomeId is required");
    if (error instanceof Error && error.message === "DISPOSITION_OUTCOME_NOT_FOUND") return badRequest("Disposition outcome not found");
    if (error instanceof Error && error.message === "LEAD_NOT_FOUND") return badRequest("Lead not found or not accessible");
    if (error instanceof Error && error.message === "OPPORTUNITY_NOT_FOUND") return badRequest("Opportunity not found or not accessible");
    if (error instanceof Error && error.message.startsWith("DISPOSITION_FIELD_REQUIRED:")) {
      return badRequest(`This disposition requires: ${error.message.split(":")[1]}`);
    }
    return serverError("Failed to log call disposition", error);
  }
}
