import { z } from "zod";

export const applicantCategories = ["indian", "nri", "foreign"] as const;
export type ApplicantCategory = typeof applicantCategories[number];
export const qualificationRoutes = ["class12", "diploma10plus3", "bachelor10plus2plus3", "bachelor10plus2plus4", "bachelor10plus3plus3", "otherBachelor"] as const;
export type QualificationRoute = typeof qualificationRoutes[number];

export const qualificationLabels: Record<QualificationRoute, string> = {
  class12: "Class 12 / 10+2 completed",
  diploma10plus3: "Three-year diploma after Class 10 completed",
  bachelor10plus2plus3: "Three-year bachelor's after 10+2",
  bachelor10plus2plus4: "Four-year bachelor's after 10+2",
  bachelor10plus3plus3: "Three-year bachelor's after a 10+3 diploma",
  otherBachelor: "Another bachelor's route or a higher degree",
};
export const applicantLabels: Record<ApplicantCategory, string> = { indian: "Indian applicant", nri: "NRI applicant", foreign: "Foreign applicant" };

const httpUrl = z.url().refine(value => /^https?:\/\//.test(value));
const routeList = z.array(z.enum(qualificationRoutes)).min(1).refine(value => new Set(value).size === value.length);
const marksRule = z.object({ minimum: z.number().min(0).max(100).nullable(), reservedMinimum: z.number().min(0).max(100).nullable(), acceptedRoutes: routeList.optional() }).strict()
  .refine(value => value.reservedMinimum === null || value.minimum !== null && value.reservedMinimum <= value.minimum, "Reserved threshold must not exceed the standard threshold.");
export const eligibilityRulesSchema = z.object({
  checkedAt: z.iso.date(), sourceUrl: httpUrl, sessionLabel: z.string().trim().min(4).max(120),
  acceptedRoutes: routeList,
  requiresBachelorDegree: z.boolean(),
  academicCriteriaComplete: z.boolean(),
  categories: z.object({ indian: marksRule.optional(), nri: marksRule.optional(), foreign: marksRule.optional() }).strict()
    .refine(value => Object.values(value).some(Boolean), "At least one applicant category is required."),
  requiresAiuForEducationOutsideIndia: z.boolean(),
  unresolvedAcademicConditions: z.array(z.string().trim().min(3).max(300)).max(8),
  notes: z.array(z.string().trim().min(3).max(400)).max(8),
}).strict();
export type EligibilityRules = z.infer<typeof eligibilityRulesSchema>;

export type EligibilityAnswers = {
  category: ApplicantCategory;
  qualification: QualificationRoute;
  recognisedInstitution: "yes" | "no" | "unsure";
  marks: number | null;
  reservedCategory: "yes" | "no" | "unsure";
  educationOutsideIndia: "yes" | "no" | "unsure";
  aiuEquivalence: "yes" | "no" | "unsure";
};
export type EligibilityOutcome = "matches" | "confirm" | "does_not_meet";
export type EligibilityResult = { outcome: EligibilityOutcome; reasons: string[]; sourceUrl: string | null; checkedAt: string | null };

export function isCompleteEligibilityRule(rules: EligibilityRules | undefined): boolean {
  return Boolean(rules?.academicCriteriaComplete && rules.unresolvedAcademicConditions.length === 0);
}

export function evaluateEligibility(rules: EligibilityRules | undefined, answers: EligibilityAnswers): EligibilityResult {
  if (!rules) return { outcome: "confirm", reasons: ["No reviewed, structured admission rule is published for this course yet. Check the current program requirements with the university."], sourceUrl: null, checkedAt: null };
  const source = { sourceUrl: rules.sourceUrl, checkedAt: rules.checkedAt };
  const marksRule = rules.categories[answers.category];
  if (!marksRule) return { outcome: "confirm", reasons: [`A reviewed rule for ${applicantLabels[answers.category].toLowerCase()}s is not published for this course.`], ...source };
  const failed: string[] = [];
  const uncertain: string[] = [];
  const matched: string[] = [];
  const acceptedRoutes = marksRule.acceptedRoutes || rules.acceptedRoutes;
  if (rules.requiresBachelorDegree && ["class12", "diploma10plus3"].includes(answers.qualification) && !acceptedRoutes.includes(answers.qualification)) {
    failed.push("The published routes require a completed bachelor's degree; the qualification selected is below that level.");
  } else if (!acceptedRoutes.includes(answers.qualification)) {
    uncertain.push("This qualification route is not expressly listed for your applicant category; ask the university whether it accepts it as equivalent.");
  } else matched.push("Your selected qualification route appears in the published criteria.");
  if (answers.recognisedInstitution !== "yes") uncertain.push("The university must confirm recognition or equivalence of your qualification.");
  if (marksRule.minimum !== null) {
    if (answers.marks === null || !Number.isFinite(answers.marks) || answers.marks < 0 || answers.marks > 100) uncertain.push(`Enter your ${rules.requiresBachelorDegree ? "graduation" : "qualifying Class 12 or diploma"} aggregate percentage; CGPA conversion must be confirmed by the university.`);
    else {
      const threshold = answers.reservedCategory === "yes" && marksRule.reservedMinimum !== null ? marksRule.reservedMinimum : marksRule.minimum;
      if (answers.reservedCategory === "unsure" && marksRule.reservedMinimum !== null && answers.marks < marksRule.minimum && answers.marks >= marksRule.reservedMinimum) uncertain.push(`The standard threshold is ${marksRule.minimum}%; the ${marksRule.reservedMinimum}% reserved-category threshold may apply if the university confirms your category.`);
      else if (answers.marks < threshold) failed.push(`The published minimum is ${threshold}% for the category selected; you entered ${answers.marks}%.`);
      else matched.push(`Your ${answers.marks}% aggregate meets the published ${threshold}% threshold for the category selected.`);
    }
  }
  if (rules.requiresAiuForEducationOutsideIndia) {
    if (answers.educationOutsideIndia === "unsure") uncertain.push("Confirm whether your qualifying education was completed outside India.");
    if (answers.educationOutsideIndia === "yes" && answers.aiuEquivalence !== "yes") uncertain.push("The source requires an AIU equivalence certificate for education completed outside India; confirm or obtain it before applying.");
  }
  if (!rules.academicCriteriaComplete) uncertain.push("The reviewed rule has not yet encoded every academic condition for this program.");
  uncertain.push(...rules.unresolvedAcademicConditions);
  return { outcome: failed.length ? "does_not_meet" : uncertain.length ? "confirm" : "matches", reasons: [...failed, ...uncertain, ...matched], ...source };
}
