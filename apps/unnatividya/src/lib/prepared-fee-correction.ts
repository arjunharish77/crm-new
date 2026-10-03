export type PreparedFeeCorrection = {
  courseId: string; expectedFee: number; fee: number; semesterFee: number;
  sourceUrl: string; checkedAt: string; notes: string[];
};

export function loadPreparedFeeCorrection(content: Record<string, unknown>, correction: PreparedFeeCorrection) {
  if (content.fee_inr !== correction.expectedFee) throw new Error("The proposed fee has changed. Review this correction manually.");
  const data = content.data as Record<string, unknown>;
  const format = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const retained = highlights.filter(row => !Array.isArray(row) || !/^(total fee|emi from|financing)$/i.test(String(row[0]).trim()));
  const sources = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return { ...content, fee_inr: correction.fee, data: { ...data,
    emi: "Confirm current financing options",
    feePlans: [["Semester-wise", format(correction.fee), `${format(correction.semesterFee)} per semester`]],
    highlights: [...retained, ["Total fee", format(correction.fee)]],
    scholarships: [],
    sourceUrls: [...new Set([...sources, correction.sourceUrl])],
    feeReview: { status: "NEEDS_REVIEW", sourceUrl: correction.sourceUrl, checkedAt: correction.checkedAt, notes: correction.notes },
  } };
}
