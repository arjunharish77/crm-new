import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { validOrigin } from "@/lib/lead-capture";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { recommenderAnswersSchema } from "@/lib/recommender-input";
import { matchingCourses, type RecommenderAnswers } from "@/lib/recommender-matching";
import { answerFollowup, classifyWithGroq, hasPersonalDetails, inferFollowup, intents, OUT_OF_SCOPE } from "@/lib/recommender-followup";

export const runtime = "nodejs";

const schema = z.object({
  answers: recommenderAnswersSchema,
  courseIds: z.array(z.string().min(1).max(80)).min(1).max(3),
  question: z.string().trim().min(2).max(300),
  previous: z.object({ intent: z.enum(intents), focusCourseId: z.string().nullable() }).strict().optional(),
}).strict();

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers });
  if (!checkRateLimit("recommender-followup-ip", clientIp(request), 12, 10 * 60_000).allowed)
    return NextResponse.json({ error: "Too many questions. Try again in a few minutes." }, { status: 429, headers });
  const raw = await request.text().catch(() => "");
  if (raw.length > 1600) return NextResponse.json({ error: "Question is too long." }, { status: 400, headers });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid question." }, { status: 400, headers }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid question or shortlist." }, { status: 400, headers });
  const { answers, courseIds, question, previous } = parsed.data;
  if (new Set(courseIds).size !== courseIds.length || (previous?.focusCourseId && !courseIds.includes(previous.focusCourseId)))
    return NextResponse.json({ error: "Invalid shortlist." }, { status: 400, headers });
  const catalog = await getPublishedCatalog();
  const allowed = new Map(matchingCourses(catalog.courses, answers as RecommenderAnswers).map(course => [course.id, course]));
  if (courseIds.some(id => !allowed.has(id))) return NextResponse.json({ error: "Shortlist changed. Start the recommender again." }, { status: 400, headers });
  if (hasPersonalDetails(question)) return NextResponse.json({ answer: "Please do not enter contact details here. Use Apply now if you want the team to contact you.", sources: [], context: previous || null, mode: "standard" }, { headers });

  const courses = courseIds.map(id => catalog.courseWithUniversity(allowed.get(id)!));
  const inferred = inferFollowup(question, courseIds, previous);
  if (!inferred) return NextResponse.json({ answer: OUT_OF_SCOPE, sources: [], context: previous || null, mode: "standard" }, { headers });

  let context = inferred;
  let mode: "ai" | "standard" = "standard";
  if (process.env.GROQ_API_KEY?.trim() && process.env.GROQ_MODEL?.trim()
    && checkRateLimit("recommender-groq-minute", "all", 10, 60_000).allowed
    && checkRateLimit("recommender-groq-day", "all", 250, 24 * 60 * 60_000).allowed) {
    const decision = await classifyWithGroq(question, courses, previous, { apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL });
    if (decision.valid && !decision.context) return NextResponse.json({ answer: OUT_OF_SCOPE, sources: [], context: previous || null, mode: "ai" }, { headers });
    if (decision.valid && decision.context) { context = decision.context; mode = "ai"; }
  }
  const result = answerFollowup(context, courses);
  return NextResponse.json({ ...result, context, mode }, { headers });
}
