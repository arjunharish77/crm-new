import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { getMarketingAttributionSummaryReportForTenant } from "@/lib/server/inbuilt-reports";

const MODELS = ["FIRST_TOUCH", "LAST_TOUCH", "LINEAR", "U_SHAPED", "W_SHAPED", "TIME_DECAY", "CAMPAIGN_SOURCE_OVERRIDE", "CUSTOM_WEIGHTED"];

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const model = (searchParams.get("model") ?? "FIRST_TOUCH").toUpperCase();
    if (!MODELS.includes(model)) return badRequest(`model must be one of ${MODELS.join(", ")}`);
    const weightsParam = searchParams.get("weights");
    let weights: Record<string, number> | undefined;
    if (weightsParam) {
      try {
        weights = JSON.parse(weightsParam);
      } catch {
        return badRequest("weights must be valid JSON");
      }
    }
    const report = await getMarketingAttributionSummaryReportForTenant(user, model as any, weights);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch marketing attribution summary", error);
  }
}
