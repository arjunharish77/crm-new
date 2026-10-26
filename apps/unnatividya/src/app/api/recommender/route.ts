import { NextResponse } from "next/server";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import { validOrigin } from "@/lib/lead-capture";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { rankWithGroq } from "@/lib/groq-recommender";
import { allowedReasons, matchingCourses, reasonText, sortMatches, type ReasonKey, type RecommenderAnswers } from "@/lib/recommender-matching";
import { publicSourceUrls, sourceHost } from "@/lib/source-checks";
import { recommenderAnswersSchema } from "@/lib/recommender-input";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!checkRateLimit("recommender-ip", clientIp(request), 8, 10 * 60_000).allowed)
    return NextResponse.json({ error: "Too many requests. Use the course filters or try again later." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  const raw = await request.text().catch(() => "");
  if (raw.length > 1000) return NextResponse.json({ error: "Invalid answers." }, { status: 400 });
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid answers." }, { status: 400 }); }
  const parsed = recommenderAnswersSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Choose an answer for each question." }, { status: 400 });
  const answers: RecommenderAnswers = parsed.data;
  const catalog = await getPublishedCatalog();
  const matches = sortMatches(matchingCourses(catalog.courses, answers), answers.priority);
  const candidates = matches.slice(0, 12).map(course => ({ ...course, universityName: catalog.universityById[course.universityId].name }));

  let mode: "ai" | "standard" = "standard";
  let reason: "unconfigured" | "limited" | "provider" | "invalid_output" | "no_matches" | undefined;
  let picks: Array<{ courseId: string; reasonKeys: ReasonKey[] }> = candidates.slice(0, 3).map(course => {
    const permitted = allowedReasons(course, matches, answers);
    const first = answers.priority === "duration" && permitted.includes("shorter_duration") ? "shorter_duration"
      : answers.priority !== "duration" && permitted.includes("lower_tuition") ? "lower_tuition"
      : permitted.includes("budget") ? "budget" : permitted.includes("subject") ? "subject" : permitted.includes("level") ? "level" : "catalog_option";
    return { courseId: course.id, reasonKeys: [first] };
  });
  if (!candidates.length) reason = "no_matches";
  else if (!process.env.GROQ_API_KEY?.trim() || !process.env.GROQ_MODEL?.trim()) reason = "unconfigured";
  else if (!checkRateLimit("recommender-groq-minute", "all", 10, 60_000).allowed ||
           !checkRateLimit("recommender-groq-day", "all", 250, 24 * 60 * 60_000).allowed) reason = "limited";
  else {
    const result = await rankWithGroq(candidates, matches, answers, { apiKey: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL });
    if (result.ok) { picks = result.picks; mode = "ai"; }
    else reason = result.reason;
  }

  const suggestions = picks.map(pick => {
    const course = catalog.courseWithUniversity(matches.find(item => item.id === pick.courseId)!);
    const sourceUrl = publicSourceUrls(course.sourceUrls)[0] || null;
    return {
      courseId: course.id,
      reasons: pick.reasonKeys.map(key => reasonText(key, course, answers)),
      source: sourceUrl ? { url: sourceUrl, label: sourceHost(sourceUrl) } : null,
    };
  });
  return NextResponse.json({ mode, reason, matchCount: matches.length, suggestions }, { headers: { "Cache-Control": "no-store" } });
}
