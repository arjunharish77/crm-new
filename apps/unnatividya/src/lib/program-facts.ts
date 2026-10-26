import type { Recognition } from "@/data/catalog";
import { formatCheckedDate } from "@/lib/source-checks";

// Per-program facts only (next-phase plan T2, owner decision 5). The old catalog sync filled
// every course with the same template values (credits, "2% off", weekly hours, a UGC-entitled
// overview). Those values are still in the CMS records, so the pages filter them here: a value
// shows only when it is specific to the program, otherwise the learner is told to confirm it.

export const CONFIRM_WITH_UNIVERSITY = "Confirm with the university";

// Recognition for 2026-27 has not been re-checked for any program yet (plan §1). Answers that
// used to say "Yes, UGC-entitled" use this dated status instead.
export const RECOGNITION_STATUS_2026_27 =
  "We are re-checking this program against the UGC-DEB entitlement list for the 2026-27 session. Until that check is published here, confirm the program's entitlement on the UGC-DEB portal (deb.ugc.ac.in) and with the university before you enrol.";

const TEMPLATE_CREDITS = new Set(["80-90 credits", "120 credits"]);
const TEMPLATE_WEEKLY_HOURS = new Set(["15-20 hours/week"]);
const TEMPLATE_PLAN_LABELS = new Set(["Full payment (2% off)"]);

type ProgramFactSource = {
  universityId: string;
  credits?: string;
  weeklyHours?: string;
  applicationFee?: string;
  overview?: string;
  feePlans?: Array<[string, string, string]>;
};

function specific(value: string | undefined, templates: Set<string>) {
  const trimmed = value?.trim();
  return trimmed && !templates.has(trimmed) ? trimmed : CONFIRM_WITH_UNIVERSITY;
}

export function programCredits(course: ProgramFactSource) {
  return specific(course.credits, TEMPLATE_CREDITS);
}

export function programWeeklyHours(course: ProgramFactSource) {
  return specific(course.weeklyHours, TEMPLATE_WEEKLY_HOURS);
}

// The ₹500 fee is evidenced for MUJ and SMU domestic applicants only (docs/MUJ_CATEGORY_FEES and
// SMU_CATEGORY_FEES, 3 October 2026); Amity's template said
// "As per university", which is the same as no value.
export function programApplicationFee(course: ProgramFactSource) {
  const value = course.applicationFee?.trim();
  if (!value || value === "As per university") return CONFIRM_WITH_UNIVERSITY;
  if (value === "₹500") return course.universityId === "muj" || course.universityId === "smu" ? "₹500 non-refundable (Indian applicants)" : CONFIRM_WITH_UNIVERSITY;
  return value;
}

// Drops the template "Full payment (2% off)" plan; an administrator can still add a real one.
export function programFeePlans(course: ProgramFactSource) {
  return (course.feePlans || []).filter(([label]) => !TEMPLATE_PLAN_LABELS.has(label.trim()));
}

// The template overview called every program "UGC-entitled"; that is pending for 2026-27.
export function programOverview(course: ProgramFactSource) {
  return (course.overview || "")
    .replace(/,\s*UGC-entitled online degree/, " online degree")
    .replace(/\ba (\d+) months online degree\b/, "a $1-month online degree");
}

const EQUIVALENCE = "An online degree from an entitled program is treated the same as an on-campus degree under the UGC (Open and Distance Learning Programmes and Online Programmes) Regulations, 2020.";
const RECHECK = "Entitlement depends on the university continuing to meet UGC's conditions, so check deb.ugc.ac.in again before you enrol.";

// One wording for the course chip, the Recognition section and the FAQ, driven by the published
// UGC-DEB result (wave 2). Without a result the dated "being re-checked" status stays.
export function recognitionSummary(course: { recognition?: Recognition }) {
  const r = course.recognition;
  if (!r) return { chip: "Program status being re-checked for 2026-27", answer: `${RECOGNITION_STATUS_2026_27} ${EQUIVALENCE}`, recognition: null };
  const checked = formatCheckedDate(r.checkedAt);
  if (r.status === "listed") return {
    chip: `UGC-DEB ${r.academicYear}: listed · checked ${checked}`,
    answer: `Yes, for the ${r.academicYear} session. The program is on the ${r.listName}, under ${r.listedUnder} (checked ${checked}).${r.note ? ` ${r.note}` : ""} ${EQUIVALENCE} ${RECHECK}`,
    recognition: r,
  };
  return {
    chip: `UGC-DEB ${r.academicYear}: confirm the awarding university`,
    answer: `${r.note || "Confirm the awarding university before you enrol."} On the ${r.listName} it appears under ${r.listedUnder} (checked ${checked}). ${RECHECK}`,
    recognition: r,
  };
}
