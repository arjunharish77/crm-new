import { NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/server/http";
import { getCaseSurveyForPublic, submitCaseSurveyResponse } from "@/lib/repositories/case-survey-postgres";

type Params = { params: Promise<{ id: string }> };

// Public, unauthenticated CSAT/NPS response capture (gap checklist Module 11, item 15) --
// identified by the response row's own id, the same "the id itself is the unguessable token"
// convention the existing unsubscribe-link flow already uses.
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const survey = await getCaseSurveyForPublic(id);
    if (!survey) return NextResponse.json({ message: "Survey not found" }, { status: 404 });
    return NextResponse.json(survey);
  } catch (error) {
    return serverError("Failed to load survey", error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.score !== "number") return badRequest("score is required");
    const updated = await submitCaseSurveyResponse(id, { score: body.score, comment: body.comment ?? null });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && (error.message === "CASE_SURVEY_NOT_FOUND" || error.message === "CASE_SURVEY_ALREADY_SUBMITTED" || error.message === "CASE_SURVEY_SCORE_INVALID")) {
      return badRequest(error.message);
    }
    return serverError("Failed to submit survey response", error);
  }
}
