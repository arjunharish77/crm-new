// Wave 5 B3: the weekly study-time planner. It uses only the learner's own numbers and never states
// how many hours a university expects; the learner is told to ask the university for that.

export const HOURS_IN_WEEK = 168;
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export const COMMITMENTS = [
  { id: "work", label: "Work", help: "Hours at work in a typical week, including overtime." },
  { id: "travel", label: "Travel", help: "Commuting and other regular travel." },
  { id: "sleep", label: "Sleep", help: "Hours of sleep in the whole week." },
  { id: "family", label: "Family and home", help: "Childcare, cooking, chores and caring for others." },
  { id: "other", label: "Everything else", help: "Meals, exercise, worship, social time and anything regular." },
] as const;

export type CommitmentId = (typeof COMMITMENTS)[number]["id"];
export type PlannerInput = { commitments: Partial<Record<CommitmentId, string>>; target: string; days: Partial<Record<(typeof DAYS)[number], string>> };

// "" counts as not entered; anything else must be a number of hours from 0 to max.
export function parseHours(value: string | undefined, max: number): number | null | "invalid" {
  if (value === undefined || value.trim() === "") return null;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > max) return "invalid";
  return Math.round(hours * 10) / 10;
}

export function planWeek(input: PlannerInput) {
  const errors: string[] = [];
  const committed = COMMITMENTS.reduce((sum, item) => {
    const hours = parseHours(input.commitments[item.id], HOURS_IN_WEEK);
    if (hours === "invalid") { errors.push(`${item.label}: enter hours from 0 to ${HOURS_IN_WEEK}.`); return sum; }
    return sum + (hours ?? 0);
  }, 0);
  const entered = COMMITMENTS.filter(item => parseHours(input.commitments[item.id], HOURS_IN_WEEK) !== null).length;
  const sleepEntered = parseHours(input.commitments.sleep, HOURS_IN_WEEK) !== null;
  if (committed > HOURS_IN_WEEK) errors.push(`Your commitments add up to ${committed} hours, more than the ${HOURS_IN_WEEK} hours in a week.`);
  const target = parseHours(input.target, HOURS_IN_WEEK);
  if (target === "invalid") errors.push(`Study goal: enter hours from 0 to ${HOURS_IN_WEEK}.`);
  const dayHours = DAYS.map(day => {
    const hours = parseHours(input.days[day], 24);
    if (hours === "invalid") errors.push(`${day}: enter hours from 0 to 24.`);
    return { day, hours: typeof hours === "number" ? hours : 0 };
  });
  const planned = Math.round(dayHours.reduce((sum, item) => sum + item.hours, 0) * 10) / 10;
  const free = Math.round((HOURS_IN_WEEK - committed) * 10) / 10;
  return {
    errors,
    ready: sleepEntered && entered >= 2 && !errors.length,
    committed: Math.round(committed * 10) / 10,
    free,
    target: typeof target === "number" ? target : null,
    planned,
    dayHours,
    leftAfterStudy: Math.round((free - planned) * 10) / 10,
    targetGap: typeof target === "number" ? Math.round((target - planned) * 10) / 10 : null,
  };
}

export function formatHours(hours: number) {
  const value = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${value} ${hours === 1 ? "hour" : "hours"}`;
}
