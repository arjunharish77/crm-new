import type { Course } from "@/data/catalog";
import { formatFee } from "@/lib/catalog-format";
import { durationYears, type RecommenderAnswers } from "@/lib/recommender-matching";

// Find my course match percentage (UI redesign Q9a). A fixed, explainable score computed only from
// the learner's five answers and published catalog facts (level, subject, listed tuition, listed
// duration). It never reads ratings, reviews, placement, salary or package figures, does not
// predict admission and does not reorder AI-ordered results.
//
//   Subject                     35  chosen subject matches 35 · "any subject" 20
//   Degree level + qualification 25  level: chosen level 15 · "both levels" 10
//                                    qualification: confirms the entry route 10 · "prefer not to say" 5
//   Budget headroom             25  "no limit" 15 · within budget 15 + up to 10 for headroom,
//                                    full at 25% or more under the chosen ceiling
//   Your priority               15  lower tuition: 15 × lowest matching fee ÷ this fee
//                                    shorter duration: 15 × shortest matching duration ÷ this duration
//                                    balanced: half of each
export const MATCH_WEIGHTS = { subject: 35, level: 25, budget: 25, priority: 15 } as const;

export type MatchTone = "success" | "neutral" | "warning";
export type MatchPart = { key: keyof typeof MATCH_WEIGHTS; label: string; points: number; max: number };
export type MatchPill = { text: string; tone: MatchTone };
export type MatchScore = { percent: number; parts: MatchPart[]; pills: MatchPill[] };

type ScoreCourse = Pick<Course, "id" | "level" | "stream" | "fee" | "duration">;

const round1 = (value: number) => Math.round(value * 10) / 10;

export function matchScore(course: ScoreCourse, answers: RecommenderAnswers, matches: ScoreCourse[]): MatchScore {
  const pills: MatchPill[] = [];
  const pool = matches.length ? matches : [course];

  // Subject.
  let subject: number;
  if (answers.stream === "any") { subject = 20; pills.push({ text: "Any subject", tone: "neutral" }); }
  else if (course.stream === answers.stream) { subject = MATCH_WEIGHTS.subject; pills.push({ text: "Subject ✓", tone: "success" }); }
  else { subject = 0; pills.push({ text: "Different subject", tone: "warning" }); }

  // Degree level and qualification. "Not yet" only allows undergraduate programs; a completed
  // bachelor's degree is a valid route to either level. "Prefer not to say" is never a filter, so
  // the entry route stays to be confirmed.
  let level: number;
  if (answers.level === "any") level = 10;
  else if (course.level === answers.level) { level = 15; pills.push({ text: course.level === "UG" ? "Undergraduate ✓" : "Postgraduate ✓", tone: "success" }); }
  else { level = 0; pills.push({ text: "Different level", tone: "warning" }); }
  let qualification: number;
  if (answers.qualification === "unsure") { qualification = 5; pills.push({ text: "Entry route to confirm", tone: "warning" }); }
  else if (answers.qualification === "bachelors" || course.level === "UG") qualification = 10;
  else { qualification = 0; pills.push({ text: "Needs a bachelor's degree", tone: "warning" }); }

  // Budget headroom.
  let budget: number;
  if (answers.budget === "any") { budget = 15; pills.push({ text: "No budget limit set", tone: "neutral" }); }
  else {
    const ceiling = Number(answers.budget);
    const gap = ceiling - course.fee;
    if (gap < 0) { budget = 0; pills.push({ text: `${formatFee(-gap)} over budget`, tone: "warning" }); }
    else {
      budget = 15 + 10 * Math.min(1, gap / ceiling / 0.25);
      pills.push({ text: gap > 0 ? `${formatFee(gap)} under budget` : "Within budget", tone: "success" });
    }
  }

  // The learner's stated priority, relative to the other programs that passed their filters.
  const lowestFee = Math.min(...pool.map(item => item.fee));
  const feeShare = course.fee > 0 ? Math.min(1, lowestFee / course.fee) : 1;
  const years = durationYears(course.duration);
  const shortest = Math.min(...pool.map(item => durationYears(item.duration)));
  const durationShare = Number.isFinite(years) && Number.isFinite(shortest) && years > 0 ? Math.min(1, shortest / years) : 0;
  let priority: number;
  if (answers.priority === "cost") {
    priority = MATCH_WEIGHTS.priority * feeShare;
    pills.push(course.fee <= lowestFee ? { text: "Fee priority ✓", tone: "success" } : { text: `+${formatFee(course.fee - lowestFee)} vs lowest-fee match`, tone: "neutral" });
  } else if (answers.priority === "duration") {
    priority = MATCH_WEIGHTS.priority * durationShare;
    const extraMonths = Math.round((years - shortest) * 12);
    pills.push(durationShare >= 1 ? { text: "Duration priority ✓", tone: "success" } : Number.isFinite(extraMonths) ? { text: `+${extraMonths} months vs shortest match`, tone: "neutral" } : { text: "Duration not listed", tone: "warning" });
  } else {
    priority = MATCH_WEIGHTS.priority * (feeShare + durationShare) / 2;
    pills.push({ text: "Balanced fee and duration", tone: "neutral" });
  }

  const parts: MatchPart[] = [
    { key: "subject", label: "Subject", points: round1(subject), max: MATCH_WEIGHTS.subject },
    { key: "level", label: "Degree level and qualification", points: round1(level + qualification), max: MATCH_WEIGHTS.level },
    { key: "budget", label: "Budget headroom", points: round1(budget), max: MATCH_WEIGHTS.budget },
    { key: "priority", label: "Your priority", points: round1(priority), max: MATCH_WEIGHTS.priority },
  ];
  const percent = Math.max(0, Math.min(100, Math.round(parts.reduce((sum, part) => sum + part.points, 0))));
  return { percent, parts, pills };
}

// Ring colour: green at 85+, blue at 70+, otherwise the primary colour (Recommender.dc.html:145).
// Colour is decorative; the percentage and the breakdown always appear as text.
export function matchRingColor(percent: number) {
  return percent >= 85 ? "#12A35C" : percent >= 70 ? "#3B82F6" : "#5B4CF0";
}
