export type PreparedFeeCorrection = {
  courseId: string; expectedFee: number; fee: number; semesterFee: number;
  sourceUrl: string; checkedAt: string; notes: string[];
  // Optional, for corrections where the payment terms are sourced (e.g. the MUJ new-batch fees,
  // 12 October 2026). Without them the loader keeps its cautious default: semester plan only,
  // no numeric EMI and no scholarship rows.
  emi?: string;
  feePlans?: Array<[string, string, string]>;
  highlights?: Array<[string, string]>;
  keepScholarships?: boolean;
};

export function loadPreparedFeeCorrection(content: Record<string, unknown>, correction: PreparedFeeCorrection) {
  if (content.fee_inr !== correction.expectedFee) throw new Error("The proposed fee has changed. Review this correction manually.");
  const data = content.data as Record<string, unknown>;
  const format = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const retained = highlights.filter(row => !Array.isArray(row) || !/^(total fee|emi from|financing)$/i.test(String(row[0]).trim()));
  const sources = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return { ...content, fee_inr: correction.fee, data: { ...data,
    emi: correction.emi ?? "Confirm current financing options",
    feePlans: correction.feePlans ?? [["Semester-wise", format(correction.fee), `${format(correction.semesterFee)} per semester`]],
    highlights: [...retained, ...(correction.highlights ?? [["Total fee", format(correction.fee)]])],
    scholarships: correction.keepScholarships ? data.scholarships : [],
    sourceUrls: [...new Set([...sources, correction.sourceUrl])],
    feeReview: { status: "NEEDS_REVIEW", sourceUrl: correction.sourceUrl, checkedAt: correction.checkedAt, notes: correction.notes },
  } };
}
