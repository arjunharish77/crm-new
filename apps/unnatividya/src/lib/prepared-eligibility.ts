import { updateEditorialField } from "./catalog-editor";

export type PreparedEligibility = {
  courseId: string; checkedAt: string; sourceUrl: string;
  domestic: string; international: string; notes: string[]; foreignApplicantsOnly?: boolean;
};
export function internationalApplicantLabel(draft: PreparedEligibility) {
  return draft.foreignApplicantsOnly ? "Foreign applicants" : "NRI / foreign applicants";
}
export const nriCategoryNote = "Confirm with the university whether Indian or foreign-applicant requirements apply to your nationality, residence and qualifications.";

export function loadPreparedEligibility(content: Record<string, unknown>, draft: PreparedEligibility) {
  const eligibility = `Indian applicants: ${draft.domestic}\n\n${internationalApplicantLabel(draft)}: ${draft.international}${draft.foreignApplicantsOnly ? `\n\nNRI applicants: ${nriCategoryNote}` : ""}`;
  const updated = updateEditorialField(content, "eligibility", eligibility, true);
  const data = updated.data as Record<string, unknown>;
  const sources = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return { ...updated, data: { ...data,
    sourceUrls: [...new Set([...sources, draft.sourceUrl])],
    eligibilityReview: { status: "NEEDS_REVIEW", checkedAt: draft.checkedAt, sourceUrl: draft.sourceUrl, notes: draft.notes },
  } };
}
