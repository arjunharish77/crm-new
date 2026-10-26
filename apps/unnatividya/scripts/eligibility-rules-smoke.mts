import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eligibilityRulesSchema, evaluateEligibility, isCompleteEligibilityRule, type EligibilityAnswers } from "../src/lib/eligibility-rules";
import { updateEditorialField } from "../src/lib/catalog-editor";
import { buildCatalogSnapshot, catalogReader } from "../src/lib/catalog-snapshot";

const drafts = JSON.parse(readFileSync(join(import.meta.dirname, "../src/data/prepared-eligibility-rules.json"), "utf8"));
assert.deepEqual(drafts.map((draft: { courseId: string }) => draft.courseId), ["mba-muj", "mba-smu", "bba-muj", "bba-smu", "bcom-muj", "bcom-smu", "ba-smu"]);
const muj = eligibilityRulesSchema.parse(drafts[0].rules);
const smu = eligibilityRulesSchema.parse(drafts[1].rules);
const bbaMuj = eligibilityRulesSchema.parse(drafts[2].rules);
const bbaSmu = eligibilityRulesSchema.parse(drafts[3].rules);
const bcomMuj = eligibilityRulesSchema.parse(drafts[4].rules);
const bcomSmu = eligibilityRulesSchema.parse(drafts[5].rules);
const baSmu = eligibilityRulesSchema.parse(drafts[6].rules);
const profile: EligibilityAnswers = {
  category: "indian", qualification: "bachelor10plus2plus3", recognisedInstitution: "yes",
  marks: 52, reservedCategory: "no", educationOutsideIndia: "no", aiuEquivalence: "unsure",
};
const result = (rule: typeof muj | undefined, changes: Partial<EligibilityAnswers> = {}) => evaluateEligibility(rule, { ...profile, ...changes });

