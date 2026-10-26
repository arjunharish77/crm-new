import type { Course, CourseEnrichment, University } from "@/data/catalog";
import { programFeePlans } from "@/lib/program-facts";
import { publicSourceUrls } from "@/lib/source-checks";

export type CostCourse = Course & CourseEnrichment & { university: University };
export type CostChoice = { key: string; label: string; currency: "INR" | "USD" | null; tuition: number | null; perSemester: number | null; semesters: number | null; sourceUrl: string | null; checkedAt: string | null; publishedCategory: boolean };

export function costChoices(course: CostCourse): CostChoice[] {
  if (course.categoryFees?.rows.length) return [
    ...course.categoryFees.rows.map((row, index) => ({
      key: `row-${index}`, label: row.category, currency: row.currency, tuition: row.total,
      perSemester: row.perSemester, semesters: row.semesters,
      sourceUrl: course.categoryFees!.sourceUrl, checkedAt: course.categoryFees!.checkedAt, publishedCategory: true,
    })),
    ...(!course.categoryFees.rows.some(row => /\bNRI\b|non-resident Indian/i.test(row.category)) ? [
      { key: "unlisted-nri", label: "NRI applicants — fee category unconfirmed", currency: null, tuition: null, perSemester: null, semesters: null, sourceUrl: null, checkedAt: null, publishedCategory: false },
    ] : []),
    { key: "unlisted", label: "My applicant category is not listed", currency: null, tuition: null, perSemester: null, semesters: null, sourceUrl: null, checkedAt: null, publishedCategory: false },
  ];
  // The older UGC-DEB notice tables are recognition evidence, never a fee source.
  const sourceUrl = publicSourceUrls([course.feeReview?.sourceUrl, ...(course.sourceUrls || [])].filter((value): value is string => Boolean(value)))
    .find(url => !/deb\.ugc\.ac\.in\/Uploads\/Notices_Upload\//.test(url)) || null;
  return [
    { key: "listed-inr", label: "Listed INR tuition — applicant category unconfirmed", currency: "INR", tuition: course.fee, perSemester: null, semesters: null, sourceUrl, checkedAt: course.feeReview?.checkedAt || null, publishedCategory: false },
    { key: "unlisted", label: "International/NRI or another category — fee not published", currency: null, tuition: null, perSemester: null, semesters: null, sourceUrl: null, checkedAt: null, publishedCategory: false },
  ];
}

export function costEstimate(choice: CostChoice, extra: number) {
  if (choice.tuition === null || !Number.isSafeInteger(extra) || extra < 0 || extra > 10_000_000) return null;
  const scheduleTotal = choice.perSemester !== null && choice.semesters !== null ? choice.perSemester * choice.semesters : null;
  return { planningSubtotal: choice.tuition + extra, scheduleTotal, scheduleDifference: scheduleTotal === null ? null : scheduleTotal - choice.tuition };
}

// Wave 4 A4: the EMI plan's total against paying the university each semester. Only a published INR
// semester schedule counts; otherwise there is nothing to compare. The difference is reported as a
// number, never as a recommendation.
export function semesterComparison(choice: CostChoice | undefined, loanPlanTotal: number) {
  if (!choice || choice.currency !== "INR" || choice.perSemester === null || choice.semesters === null || !Number.isFinite(loanPlanTotal)) return null;
  const scheduleTotal = choice.perSemester * choice.semesters;
  return { perSemester: choice.perSemester, semesters: choice.semesters, scheduleTotal, loanPlanTotal: Math.round(loanPlanTotal), difference: Math.round(loanPlanTotal) - scheduleTotal };
}

// Wave 5 B4 (EMI v2): what paying upfront costs. A reviewed "Full payment" plan counts only once its
// fee correction is published (feeReview) and only for the Indian-applicant fee it was written for;
// otherwise upfront is the listed tuition. The learner may enter a one-time discount the university
// has offered them; nothing is assumed.
export function upfrontRoute(course: CostCourse, choice: CostChoice, discount: number) {
  if (choice.currency !== "INR" || choice.tuition === null || !Number.isFinite(discount) || discount < 0) return null;
  const plan = course.feeReview && choice.tuition === course.fee ? programFeePlans(course).find(([label]) => /^full payment/i.test(label.trim())) : undefined;
  const planAmount = plan ? Number(plan[1].replace(/[^0-9]/g, "")) : NaN;
  const base = Number.isSafeInteger(planAmount) && planAmount > 0 ? planAmount : choice.tuition;
  return { base, total: Math.max(0, base - Math.min(discount, base)), fromPlan: base === planAmount, discount: Math.min(discount, base) };
}

export function inrFeeForEmi(choice: CostChoice): number | null {
  return choice.currency === "INR" ? choice.tuition : null;
}

export function publishedFeeCategory(course: CostCourse, key: string) {
  if (!/^row-\d{1,2}$/.test(key)) return null;
  const fees = course.categoryFees;
  const row = fees?.rows[Number(key.slice(4))];
  return fees && row ? { courseId: course.id, category: row.category, currency: row.currency, sourceUrl: fees.sourceUrl, checkedAt: fees.checkedAt } : null;
}

// A comparison may show course cards for any selected programs, but a numeric
// cross-program verdict requires the university-published category labels and
// currencies to match exactly. No conversion or inferred category mapping.
export function alignedCostComparison(choices: CostChoice[]) {
  if (choices.length < 2 || choices.some(choice => !choice.publishedCategory || choice.tuition === null || !choice.currency)) return false;
  return choices.every(choice => choice.currency === choices[0].currency && choice.label.trim().toLowerCase() === choices[0].label.trim().toLowerCase());
}
