import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getLeadForTenant } from "@/lib/repositories/leads-postgres";
import { getOpportunityForTenant } from "@/lib/repositories/opportunities-postgres";
import { generateRecommendationsForRecord, listRecommendationsForRecord } from "@/lib/server/next-best-action";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Recommendation visibility rides entirely on the parent record's own permission --
// same convention as predictive scoring -- rather than a separate NBA permission check:
// if the row-scoped Lead/Opportunity fetch (OWN/TEAM/ALL) returns the record, the caller
// can see its recommendations too.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const recordType = searchParams.get("recordType");
    const recordId = searchParams.get("recordId");
    if ((recordType !== "LEAD" && recordType !== "OPPORTUNITY") || !recordId) {
      return badRequest("recordType (LEAD|OPPORTUNITY) and recordId are required");
    }

    const record = recordType === "LEAD" ? await getLeadForTenant(user, recordId) : await getOpportunityForTenant(user, recordId);
    if (!record) return forbidden("Record not found or not visible to this user");

    let recommendations = await listRecommendationsForRecord(user, recordType, recordId);
    // Lazily generate on first view rather than requiring the worker/event refresh to
    // have already run -- keeps the card from being empty for a brand-new record.
    if (recommendations.length === 0) {
      recommendations = await generateRecommendationsForRecord(user, recordType, recordId);
    }
    return NextResponse.json(recommendations);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch Next-Best-Action recommendations", error);
  }
}
