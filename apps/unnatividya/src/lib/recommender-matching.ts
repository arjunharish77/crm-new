import type { Course } from "@/data/catalog";

export type RecommenderAnswers = {
  level: "UG" | "PG" | "any";
  qualification: "school" | "bachelors" | "unsure";
  stream: "Management" | "IT & Computers" | "Commerce" | "Arts & Humanities" | "any";
  budget: "100000" | "180000" | "any";
  priority: "cost" | "duration" | "balanced";
};

export function durationYears(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(years?|months?)/i);
  return match ? Number(match[1]) / (match[2].toLowerCase().startsWith("month") ? 12 : 1) : Number.POSITIVE_INFINITY;
}

// These are hard exclusions. Qualification only excludes PG when the learner says
// they have not completed a bachelor's degree; it never certifies UG/PG eligibility.
export function matchingCourses(courses: Course[], answers: RecommenderAnswers) {
  return courses.filter(course =>
    (answers.level === "any" || course.level === answers.level) &&
    (answers.qualification !== "school" || course.level === "UG") &&
    (answers.stream === "any" || course.stream === answers.stream) &&
    (answers.budget === "any" || course.fee <= Number(answers.budget)));
}

export function sortMatches(courses: Course[], priority: RecommenderAnswers["priority"]) {
  return [...courses].sort((a, b) => priority === "duration"
    ? durationYears(a.duration) - durationYears(b.duration) || a.fee - b.fee || a.id.localeCompare(b.id)
    : a.fee - b.fee || durationYears(a.duration) - durationYears(b.duration) || a.id.localeCompare(b.id));
}

export type ReasonKey = "level" | "subject" | "budget" | "lower_tuition" | "shorter_duration" | "catalog_option";

export function allowedReasons(course: Course, matches: Course[], answers: RecommenderAnswers): ReasonKey[] {
  const reasons: ReasonKey[] = ["catalog_option"];
  if (answers.level !== "any") reasons.push("level");
  if (answers.stream !== "any") reasons.push("subject");
  if (answers.budget !== "any") reasons.push("budget");
  const lowest = Math.min(...matches.map(item => item.fee));
  if (course.fee === lowest) reasons.push("lower_tuition");
  const shortest = Math.min(...matches.map(item => durationYears(item.duration)));
  if (answers.priority === "duration" && durationYears(course.duration) === shortest && Number.isFinite(shortest)) reasons.push("shorter_duration");
  return reasons;
}

export function reasonText(key: ReasonKey, course: Course, answers: RecommenderAnswers) {
  switch (key) {
    case "level": return `Matches your ${answers.level === "UG" ? "undergraduate" : "postgraduate"} level choice.`;
    case "subject": return `Matches your ${course.stream.toLowerCase()} subject choice.`;
    case "budget": return "Its listed total tuition is within your selected budget.";
    case "lower_tuition": return "It has the lowest listed tuition among these matching programs.";
    case "shorter_duration": return "It has the shortest listed duration among these matching programs.";
    case "catalog_option": return "It fits the filters you selected; check the course page for eligibility.";
  }
}