assert.equal(result(muj).outcome, "matches");
assert.equal(result(muj, { marks: 47, reservedCategory: "yes" }).outcome, "matches");
assert.equal(result(muj, { marks: 47, reservedCategory: "no" }).outcome, "does_not_meet");
assert.equal(result(muj, { marks: 47, reservedCategory: "unsure" }).outcome, "confirm");
assert.equal(result(muj, { category: "nri", marks: 47, reservedCategory: "yes" }).outcome, "does_not_meet");
assert.equal(result(smu, { category: "foreign", marks: 47, reservedCategory: "yes", educationOutsideIndia: "yes", aiuEquivalence: "yes" }).outcome, "matches");
assert.equal(result(smu, { category: "foreign", marks: 47, reservedCategory: "unsure", educationOutsideIndia: "yes", aiuEquivalence: "yes" }).outcome, "confirm");
assert.equal(result(smu, { category: "foreign", educationOutsideIndia: "yes", aiuEquivalence: "no" }).outcome, "confirm");
assert.equal(result(muj, { qualification: "class12", marks: 90 }).outcome, "does_not_meet");
assert.equal(result(muj, { qualification: "otherBachelor", marks: 90 }).outcome, "confirm");
assert.equal(result(muj, { marks: null }).outcome, "confirm");
assert.equal(result(muj, { recognisedInstitution: "unsure" }).outcome, "confirm");
assert.equal(result(muj, { educationOutsideIndia: "unsure" }).outcome, "confirm");
assert.equal(result(undefined).outcome, "confirm");
assert.equal(result({ ...muj, academicCriteriaComplete: false }).outcome, "confirm");
assert.equal(isCompleteEligibilityRule(muj), true);
assert.equal(isCompleteEligibilityRule({ ...muj, academicCriteriaComplete: false }), false);
assert.equal(result({ ...muj, categories: { indian: muj.categories.indian } }, { category: "foreign" }).outcome, "confirm");
assert.equal(result(bbaMuj, { qualification: "class12", marks: null }).outcome, "matches");
assert.equal(result(bbaMuj, { qualification: "diploma10plus3", marks: null }).outcome, "matches");
assert.equal(result(bbaMuj, { category: "nri", qualification: "class12", marks: null, educationOutsideIndia: "yes", aiuEquivalence: "yes" }).outcome, "matches");
assert.equal(result(bbaMuj, { category: "foreign", qualification: "class12", marks: null, educationOutsideIndia: "yes", aiuEquivalence: "no" }).outcome, "confirm");
assert.equal(result(bbaMuj, { category: "nri", qualification: "diploma10plus3", marks: null }).outcome, "confirm");
assert.equal(result(bbaSmu, { qualification: "diploma10plus3", marks: null }).outcome, "matches");
assert.equal(result(bbaSmu, { category: "foreign", qualification: "class12", marks: null }).outcome, "confirm");
assert.equal(result(bbaSmu, { qualification: "class12", educationOutsideIndia: "yes", aiuEquivalence: "no" }).outcome, "confirm");
for (const rule of [bcomMuj, bcomSmu]) {
  assert.equal(result(rule, { qualification: "class12", marks: null }).outcome, "matches");
  assert.equal(result(rule, { qualification: "diploma10plus3", marks: null }).outcome, "matches");
  assert.equal(result(rule, { category: "nri", qualification: "class12", marks: null, educationOutsideIndia: "yes", aiuEquivalence: "yes" }).outcome, "matches");
  assert.equal(result(rule, { category: "foreign", qualification: "diploma10plus3", marks: null }).outcome, "confirm");
  assert.equal(result(rule, { category: "foreign", qualification: "class12", marks: null, educationOutsideIndia: "yes", aiuEquivalence: "no" }).outcome, "confirm");
}
assert.equal(result(baSmu, { qualification: "class12", marks: null }).outcome, "matches");
assert.equal(result(baSmu, { qualification: "diploma10plus3", marks: null }).outcome, "confirm");
assert.equal(result(baSmu, { category: "nri", qualification: "class12", marks: null }).outcome, "confirm");
assert.equal(result(baSmu, { category: "foreign", qualification: "class12", marks: null }).outcome, "confirm");
assert.equal(eligibilityRulesSchema.safeParse({ ...bbaMuj, categories: { indian: { minimum: null, reservedMinimum: null, acceptedRoutes: [] } } }).success, false);
const changed = updateEditorialField({ data: { eligibility: "Old text", eligibilityRules: muj } }, "eligibility", "New text", true);
assert.equal((changed.data as Record<string, unknown>).eligibilityRules, undefined, "Changing the eligibility paragraph invalidates structured rules");
assert.equal(eligibilityRulesSchema.safeParse({ ...muj, acceptedRoutes: [] }).success, false);
assert.equal(eligibilityRulesSchema.safeParse({ ...muj, categories: { indian: { minimum: 50, reservedMinimum: 55 } } }).success, false);
const seed = JSON.parse(readFileSync(join(import.meta.dirname, "catalog-export.json"), "utf8"));
const universities = seed.universities.map((row: Record<string, unknown>) => ({ ...row, short_name: row.shortName, status: "PUBLISHED", is_published: true }));
const courses = seed.courses.map((row: Record<string, unknown>) => ({ ...row, short_name: row.shortName, university_id: row.universityId, program_type: row.programType, ugc_approved: row.ugcApproved, fee_inr: row.fee, status: "PUBLISHED", is_published: true }));
const withRule = courses.map((row: Record<string, unknown>) => row.id === "mba-muj" ? { ...row, data: { ...(row.data as object), eligibilityRules: muj } } : row);
const published = buildCatalogSnapshot(universities, withRule);
assert.deepEqual(published.issues, []);
assert.equal(catalogReader(published.snapshot!).courseWithUniversity(catalogReader(published.snapshot!).courses.find(course => course.id === "mba-muj")!).eligibilityRules?.checkedAt, muj.checkedAt);
const malformed = buildCatalogSnapshot(universities, withRule.map((row: Record<string, unknown>) => row.id === "mba-muj" ? { ...row, data: { ...(row.data as object), eligibilityRules: { ...muj, acceptedRoutes: [] } } } : row));
assert.equal(malformed.snapshot, null, "A malformed published rule must fail catalog validation");
console.log("PASS seven sourced MBA/BBA/BCom/BA eligibility pilot rules, category routes, held cases, marks and AIU checks");
