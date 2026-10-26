import assert from "node:assert/strict";
import { courseWithUniversity, courses } from "../src/data/catalog";
import { alignedCostComparison, costChoices, costEstimate, inrFeeForEmi, publishedFeeCategory, semesterComparison } from "../src/lib/total-cost";

const base = courseWithUniversity(courses.find(course => course.id === "mba-muj")!);
const unpublished = { ...base, categoryFees: undefined, feeReview: undefined };
const fallback = costChoices(unpublished);
assert.equal(fallback[0].tuition, unpublished.fee);
assert.equal(fallback[0].publishedCategory, false);
assert.equal(fallback[0].perSemester, null);
assert.equal(fallback[1].tuition, null, "Unpublished international/NRI fees must not reuse INR tuition");
assert.equal(costEstimate(fallback[1], 0), null);
assert.equal(inrFeeForEmi(fallback[1]), null);
assert.equal(alignedCostComparison([fallback[0], fallback[0]]), false);

const published = { ...base, categoryFees: {
  checkedAt: "2026-10-03", sourceUrl: "https://example.edu/fees", sourceLabel: "University prospectus",
  rows: [
    { category: "Indian applicants", currency: "INR" as const, total: 180000, perSemester: 90001, semesters: 2 },
    { category: "NRI applicants", currency: "USD" as const, total: 3000, perSemester: 1500, semesters: 2 },
  ],
} };
const choices = costChoices(published);
assert.equal(choices[1].currency, "USD");
assert.equal(choices[1].tuition, 3000);
assert.equal(inrFeeForEmi(choices[0]), 180000);
assert.equal(inrFeeForEmi(choices[1]), null, "USD tuition cannot prefill the INR EMI calculator");
assert.equal(choices[2].tuition, null);
const withoutNri = costChoices({ ...published, categoryFees: { ...published.categoryFees, rows: [published.categoryFees.rows[0], { category: "International applicants", currency: "USD", total: 1500, perSemester: 375, semesters: 4 }] } });
assert.equal(withoutNri.find(choice => choice.key === "unlisted-nri")?.tuition, null, "An international price must not be assigned to an unconfirmed NRI category");
assert.equal(publishedFeeCategory({ ...published, categoryFees: { ...published.categoryFees, rows: [published.categoryFees.rows[0]] } }, "unlisted-nri"), null);
assert.deepEqual(publishedFeeCategory(published, "row-1"), { courseId: published.id, category: "NRI applicants", currency: "USD", sourceUrl: "https://example.edu/fees", checkedAt: "2026-10-03" });
assert.equal(publishedFeeCategory(published, "row-8"), null);
assert.equal(publishedFeeCategory(unpublished, "row-0"), null);
assert.deepEqual(costEstimate(choices[0], 500), { planningSubtotal: 180500, scheduleTotal: 180002, scheduleDifference: 2 });
assert.deepEqual(costEstimate(choices[1], 100), { planningSubtotal: 3100, scheduleTotal: 3000, scheduleDifference: 0 });
assert.equal(costEstimate(choices[1], -1), null);
assert.equal(alignedCostComparison([choices[0], choices[0]]), true);
assert.equal(alignedCostComparison([choices[0], choices[1]]), false);
assert.equal(alignedCostComparison([choices[0], { ...choices[0], label: "Domestic applicants" }]), false);
console.log("PASS total-cost category isolation, unpublished-fee handling, schedule discrepancies and comparison alignment");

// Wave 4 A4: the EMI plan versus a published INR semester schedule.
const scheduleChoice = { key: "row-0", label: "Indian", currency: "INR" as const, tuition: 180000, perSemester: 45000, semesters: 4, sourceUrl: "https://example.org/prospectus.pdf", checkedAt: "2026-10-03", publishedCategory: true };
assert.deepEqual(semesterComparison(scheduleChoice, 196000.4), { perSemester: 45000, semesters: 4, scheduleTotal: 180000, loanPlanTotal: 196000, difference: 16000 });
assert.equal(semesterComparison({ ...scheduleChoice, perSemester: null }, 190000), null, "No schedule, no comparison");
assert.equal(semesterComparison({ ...scheduleChoice, currency: "USD" }, 190000), null, "Only INR schedules compare with an INR loan");
assert.equal(semesterComparison(undefined, 190000), null);
console.log("PASS semester comparison checks");

