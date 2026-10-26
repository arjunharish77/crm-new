import type { CategoryFees } from "@/data/catalog";

// Student-category fees prepared from the 3 October 2026 MUJ/SMU prospectus review
// (docs/MUJ_CATEGORY_FEES_2026-10-03.md, SMU_CATEGORY_FEES_2026-10-03.md). Loading only changes
// the unsaved proposal; an administrator still applies it (next-phase plan §3).
export type PreparedCategoryFees = {
  courseId: string; expectedFee: number; programUrl: string; categoryFees: CategoryFees;
};

export function formatCategoryFee(currency: "INR" | "USD", amount: number) {
  return currency === "INR" ? `₹${amount.toLocaleString("en-IN")}` : `US$${amount.toLocaleString("en-US")}`;
}

export function loadPreparedCategoryFees(content: Record<string, unknown>, draft: PreparedCategoryFees) {
  if (content.fee_inr !== draft.expectedFee) throw new Error("The course fee differs from the prepared Indian-applicant fee. Review the fee first.");
  const data = content.data as Record<string, unknown>;
  const sources = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return { ...content, data: { ...data,
    categoryFees: { ...draft.categoryFees, rows: draft.categoryFees.rows.map(row => ({ ...row })), notes: [...(draft.categoryFees.notes || [])] },
    sourceUrls: [...new Set([...sources, draft.programUrl, draft.categoryFees.sourceUrl])],
    feeReview: { status: "NEEDS_REVIEW", checkedAt: draft.categoryFees.checkedAt, sourceUrl: draft.categoryFees.sourceUrl, notes: [`Base tuition per applicant category compared with ${draft.categoryFees.sourceLabel} and the program fee tab.`] },
  } };
}
